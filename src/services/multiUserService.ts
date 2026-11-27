import {
  auth,
  authorizePersonalGmailSendWithPopup,
  clearUserScopedLocalStorage,
  getCachedGoogleToken,
  setCachedGoogleToken,
} from './firebase';
import { syncActiveGmailSenderInMemory } from './gmailService';
import { resolveCVAttachmentPayloadAsync } from './cvStorage';

const STORAGE_KEY_SESSION_TOKEN = 'zenvik_multiuser_session_token_v1';
const STORAGE_KEY_ACTIVE_EMAIL = 'zenvik_multiuser_active_email_v1';
const STORAGE_KEY_ACTIVE_NAME = 'zenvik_multiuser_active_name_v1';

export interface MultiUserProfileSummary {
  userId: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  defaultEmailSubject: string;
  defaultCoverLetter: string;
  dailySendLimit: number;
  minDelaySeconds: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface PersonalGmailConnectionStatus {
  connected: boolean;
  gmailAddress: string | null;
  scopes: string[];
  status: 'connected' | 'expired' | 'revoked' | 'disconnected';
  connectedAt?: string;
  updatedAt?: string;
  sentTodayCount: number;
  dailyLimit: number;
  lastError: string | null;
}

export interface MultiUserCVMetadata {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MultiUserEmailRecord {
  id: string;
  userId: string;
  senderGmail: string;
  recipientEmail: string;
  company?: string;
  position?: string;
  subject: string;
  coverLetterSnippet: string;
  cvId: string;
  cvFilename: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  httpStatus?: number;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  errorReason?: string | null;
  retryCount: number;
  timestamp: string;
  updatedAt: string;
}

export interface MultiUserWorkspaceOverview {
  user: MultiUserProfileSummary;
  gmailConnection: PersonalGmailConnectionStatus;
  cvs: MultiUserCVMetadata[];
  applications: any[];
  emailHistory: MultiUserEmailRecord[];
}

export function getMultiUserSessionToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_SESSION_TOKEN);
  } catch {
    return null;
  }
}

export function setMultiUserSessionToken(token: string | null, email?: string, displayName?: string) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, token);
      if (email) localStorage.setItem(STORAGE_KEY_ACTIVE_EMAIL, email);
      if (displayName) localStorage.setItem(STORAGE_KEY_ACTIVE_NAME, displayName);
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_EMAIL);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_NAME);
    }
  } catch {}
}

