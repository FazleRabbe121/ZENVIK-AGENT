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
const STORAGE_KEY_GUEST_TOKEN = 'zenvik_guest_session_token_v1';
const STORAGE_KEY_GUEST_CLIENT_ID = 'zenvik_guest_client_id_v1';

export interface MultiUserProfileSummary {
  userId: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
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
  hasReadRepliesScope?: boolean;
  hasRefreshToken?: boolean;
  status: 'connected' | 'expired' | 'revoked' | 'disconnected';
  connectedAt?: string;
  updatedAt?: string;
  sentTodayCount: number;
  dailyLimit: number;
  lastError: string | null;
}

export interface UserGeminiBYOKSettings {
  hasPersonalKey: boolean;
  keyMasked: string | null;
  selectedModel: string;
  supportedModels: string[];
  status: 'unconfigured' | 'connected' | 'invalid' | 'quota_exceeded' | 'error';
  lastVerifiedAt: string | null;
  lastError: string | null;
  usageRequests: number;
  usageErrors: number;
  lastUsedAt: string | null;
  updatedAt: string | null;
  effectiveSource: 'user_byok' | 'server_default' | 'unconfigured';
  serverFallbackAvailable: boolean;
}

export interface GuestSessionStatus {
  active: boolean;
  expired: boolean;
  guestId?: string;
  guestToken?: string;
  createdAt?: string;
  expiresAt?: string;
  durationSeconds?: number;
  remainingSeconds: number;
  emailsSentCount?: number;
  maxEmailsPerSession?: number;
  aiRequestsCount?: number;
  ownerGmailConfigured?: boolean;
  ownerGeminiConfigured?: boolean;
  disclosure?: string;
  error?: string;
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
  geminiSettings?: UserGeminiBYOKSettings;
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
      // Registered session supersedes any guest session
      localStorage.removeItem(STORAGE_KEY_GUEST_TOKEN);
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_EMAIL);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_NAME);
    }
  } catch {}
}

export function getGuestSessionToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_GUEST_TOKEN);
  } catch {
    return null;
  }
}

export function setGuestSessionToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY_GUEST_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEY_GUEST_TOKEN);
    }
  } catch {}
}

export function clearGuestSessionToken() {
  setGuestSessionToken(null);
}

export function isGuestSessionActive(): boolean {
  return Boolean(getGuestSessionToken()) && !getMultiUserSessionToken();
}

export function getOrCreateGuestClientId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY_GUEST_CLIENT_ID);
    if (existing && existing.length >= 8) return existing;
    const generated = `zvk_gc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(STORAGE_KEY_GUEST_CLIENT_ID, generated);
    return generated;
  } catch {
    return `zvk_gc_ephemeral_${Date.now().toString(36)}`;
  }
}

function handlePotentialGuestExpiry(res: Response, data: any): void {
  if (
    res.status === 401 &&
    (data?.errorCode === 'GUEST_SESSION_EXPIRED' || data?.guestExpired === true)
  ) {
    clearGuestSessionToken();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('zenvik_guest_expired', {
          detail: {
            message:
              data?.error ||
              'Your temporary Guest Preview session has expired. Please Sign Up or Log In to continue.',
          },
        })
      );
    }
  }
}

export async function getAuthHeaders(forceFirebaseSync = false): Promise<Record<string, string>> {
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

  const guestToken = getGuestSessionToken();
  if (guestToken) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${guestToken}`,
      'X-Zenvik-Guest-Token': guestToken,
    };
  }

  return { 'Content-Type': 'application/json' };
}

// ============================================================================
// AUTHENTICATION API (Register, Login, Google Sign-In, Logout, Reset, Verify)
// ============================================================================