async function getAuthHeaders(forceFirebaseSync = false): Promise<Record<string, string>> {
  const sessionToken = forceFirebaseSync ? null : getMultiUserSessionToken();
  const activeEmail = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE_EMAIL)?.toLowerCase() || '';
    } catch {
      return '';
    }
  })();
  const currentFirebaseEmail = auth.currentUser?.email?.toLowerCase() || '';
  const emailMatches = !currentFirebaseEmail || !activeEmail || currentFirebaseEmail === activeEmail;

  if (sessionToken && emailMatches) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    };
  }

  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken(forceFirebaseSync);
      const syncRes = await fetch('/api/multiuser/auth/firebase-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          displayName: auth.currentUser.displayName,
          idToken,
        }),
      });
      if (syncRes.ok) {
        const data = await syncRes.json();
        if (data.sessionToken) {
          setMultiUserSessionToken(data.sessionToken, data.user?.email, data.user?.displayName);
          return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.sessionToken}`,
          };
        }
      }
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      };
    } catch {}
  }

  if (sessionToken) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    };
  }

  return { 'Content-Type': 'application/json' };
}

export async function registerMultiUserAccount(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ sessionToken: string; user: MultiUserProfileSummary }> {
  clearUserScopedLocalStorage();
  const res = await fetch('/api/multiuser/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Registration failed');
  }
  setMultiUserSessionToken(data.sessionToken, data.user.email, data.user.displayName);
  return data;
}

export async function loginMultiUserAccount(params: {
  email: string;
  password: string;
}): Promise<{ sessionToken: string; user: MultiUserProfileSummary }> {
  clearUserScopedLocalStorage();
  const res = await fetch('/api/multiuser/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Login failed');
  }
  setMultiUserSessionToken(data.sessionToken, data.user.email, data.user.displayName);
  return data;
}

export function logoutMultiUserSession() {
  clearUserScopedLocalStorage();
  setMultiUserSessionToken(null);
}

export async function fetchMultiUserWorkspace(): Promise<MultiUserWorkspaceOverview> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/me', { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to load user workspace');
  }
  return data;
}

export async function updateMultiUserSettings(params: {
  displayName?: string;
  defaultEmailSubject?: string;
  defaultCoverLetter?: string;
  dailySendLimit?: number;
  minDelaySeconds?: number;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/me/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to update settings');
  }
  return data;
}

export async function uploadMultiUserCV(params: {
  title: string;
  fileName: string;
  pdfBase64: string;
  isDefault?: boolean;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/cvs', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to upload CV');
  }
  return data.cv as MultiUserCVMetadata;
}

export async function deleteMultiUserCV(cvId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/multiuser/cvs/${encodeURIComponent(cvId)}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to delete CV');
  }
  return data;
}

export async function fetchGmailOAuthConfig(): Promise<{
  isBackendOAuthConfigured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  redirectUri: string;
  requiredScope: string;
  requiredEnvVars: string[];
}> {
  const res = await fetch('/api/gmail/oauth/config');
  return res.json();
}

export async function startBackendGmailOAuthFlow(): Promise<{
  authorizationUrl: string;
  state: string;
  requestedScopes: string[];
  redirectUri: string;
}> {
  const headers = await getAuthHeaders();
  const redirectUri = `${window.location.origin}/api/gmail/oauth/callback`;
  const res = await fetch('/api/gmail/oauth/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({ redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Could not start Google OAuth flow');
  }
  return data;
}

export async function connectPersonalGmailViaPopupOrBackend(): Promise<{
  connected: boolean;
  gmailAddress: string;
}> {
  // Always use client-side Firebase Auth popup for Google Workspace OAuth (works cleanly in iframe/Cloud Run without redirect_uri_mismatch)
  const popupRes = await authorizePersonalGmailSendWithPopup();
  if (!popupRes || !popupRes.accessToken || !popupRes.user?.email) {
    throw new Error(
      'Google authorization was cancelled or did not grant Gmail send permission. Please allow popups and select your Gmail account.'
    );
  }

  const gmailAddress = popupRes.user.email.trim().toLowerCase();

  // Immediately update in-memory Gmail state so Apply by Email, Bulk Queue, and Dispatch Modal are connected too
  syncActiveGmailSenderInMemory({
    email: gmailAddress,
    displayName: popupRes.user.displayName || undefined,
    accessToken: popupRes.accessToken,
    expiresInSeconds: 3600,
  });

  // Sync Firebase user into backend workspace and bind Gmail connection on server
  const headers = await getAuthHeaders(true);
  const bindRes = await fetch('/api/gmail/oauth/connect-token', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      accessToken: popupRes.accessToken,
      gmailAddress,
      expiresIn: 3600,
    }),
  });
  const bindData = await bindRes.json().catch(() => ({}));
  if (!bindRes.ok) {
    throw new Error(bindData.message || bindData.error || 'Connected Gmail in browser, but failed to sync with workspace server.');
  }
  return {
    connected: true,
    gmailAddress: bindData.gmailAddress || gmailAddress,
  };
}

export async function disconnectPersonalGmail(): Promise<void> {
  setCachedGoogleToken(null);
  const headers = await getAuthHeaders();
  const res = await fetch('/api/gmail/disconnect', {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to disconnect Gmail');
  }
}

export async function sendPersonalGmailEmails(params: {
  recipients: Array<{ recipientEmail: string; company?: string; position?: string }> | string[];
  subject: string;
  coverLetter: string;
  cvId?: string;
  inlineCv?: { id?: string; fileName: string; pdfBase64: string } | null;
}) {
  const headers = await getAuthHeaders();
  const liveGmailToken = getCachedGoogleToken();
  if (liveGmailToken) {
    headers['X-Gmail-Access-Token'] = liveGmailToken;
  }

  // Auto-resolve local Central CV Library attachment if caller did not specify a backend CV or inline CV
  let effectiveInlineCv = params.inlineCv || null;
  if (!effectiveInlineCv) {
    try {
      const localCv = await resolveCVAttachmentPayloadAsync();
      if (localCv?.base64) {
        effectiveInlineCv = {
          id: localCv.cvDocument?.id || 'local-default-cv',
          fileName: localCv.filename || 'Candidate_CV.pdf',
          pdfBase64: localCv.base64,
        };
      }
    } catch {}
  }

  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...params,
      inlineCv: effectiveInlineCv,
      userConfirmedSend: true,
    }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 207) {
    throw new Error(data.message || data.error || 'Failed to send email');
  }
  return data;
}

export async function sendPersonalGmailTestEmail(params?: {
  recipientEmail?: string;
  subject?: string;
  coverLetter?: string;
  cvId?: string;
}) {
  const headers = await getAuthHeaders();
  const liveGmailToken = getCachedGoogleToken();
  if (liveGmailToken) {
    headers['X-Gmail-Access-Token'] = liveGmailToken;
  }
  const res = await fetch('/api/gmail/send-test', {
    method: 'POST',
    headers,
    body: JSON.stringify(params || {}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Test email failed');
  }
  return data;
}

export async function retryFailedPersonalGmail(historyId: string) {
  const headers = await getAuthHeaders();
  const liveGmailToken = getCachedGoogleToken();
  if (liveGmailToken) {
    headers['X-Gmail-Access-Token'] = liveGmailToken;
  }
  const res = await fetch(`/api/gmail/retry/${encodeURIComponent(historyId)}`, {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Retry failed');
  }
  return data;
}

export async function deleteOwnMultiUserAccount() {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/me', {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Account deletion failed');
  }
  logoutMultiUserSession();
  return data;
}

export async function fetchMultiUserAdminOverview() {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/admin/overview', { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Admin access denied');
  }
  return data;
}

export async function updateMultiUserAccountStatus(
  targetUserId: string,
  payload: { status?: 'active' | 'suspended'; role?: 'user' | 'admin' }
) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/multiuser/admin/users/${encodeURIComponent(targetUserId)}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to update account status');
  }
  return data;
}

export async function adminDeleteMultiUserAccount(targetUserId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/multiuser/admin/users/${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to delete user account');
  }
  return data;
}

export async function selectDefaultMultiUserCV(cvId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/multiuser/cvs/${encodeURIComponent(cvId)}/select`, {
    method: 'PATCH',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to select default CV');
  }
  return data;
}