export async function registerMultiUserAccount(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{
  sessionToken: string;
  user: MultiUserProfileSummary;
  verificationRequired?: boolean;
  verificationToken?: string;
}> {
  clearUserScopedLocalStorage();
  clearGuestSessionToken();
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
  clearGuestSessionToken();
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

export async function signInWithGoogleUnified(params: {
  idToken?: string;
  accessToken?: string;
  email?: string;
  displayName?: string;
  uid?: string;
}): Promise<{ sessionToken: string; user: MultiUserProfileSummary; isNewUser?: boolean }> {
  clearUserScopedLocalStorage();
  clearGuestSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.idToken) {
    headers.Authorization = `Bearer ${params.idToken}`;
  }
  const res = await fetch('/api/multiuser/auth/google-signin', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Google Sign-In failed');
  }
  setMultiUserSessionToken(data.sessionToken, data.user.email, data.user.displayName);
  return data;
}

export function logoutMultiUserSession() {
  clearUserScopedLocalStorage();
  setMultiUserSessionToken(null);
  clearGuestSessionToken();
  setCachedGoogleToken(null);
}

export async function logoutMultiUserAccount(): Promise<void> {
  const token = getMultiUserSessionToken();
  const guestToken = getGuestSessionToken();
  try {
    if (token) {
      await fetch('/api/multiuser/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    } else if (guestToken) {
      await fetch('/api/multiuser/guest/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guestToken}`,
          'X-Zenvik-Guest-Token': guestToken,
        },
      });
    }
  } catch {
    // Always clear client session state even if network call fails
  }
  logoutMultiUserSession();
}

export async function requestPasswordReset(email: string): Promise<{
  success: boolean;
  message: string;
  resetToken?: string;
  expiresAt?: string;
}> {
  const res = await fetch('/api/multiuser/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Could not initiate password reset');
  }
  return data;
}

export async function confirmPasswordReset(params: {
  token: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/multiuser/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Password reset failed');
  }
  return data;
}

export async function verifyUserEmail(token: string): Promise<{
  success: boolean;
  emailVerified: boolean;
  message: string;
}> {
  const res = await fetch('/api/multiuser/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Email verification failed');
  }
  return data;
}

export async function resendEmailVerification(): Promise<{
  success: boolean;
  alreadyVerified?: boolean;
  verificationToken?: string;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/auth/resend-verification', {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Could not resend verification');
  }
  return data;
}

// ============================================================================
// SERVER-ENFORCED TEMPORARY GUEST MODE (2–4 Min Window, Anti-Bypass)
// ============================================================================

export async function startGuestSession(): Promise<GuestSessionStatus> {
  const clientId = getOrCreateGuestClientId();
  const existingToken = getGuestSessionToken();
  const res = await fetch('/api/multiuser/guest/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(existingToken ? { 'X-Zenvik-Guest-Token': existingToken } : {}),
    },
    body: JSON.stringify({ clientId }),
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.error || data.message || 'Could not start Guest Preview session');
  }
  if (data.guestToken) {
    setGuestSessionToken(data.guestToken);
  }
  return data;
}

export async function fetchGuestSessionStatus(): Promise<GuestSessionStatus> {
  const guestToken = getGuestSessionToken();
  if (!guestToken) {
    return { active: false, expired: true, remainingSeconds: 0 };
  }
  const res = await fetch('/api/multiuser/guest/status', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${guestToken}`,
      'X-Zenvik-Guest-Token': guestToken,
    },
  });
  const data = await res.json().catch(() => ({ active: false, expired: true, remainingSeconds: 0 }));
  if (!res.ok || data.expired || !data.active) {
    handlePotentialGuestExpiry(res, { ...data, guestExpired: true, errorCode: 'GUEST_SESSION_EXPIRED' });
    return {
      active: false,
      expired: true,
      remainingSeconds: 0,
      error: data.error || 'Your Guest Preview session has expired.',
    };
  }
  return data;
}

export async function endGuestSession(): Promise<void> {
  const guestToken = getGuestSessionToken();
  if (guestToken) {
    try {
      await fetch('/api/multiuser/guest/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guestToken}`,
          'X-Zenvik-Guest-Token': guestToken,
        },
      });
    } catch {}
  }
  clearGuestSessionToken();
}

// ============================================================================
// WORKSPACE & USER DATA
// ============================================================================

export async function fetchMultiUserWorkspace(): Promise<MultiUserWorkspaceOverview> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/me', { headers });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to delete CV');
  }
  return data;
}

// ============================================================================
// INDIVIDUAL PER-USER GMAIL OAUTH 2.0 (AUTHORIZATION CODE FLOW + ANDROID BRIDGE)
// ============================================================================

export async function fetchGmailOAuthConfig(): Promise<{
  isBackendOAuthConfigured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  redirectUri: string;
  allowedRedirectUris?: string[];
  requiredScope: string;
  optionalReadScope?: string;
  requiredEnvVars: string[];
}> {
  const res = await fetch('/api/gmail/oauth/config');
  return res.json();
}

export async function fetchGmailStatus(): Promise<PersonalGmailConnectionStatus> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/gmail/status', { headers });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to verify Gmail connection status');
  }
  return data;
}

export async function startBackendGmailOAuthFlow(options?: {
  includeReadReplies?: boolean;
  platform?: 'web' | 'android';
  appDeepLink?: string;
}): Promise<{
  authorizationUrl: string;
  state: string;
  requestedScopes: string[];
  redirectUri: string;
  platform: 'web' | 'android';
}> {
  const headers = await getAuthHeaders();
  const isAndroidBridge = Boolean(
    typeof window !== 'undefined' && (window as any).ZenvikAndroid?.openOAuthUrl
  );
  const platform = options?.platform || (isAndroidBridge ? 'android' : 'web');
  const redirectUri = `${window.location.origin}/api/gmail/oauth/callback`;
  const res = await fetch('/api/gmail/oauth/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      redirectUri,
      includeReadReplies: Boolean(options?.includeReadReplies),
      platform,
      appDeepLink: options?.appDeepLink || (platform === 'android' ? 'com.ccd.abetteryou://oauth/callback' : undefined),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Could not start Google OAuth flow');
  }
  return data;
}