export async function downloadMultiUserCV(cvId: string, fallbackFileName: string = 'CV.pdf') {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/multiuser/cvs/${encodeURIComponent(cvId)}/download`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to download CV');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackFileName;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ConnectedServicesDashboardResponse {
  timestamp?: string;
  services: {
    googleAccount: any;
    gmail: any;
    geminiAI?: any;
    geminiAi?: any;
    openAI?: any;
    openai?: any;
    cvStorage: any;
    jobSearchEngine: any;
  };
}

export interface AdminAIConfigState {
  geminiEnabled: boolean;
  openaiEnabled: boolean;
  defaultProvider: 'Gemini' | 'OpenAI' | 'gemini' | 'openai';
  geminiModel?: string;
  defaultGeminiModel: string;
  openaiModel?: string;
  defaultOpenAIModel: string;
  fallbackEnabled: boolean;
  totalGeminiRequests: number;
  totalGeminiErrors: number;
  totalOpenAIRequests: number;
  totalOpenAIErrors: number;
  quotaWarning?: string | null;
  lastError?: string | null;
  serverEnvStatus?: {
    geminiKeyPresent: boolean;
    openaiKeyPresent: boolean;
  };
}

export interface MultiUserJobPreferences {
  userId?: string;
  preferredCountries?: string[];
  countries?: string[];
  preferredCities?: string[];
  jobCategories?: string[];
  professions?: string[];
  employmentTypes?: string[];
  sponsorshipRequired?: boolean;
  relocationSupport?: boolean;
  updatedAt?: string;
}

export async function syncLocalCVGalleryToBackend(
  cvs?: Array<{
    id?: string;
    title: string;
    targetRole?: string;
    fileName?: string;
    pdfBase64: string;
    isDefault?: boolean;
  }>
) {
  let payloadCvs = cvs;
  if (!payloadCvs) {
    try {
      const raw = localStorage.getItem('ccd_cv_library_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      const list: any[] = Array.isArray(parsed) ? parsed : parsed?.cvs || [];
      payloadCvs = list
        .filter((c: any) => Boolean(c.pdfDataUrl || c.base64Data))
        .map((c: any, idx: number) => ({
          id: c.id,
          title: c.name || c.title || 'Professional CV',
          targetRole: c.targetRole || 'Hospitality',
          fileName: c.fileName || `${(c.name || 'CV').replace(/\s+/g, '_')}.pdf`,
          pdfBase64: c.pdfDataUrl || c.base64Data,
          isDefault: Boolean(c.isDefault) || idx === 0,
        }));
    } catch {
      payloadCvs = [];
    }
  }
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/cvs/sync-gallery', {
    method: 'POST',
    headers,
    body: JSON.stringify({ cvs: payloadCvs }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to sync CV Gallery with backend');
  }
  return data;
}

export async function fetchMultiUserJobPreferences() {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/job-preferences', { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch job preferences');
  }
  return data;
}

export async function updateMultiUserJobPreferences(preferences: {
  preferredCountries?: string[];
  countries?: string[];
  preferredCities?: string[];
  jobCategories?: string[];
  professions?: string[];
  employmentTypes?: string[];
  sponsorshipRequired?: boolean;
  relocationSupport?: boolean;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/job-preferences', {
    method: 'PUT',
    headers,
    body: JSON.stringify(preferences),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to save job preferences');
  }
  return data;
}

export async function searchMultiUserJobs(params?: {
  country?: string;
  city?: string;
  profession?: string;
  query?: string;
  market?: string;
  sponsorshipOnly?: boolean;
  usePreferences?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
  refresh?: boolean;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/jobs/search', {
    method: 'POST',
    headers,
    body: JSON.stringify(params || {}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Job search failed');
  }
  return data;
}

export async function fetchConnectedServicesStatus(): Promise<ConnectedServicesDashboardResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/connected-services', { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to load connected services');
  }
  if (data?.services) {
    data.services.geminiAI = data.services.geminiAI || data.services.geminiAi;
    data.services.openAI = data.services.openAI || data.services.openai;
  }
  return data;
}

export async function fetchSetupWizardState() {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/setup-wizard', { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to load setup wizard');
  }
  return data;
}

export async function completeSetupWizard(payload: {
  headline?: string;
  phone?: string;
  nationality?: string;
  currentCountry?: string;
  gmailSkipped?: boolean;
  preferences?: {
    preferredCountries?: string[];
    preferredCities?: string[];
    jobCategories?: string[];
    employmentTypes?: string[];
    sponsorshipRequired?: boolean;
    relocationSupport?: boolean;
  };
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/setup-wizard/complete', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to complete setup wizard');
  }
  return data;
}

export async function generateWithBackendGemini(params: {
  prompt: string;
  operation?: string;
  systemInstruction?: string;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/gemini/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Gemini AI generation failed');
  }
  return data;
}

export async function fetchAdminAIConfig(): Promise<AdminAIConfigState> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/admin/ai-config', { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch Admin AI configuration');
  }
  return data.config || data;
}

export async function updateAdminAIConfig(payload: Partial<AdminAIConfigState>): Promise<AdminAIConfigState> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/admin/ai-config', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to update Admin AI configuration');
  }
  return data.config || data;
}

export async function testAdminAIProviders(provider: 'gemini' | 'openai' | 'all' = 'all') {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/admin/ai-test', {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'AI provider test failed');
  }
  return data;
}

export async function fetchSystemAuditLogs(limit: number = 50) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/multiuser/admin/logs?limit=${limit}`, { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch system audit logs');
  }
  return data.logs || data;
}

export async function fetchCloudRunHealth() {
  const res = await fetch('/api/health');
  return res.json();
}