export async function connectPersonalGmailViaPopupOrBackend(options?: {
  includeReadReplies?: boolean;
}): Promise<{
  connected: boolean;
  gmailAddress: string;
  mode: 'oauth_code_flow' | 'firebase_token_fallback';
  scopes?: string[];
  hasRefreshToken?: boolean;
}> {
  const config = await fetchGmailOAuthConfig().catch(() => ({
    isBackendOAuthConfigured: false,
    hasClientId: false,
    hasClientSecret: false,
    redirectUri: '',
    requiredScope: 'https://www.googleapis.com/auth/gmail.send',
    requiredEnvVars: [],
  }));

  // 1. PRIMARY PRODUCTION PATH: True Google OAuth 2.0 Authorization Code Flow with Server-Side Token Exchange
  if (config.isBackendOAuthConfigured) {
    const isAndroidBridge = Boolean(
      typeof window !== 'undefined' && (window as any).ZenvikAndroid?.openOAuthUrl
    );
    const startData = await startBackendGmailOAuthFlow({
      includeReadReplies: Boolean(options?.includeReadReplies),
      platform: isAndroidBridge ? 'android' : 'web',
    });

    if (isAndroidBridge) {
      // Launch Chrome Custom Tabs / external system browser (never WebView!) and await deep-link return
      const androidResult = await new Promise<{ ok: boolean; gmailAddress?: string; error?: string }>((resolve) => {
        let settled = false;
        const finish = (result: { ok: boolean; gmailAddress?: string; error?: string }) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('zenvik_android_oauth_callback', onDeepLink as EventListener);
          document.removeEventListener('visibilitychange', onVisibilityReturn);
          clearTimeout(timeoutId);
          resolve(result);
        };

        const onDeepLink = (ev: CustomEvent<any>) => {
          const detail = ev?.detail || {};
          if (detail.status === 'success' || detail.connected) {
            finish({ ok: true, gmailAddress: detail.gmailAddress || '' });
          } else {
            finish({ ok: false, error: detail.error || 'Google authorization was cancelled or denied.' });
          }
        };

        const onVisibilityReturn = async () => {
          if (document.visibilityState === 'visible') {
            try {
              const verified = await fetchGmailStatus();
              if (verified.connected && verified.gmailAddress) {
                finish({ ok: true, gmailAddress: verified.gmailAddress });
              }
            } catch {}
          }
        };

        const timeoutId = setTimeout(() => {
          finish({ ok: false, error: 'Gmail authorization timed out waiting for browser return. Please try again.' });
        }, 180_000);

        window.addEventListener('zenvik_android_oauth_callback', onDeepLink as EventListener);
        document.addEventListener('visibilitychange', onVisibilityReturn);
        (window as any).ZenvikAndroid.openOAuthUrl(startData.authorizationUrl);
      });

      if (!androidResult.ok) {
        throw new Error(androidResult.error || 'Gmail OAuth flow failed on Android.');
      }

      const verified = await fetchGmailStatus();
      if (!verified.connected || !verified.gmailAddress) {
        throw new Error('Backend verification did not confirm a connected Gmail account.');
      }
      syncActiveGmailSenderInMemory({ email: verified.gmailAddress });
      return {
        connected: true,
        gmailAddress: verified.gmailAddress,
        mode: 'oauth_code_flow',
        scopes: verified.scopes,
        hasRefreshToken: verified.hasRefreshToken,
      };
    }

    // Standard Web OAuth 2.0 Popup -> Backend Callback -> postMessage + live /api/gmail/status verification
    const popupWidth = 540;
    const popupHeight = 700;
    const left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));
    const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
    const popup = window.open(
      startData.authorizationUrl,
      'zenvik_gmail_oauth_popup',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      throw new Error(
        'Popup blocked by your browser. Please allow popups for this site and click Connect Personal Gmail again.'
      );
    }

    const oauthResult = await new Promise<{ ok: boolean; gmailAddress?: string; error?: string }>((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; gmailAddress?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(pollCloseInterval);
        clearTimeout(timeoutId);
        resolve(result);
      };

      const onMessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'ZENVIK_GMAIL_OAUTH_SUCCESS') {
          finish({ ok: true, gmailAddress: msg.gmailAddress || '' });
        } else if (msg.type === 'ZENVIK_GMAIL_OAUTH_ERROR') {
          finish({ ok: false, error: msg.error || 'Google authorization was cancelled or denied.' });
        }
      };

      const pollCloseInterval = setInterval(async () => {
        if (popup.closed) {
          // Give postMessage a tiny beat, then verify real backend status
          setTimeout(async () => {
            if (settled) return;
            try {
              const verified = await fetchGmailStatus();
              if (verified.connected && verified.gmailAddress) {
                finish({ ok: true, gmailAddress: verified.gmailAddress });
                return;
              }
            } catch {}
            finish({ ok: false, error: 'Google sign-in popup was closed before authorization completed.' });
          }, 500);
        }
      }, 600);

      const timeoutId = setTimeout(() => {
        finish({ ok: false, error: 'Google OAuth authorization timed out. Please try again.' });
      }, 180_000);

      window.addEventListener('message', onMessage);
    });

    if (!oauthResult.ok) {
      throw new Error(oauthResult.error || 'Gmail OAuth authorization failed.');
    }

    // Always verify actual persisted connection from backend before showing Connected
    const verified = await fetchGmailStatus();
    if (!verified.connected || !verified.gmailAddress) {
      throw new Error('Gmail authorization finished, but backend verification could not confirm active connection.');
    }
    syncActiveGmailSenderInMemory({ email: verified.gmailAddress });
    return {
      connected: true,
      gmailAddress: verified.gmailAddress,
      mode: 'oauth_code_flow',
      scopes: verified.scopes,
      hasRefreshToken: verified.hasRefreshToken,
    };
  }

  // 2. FALLBACK ONLY WHEN SERVER GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ARE NOT YET CONFIGURED
  const popupRes = await authorizePersonalGmailSendWithPopup();
  if (!popupRes || !popupRes.accessToken || !popupRes.user?.email) {
    throw new Error(
      'Google authorization was cancelled or did not grant Gmail send permission. Please allow popups and select your Gmail account.'
    );
  }

  const gmailAddress = popupRes.user.email.trim().toLowerCase();

  syncActiveGmailSenderInMemory({
    email: gmailAddress,
    displayName: popupRes.user.displayName || undefined,
    accessToken: popupRes.accessToken,
    expiresInSeconds: 3600,
  });

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
    throw new Error(
      bindData.message || bindData.error || 'Connected Gmail in browser, but failed to verify & encrypt token on server.'
    );
  }
  return {
    connected: true,
    gmailAddress: bindData.gmailAddress || gmailAddress,
    mode: 'firebase_token_fallback',
    scopes: bindData.scopes || ['https://www.googleapis.com/auth/gmail.send'],
    hasRefreshToken: false,
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
    throw new Error(data.message || data.error || 'Failed to disconnect Gmail');
  }
}

export async function fetchGmailReplies(maxResults = 20): Promise<{
  success: boolean;
  gmailAddress?: string;
  replies: Array<{
    id: string;
    threadId?: string;
    from: string;
    subject: string;
    date: string;
    snippet: string;
  }>;
  errorCode?: string;
  message?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/gmail/replies?maxResults=${encodeURIComponent(String(maxResults))}`, {
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Could not sync Gmail replies');
  }
  return data;
}

export async function sendPersonalGmailEmails(params: {
  recipients: Array<{ recipientEmail: string; company?: string; position?: string }> | string[];
  subject: string;
  coverLetter: string;
  cvId?: string;
  inlineCv?: { id?: string; fileName: string; pdfBase64: string } | null;
  coverLetterPdf?: { fileName: string; pdfBase64: string } | null;
  guestOwnerAccountConfirmed?: boolean;
}) {
  const headers = await getAuthHeaders();
  const liveGmailToken = getCachedGoogleToken();
  if (liveGmailToken && !isGuestSessionActive()) {
    headers['X-Gmail-Access-Token'] = liveGmailToken;
  }

  let effectiveInlineCv = params.inlineCv || null;
  if (!effectiveInlineCv && !params.cvId) {
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
      guestOwnerAccountConfirmed: Boolean(params.guestOwnerAccountConfirmed),
    }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 207) {
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Retry failed');
  }
  return data;
}

// ============================================================================
// PER-USER GEMINI API (BYOK) SETTINGS & TESTING
// ============================================================================

export async function fetchUserGeminiSettings(): Promise<UserGeminiBYOKSettings> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/ai/settings', { headers });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to load AI settings');
  }
  return data;
}

export async function saveUserGeminiSettings(params: {
  apiKey?: string;
  selectedModel?: string;
  verifyNow?: boolean;
}): Promise<{
  success: boolean;
  verified?: boolean;
  latencyMs?: number;
  settings: UserGeminiBYOKSettings;
  message?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/ai/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to save Gemini API settings');
  }
  return data;
}

export async function deleteUserGeminiKey(): Promise<{
  success: boolean;
  settings: UserGeminiBYOKSettings;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/ai/key', {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to remove Gemini API key');
  }
  return data;
}

export async function testUserGeminiKey(params?: {
  apiKey?: string;
  selectedModel?: string;
}): Promise<{
  success: boolean;
  valid: boolean;
  source?: string;
  model?: string;
  latencyMs?: number;
  message?: string;
  error?: string;
  errorCode?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/ai/test', {
    method: 'POST',
    headers,
    body: JSON.stringify(params || {}),
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Gemini API key verification failed');
  }
  return data;
}

// ============================================================================
// ACCOUNT DELETION, ADMIN, CV LIBRARY, PREFERENCES, SETUP WIZARD & HEALTH
// ============================================================================

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
    geminiByok?: UserGeminiBYOKSettings;
    openAI?: any;
    openai?: any;
    cvStorage: any;
    jobSearchEngine: any;
    backendConnectivity?: any;
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
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to sync CV Gallery with backend');
  }
  return data;
}

export async function fetchMultiUserJobPreferences() {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/job-preferences', { headers });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Job search failed');
  }
  return data;
}

export async function fetchConnectedServicesStatus(): Promise<ConnectedServicesDashboardResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/multiuser/connected-services', { headers });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
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
    handlePotentialGuestExpiry(res, data);
    throw new Error(data.message || data.error || 'Failed to complete setup wizard');
  }
  return data;
}

export async function generateWithBackendGemini(params: {
  prompt: string;
  operation?: string;
  systemInstruction?: string;
  model?: string;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/gemini/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    handlePotentialGuestExpiry(res, data);
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

export async function fetchBackendHealthDiagnostics() {
  const startedAt = performance.now();
  const res = await fetch('/api/health');
  const data = await res.json();
  return {
    ...data,
    clientLatencyMs: Math.round(performance.now() - startedAt),
    httpOk: res.ok,
  };
}
