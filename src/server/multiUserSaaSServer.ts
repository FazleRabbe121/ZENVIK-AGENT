import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { jobDatabaseEngine, PersistentJobRecord } from './jobDatabase.js';
import { aiCooperativeEngine } from './aiCooperativeEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DEFAULT_DB_FILE = path.join(DATA_DIR, 'multiuser_saas_db.json');

export const GMAIL_SEND_ONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const OAUTH_EMAIL_IDENTITY_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
export const PRIMARY_ADMIN_EMAIL = 'fazle.rabbe.doc@gmail.com';
export const LEGACY_ADMIN_EMAIL = 'fazlerabbe905@gmail.com';
export const ADMIN_EMAIL_ALLOWLIST = new Set([
  PRIMARY_ADMIN_EMAIL.toLowerCase(),
  LEGACY_ADMIN_EMAIL.toLowerCase(),
]);
export const SUPPORTED_GEMINI_BYOK_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-neon',
  'gemini-4-carbon',
] as const;
export const DEFAULT_GEMINI_BYOK_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_GUEST_DURATION_SECONDS = 180;
export const MIN_GUEST_DURATION_SECONDS = 120;
export const MAX_GUEST_DURATION_SECONDS = 240;
export const MAX_GUEST_EMAILS_PER_SESSION = 3;

export const SUPPORTED_JOB_CATEGORIES = [
  'Bartender',
  'Barista',
  'Waiter',
  'Maintenance Electrician',
  'Plumber',
  'Hospitality & F&B',
  'Chef & Culinary',
  'Hotel Front Office',
] as const;

export type UserAccountStatus = 'active' | 'suspended' | 'deleted';
export type UserRole = 'user' | 'admin';

export interface EncryptedSecretPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  algorithm: 'aes-256-gcm';
}

export interface StoredUserGmailConnection {
  userId: string;
  gmailAddress: string;
  scopes: string[];
  encryptedAccessToken: EncryptedSecretPayload | null;
  encryptedRefreshToken: EncryptedSecretPayload | null;
  accessTokenExpiresAt: number;
  connectedAt: string;
  updatedAt: string;
  status: 'connected' | 'expired' | 'revoked' | 'disconnected';
  lastError?: string | null;
  sentTodayCount: number;
  dailyQuotaDate: string;
  dailyLimit: number;
}

export interface MultiUserCVItem {
  id: string;
  userId: string;
  title: string;
  targetRole?: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  pdfBase64: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MultiUserJobApplication {
  id: string;
  userId: string;
  jobId?: string;
  company: string;
  position: string;
  recipientEmail: string;
  subject: string;
  coverLetter: string;
  cvId: string;
  cvTitle: string;
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed';
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  senderGmail?: string | null;
  errorReason?: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
}

export interface MultiUserEmailHistoryRecord {
  id: string;
  userId: string;
  applicationId?: string | null;
  dedupKey: string;
  senderGmail: string;
  recipientEmail: string;
  company?: string;
  position?: string;
  subject: string;
  coverLetterSnippet: string;
  cvId: string;
  cvFilename: string;
  cvContentHash: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  httpStatus?: number;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  providerResponse?: string | null;
  errorReason?: string | null;
  retryCount: number;
  timestamp: string;
  updatedAt: string;
}

export interface MultiUserAccountRecord {
  userId: string;
  email: string;
  displayName: string;
  passwordHash?: string | null;
  passwordSalt?: string | null;
  authProvider: 'email' | 'google' | 'firebase';
  firebaseUid?: string | null;
  role: UserRole;
  status: UserAccountStatus;
  defaultEmailSubject: string;
  defaultCoverLetter: string;
  dailySendLimit: number;
  minDelaySeconds: number;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  passwordChangedAt?: number | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface MultiUserProfileRecord {
  userId: string;
  headline: string;
  phone: string;
  nationality: string;
  currentCountry: string;
  setupWizardCompleted: boolean;
  setupCompletedAt?: string | null;
  updatedAt: string;
}

export interface MultiUserJobPreferences {
  userId: string;
  preferredCountries: string[];
  preferredCities: string[];
  jobCategories: string[];
  employmentTypes: string[];
  sponsorshipRequired: boolean;
  relocationSupport: boolean;
  updatedAt: string;
}

export interface MultiUserSavedJobRecord {
  id: string;
  userId: string;
  jobId: string;
  employer: string;
  title: string;
  country: string;
  city: string;
  location: string;
  applicationUrl: string;
  recipientEmail?: string;
  sponsorshipStatus: string;
  verificationStatus: string;
  savedAt: string;
}

export interface MultiUserAIHistoryRecord {
  id: string;
  userId: string;
  provider: 'Gemini' | 'OpenAI' | 'DeterministicFallback';
  model: string;
  operation: string;
  promptSummary: string;
  responseSummary: string;
  latencyMs: number;
  status: 'success' | 'fallback' | 'error';
  timestamp: string;
}

export interface MultiUserNotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

export interface AdminAISettingsConfig {
  geminiEnabled: boolean;
  openaiEnabled: boolean;
  grokEnabled?: boolean;
  defaultProvider: 'Gemini' | 'OpenAI' | 'Grok';
  geminiModel: string;
  openaiModel: string;
  grokModel?: string;
  fallbackEnabled: boolean;
  rateLimitPerMinute: number;
  activeJobSources: string[];
  updatedAt: string;
}

export interface SystemAuditLogRecord {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'security';
  category: string;
  actorUserId?: string | null;
  message: string;
}

interface PendingOAuthStateRecord {
  stateId: string;
  userId: string;
  redirectUri: string;
  requestedScopes?: string[];
  platform?: 'web' | 'android';
  appDeepLink?: string | null;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface StoredUserGeminiConfig {
  userId: string;
  encryptedApiKey: EncryptedSecretPayload | null;
  keyMasked: string | null;
  selectedModel: string;
  status: 'connected' | 'invalid' | 'quota_exceeded' | 'unconfigured';
  verifiedAt?: string | null;
  lastTestedAt?: string | null;
  lastUsedAt?: string | null;
  lastError?: string | null;
  totalRequests: number;
  totalErrors: number;
  updatedAt: string;
}

export interface PasswordResetTokenRecord {
  tokenHash: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface EmailVerificationTokenRecord {
  tokenHash: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface GuestEmailHistoryEntry {
  id: string;
  recipientEmail: string;
  subject: string;
  company?: string;
  position?: string;
  senderMode: 'owner_guest_relay';
  gmailMessageId?: string | null;
  status: 'sent' | 'failed';
  errorReason?: string | null;
  timestamp: string;
}

export interface StoredGuestSessionRecord {
  guestId: string;
  clientFingerprint: string;
  createdAt: number;
  expiresAt: number;
  durationSeconds: number;
  status: 'active' | 'expired' | 'ended';
  emailsSentCount: number;
  aiRequestsCount: number;
  lastActiveAt: number;
  emailHistory: GuestEmailHistoryEntry[];
}

export interface GuestCooldownRecord {
  guestId: string;
  createdAt: number;
  expiresAt: number;
  cooldownUntil: number;
}

export interface MultiUserSaaSDatabaseSchema {
  version: number;
  users: Record<string, MultiUserAccountRecord>;
  userProfilesByUser: Record<string, MultiUserProfileRecord>;
  jobPreferencesByUser: Record<string, MultiUserJobPreferences>;
  gmailConnections: Record<string, StoredUserGmailConnection>;
  geminiConfigsByUser: Record<string, StoredUserGeminiConfig>;
  cvsByUser: Record<string, MultiUserCVItem[]>;
  savedJobsByUser: Record<string, MultiUserSavedJobRecord[]>;
  applicationsByUser: Record<string, MultiUserJobApplication[]>;
  emailHistoryByUser: Record<string, MultiUserEmailHistoryRecord[]>;
  aiHistoryByUser: Record<string, MultiUserAIHistoryRecord[]>;
  notificationsByUser: Record<string, MultiUserNotificationRecord[]>;
  pendingOAuthStates: Record<string, PendingOAuthStateRecord>;
  revokedSessionJtis: Record<string, number>;
  passwordResetTokens: Record<string, PasswordResetTokenRecord>;
  emailVerificationTokens: Record<string, EmailVerificationTokenRecord>;
  guestSessions: Record<string, StoredGuestSessionRecord>;
  guestCooldownsByFingerprint: Record<string, GuestCooldownRecord>;
  adminSettings: AdminAISettingsConfig;
  systemLogs: SystemAuditLogRecord[];
  systemStats: {
    totalRegistrations: number;
    totalEmailsSent: number;
    totalEmailsFailed: number;
    totalOAuthConnections: number;
    totalAuthErrors: number;
    totalAiRequests: number;
    lastUpdatedAt: string;
  };
}

export interface AuthenticatedRequestUser {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserAccountStatus;
}

export interface AuthenticatedGuestSession {
  guestId: string;
  createdAt: number;
  expiresAt: number;
  remainingSeconds: number;
}

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedRequestUser;
      guestSession?: AuthenticatedGuestSession;
      authTokenJti?: string;
      authTokenExp?: number;
      authTokenIat?: number;
    }
  }
}

// ============================================================================
// 1. AES-256-GCM TOKEN ENCRYPTION AT REST
// ============================================================================

let cachedRuntimeFallbackSecret: string | null = null;

function getOrCreateRuntimeFallbackSecret(): string {
  if (cachedRuntimeFallbackSecret) return cachedRuntimeFallbackSecret;
  const secretFile = path.join(DATA_DIR, '.zenvik_runtime_secret');
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) {
        cachedRuntimeFallbackSecret = existing;
        return existing;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    cachedRuntimeFallbackSecret = generated;
    return generated;
  } catch {
    cachedRuntimeFallbackSecret = crypto.randomBytes(32).toString('hex');
    return cachedRuntimeFallbackSecret;
  }
}

function getDerivedEncryptionKey(secretOverride?: string): Buffer {
  const rawSecret =
    secretOverride ||
    process.env.TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.AGENT_SCHEDULER_SECRET?.trim() ||
    getOrCreateRuntimeFallbackSecret();
  return crypto.createHash('sha256').update(String(rawSecret), 'utf8').digest();
}

export function encryptTokenAtRest(plaintext: string, secretOverride?: string): EncryptedSecretPayload {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Cannot encrypt an empty token payload.');
  }
  const key = getDerivedEncryptionKey(secretOverride);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: 1,
    algorithm: 'aes-256-gcm',
  };
}

export function decryptTokenAtRest(payload: EncryptedSecretPayload | null | undefined, secretOverride?: string): string | null {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    return null;
  }
  try {
    const key = getDerivedEncryptionKey(secretOverride);
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const encrypted = Buffer.from(payload.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// ============================================================================
// 2. PASSWORD HASHING & SESSION TOKEN SIGNING
// ============================================================================

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, hash?: string | null, salt?: string | null): boolean {
  if (!hash || !salt) return false;
  const computed = hashPassword(password, salt).hash;
  const bufA = Buffer.from(computed, 'hex');
  const bufB = Buffer.from(hash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function issueSessionToken(user: {
  userId: string;
  email: string;
  role: UserRole;
  expiresInMs?: number;
}): string {
  const payload = {
    sub: user.userId,
    email: user.email.toLowerCase(),
    role: user.role,
    iat: Date.now(),
    exp: Date.now() + (user.expiresInMs ?? 7 * 24 * 60 * 60 * 1000),
    jti: crypto.randomBytes(8).toString('hex'),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getDerivedEncryptionKey())
    .update(encodedPayload)
    .digest('base64url');
  return `zvk.${encodedPayload}.${sig}`;
}

export function verifySessionToken(token: string): {
  userId: string;
  email: string;
  role: UserRole;
  jti?: string;
  iat?: number;
  exp?: number;
} | null {
  if (!token || !token.startsWith('zvk.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encodedPayload, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getDerivedEncryptionKey())
    .update(encodedPayload)
    .digest('base64url');
  const bufA = Buffer.from(providedSig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!parsed.sub || !parsed.email || !parsed.exp || Date.now() > Number(parsed.exp)) {
      return null;
    }
    return {
      userId: String(parsed.sub),
      email: String(parsed.email).toLowerCase(),
      role: parsed.role === 'admin' ? 'admin' : 'user',
      jti: parsed.jti ? String(parsed.jti) : undefined,
      iat: typeof parsed.iat === 'number' ? parsed.iat : undefined,
      exp: Number(parsed.exp),
    };
  } catch {
    return null;
  }
}

export function issueGuestSessionToken(params: { guestId: string; expiresAt: number }): string {
  const payload = {
    gid: params.guestId,
    role: 'guest',
    iat: Date.now(),
    exp: params.expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getDerivedEncryptionKey())
    .update(`guest:${encodedPayload}`)
    .digest('base64url');
  return `gst.${encodedPayload}.${sig}`;
}

export function verifyGuestSessionToken(token: string): {
  guestId: string;
  exp: number;
  expired: boolean;
} | null {
  if (!token || !token.startsWith('gst.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encodedPayload, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getDerivedEncryptionKey())
    .update(`guest:${encodedPayload}`)
    .digest('base64url');
  const bufA = Buffer.from(providedSig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!parsed.gid || !parsed.exp) return null;
    const exp = Number(parsed.exp);
    return {
      guestId: String(parsed.gid),
      exp,
      expired: Date.now() >= exp,
    };
  } catch {
    return null;
  }
}

export function maskApiKey(rawKey: string): string {
  const clean = String(rawKey || '').trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedFirebaseCerts: Record<string, string> = {};
let cachedFirebaseCertsExpiresAt = 0;

async function fetchFirebasePublicCerts(): Promise<Record<string, string>> {
  if (Date.now() < cachedFirebaseCertsExpiresAt && Object.keys(cachedFirebaseCerts).length > 0) {
    return cachedFirebaseCerts;
  }
  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Unable to fetch Firebase public certificates (HTTP ${res.status})`);
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.min(3600, Math.max(60, parseInt(maxAgeMatch[1], 10))) : 900;
  cachedFirebaseCerts = certs;
  cachedFirebaseCertsExpiresAt = Date.now() + maxAgeSec * 1000;
  return certs;
}

/**
 * Cryptographically verifies a Firebase Auth RS256 ID token JWT against Google's official X.509 certificates.
 * Rejects unsigned, forged, expired, or wrong-project tokens.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
  name?: string;
} | null> {
  try {
    if (!idToken || typeof idToken !== 'string') return null;
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || !header.kid) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const expectedProjectId = (process.env.FIREBASE_PROJECT_ID || (firebaseConfig as any).projectId || '').trim();
    const nowSec = Math.floor(Date.now() / 1000);

    if (!payload.sub || typeof payload.sub !== 'string' || !payload.email || typeof payload.email !== 'string') {
      return null;
    }
    if (expectedProjectId) {
      if (payload.aud !== expectedProjectId) return null;
      if (payload.iss !== `https://securetoken.google.com/${expectedProjectId}`) return null;
    }
    if (!payload.exp || nowSec >= Number(payload.exp)) return null;
    if (payload.iat && Number(payload.iat) > nowSec + 300) return null;

    const certs = await fetchFirebasePublicCerts();
    const pemCert = certs[String(header.kid)];
    if (!pemCert) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const signatureValid = verifier.verify(pemCert, Buffer.from(encodedSignature, 'base64url'));
    if (!signatureValid) return null;

    return {
      uid: String(payload.sub),
      email: String(payload.email).toLowerCase(),
      name: payload.name ? String(payload.name) : undefined,
    };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// 3. PERSISTENT STORAGE ENGINE (Isolated Per-User Store)
// ============================================================================

export class MultiUserSaaSStorage {
  private dbFilePath: string;
  private data: MultiUserSaaSDatabaseSchema;

  constructor(customDbFilePath?: string) {
    this.dbFilePath = customDbFilePath || DEFAULT_DB_FILE;
    this.data = this.load();
  }

  private getInitialSchema(): MultiUserSaaSDatabaseSchema {
    const now = new Date().toISOString();
    const ownerUserId = 'usr_owner_fazle_rabbi';
    return {
      version: 2,
      users: {
        [ownerUserId]: {
          userId: ownerUserId,
          email: PRIMARY_ADMIN_EMAIL,
          displayName: 'Fazle Rabbi (Owner & Admin)',
          authProvider: 'google',
          role: 'admin',
          status: 'active',
          defaultEmailSubject: 'Job Application — Experienced Hospitality Professional',
          defaultCoverLetter: 'Dear Hiring Manager,\n\nPlease find attached my CV for your consideration.\n\nBest regards,\nFazle Rabbi',
          dailySendLimit: 40,
          minDelaySeconds: 45,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        },
      },
      userProfilesByUser: {
        [ownerUserId]: {
          userId: ownerUserId,
          headline: 'Bartender & Barista · Hospitality & Visa Sponsorship Profile',
          phone: '',
          nationality: 'Bangladesh',
          currentCountry: 'Cyprus',
          setupWizardCompleted: true,
          setupCompletedAt: now,
          updatedAt: now,
        },
      },
      jobPreferencesByUser: {
        [ownerUserId]: {
          userId: ownerUserId,
          preferredCountries: ['United Kingdom', 'Cyprus', 'Malta', 'Croatia', 'Switzerland', 'Austria', 'Italy'],
          preferredCities: ['London', 'Limassol', 'Paphos', 'Valletta', 'Dubrovnik'],
          jobCategories: ['Bartender', 'Barista', 'Waiter', 'Hospitality & F&B'],
          employmentTypes: ['Full-Time', 'Seasonal', 'Visa Sponsored'],
          sponsorshipRequired: true,
          relocationSupport: true,
          updatedAt: now,
        },
      },
      gmailConnections: {},
      geminiConfigsByUser: {},
      cvsByUser: {},
      savedJobsByUser: {},
      applicationsByUser: {},
      emailHistoryByUser: {},
      aiHistoryByUser: {},
      notificationsByUser: {},
      pendingOAuthStates: {},
      revokedSessionJtis: {},
      passwordResetTokens: {},
      emailVerificationTokens: {},
      guestSessions: {},
      guestCooldownsByFingerprint: {},
      adminSettings: {
        geminiEnabled: true,
        openaiEnabled: true,
        grokEnabled: true,
        defaultProvider: 'Gemini',
        geminiModel: 'gemini-4-hydrogen',
        openaiModel: 'gpt-4o-mini',
        grokModel: 'grok-2-latest',
        fallbackEnabled: true,
        rateLimitPerMinute: 240,
        activeJobSources: [
          'official_employer_portals',
          'eures_network',
          'hosco_hospitality',
          'linkedin_jobs',
          'indeed_global',
          'glassdoor_careers',
        ],
        updatedAt: now,
      },
      systemLogs: [
        {
          id: `log_${crypto.randomBytes(6).toString('hex')}`,
          timestamp: now,
          level: 'info',
          category: 'system_boot',
          actorUserId: ownerUserId,
          message: 'ZENVIK Multi-User SaaS & Personal Gmail Engine initialized.',
        },
      ],
      systemStats: {
        totalRegistrations: 1,
        totalEmailsSent: 0,
        totalEmailsFailed: 0,
        totalOAuthConnections: 0,
        totalAuthErrors: 0,
        totalAiRequests: 0,
        lastUpdatedAt: now,
      },
    };
  }

  private load(): MultiUserSaaSDatabaseSchema {
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        const init = this.getInitialSchema();
        return {
          ...init,
          ...parsed,
          users: { ...init.users, ...(parsed.users || {}) },
          userProfilesByUser: { ...init.userProfilesByUser, ...(parsed.userProfilesByUser || {}) },
          jobPreferencesByUser: { ...init.jobPreferencesByUser, ...(parsed.jobPreferencesByUser || {}) },
          gmailConnections: parsed.gmailConnections || {},
          geminiConfigsByUser: parsed.geminiConfigsByUser || {},
          cvsByUser: parsed.cvsByUser || {},
          savedJobsByUser: parsed.savedJobsByUser || {},
          applicationsByUser: parsed.applicationsByUser || {},
          emailHistoryByUser: parsed.emailHistoryByUser || {},
          aiHistoryByUser: parsed.aiHistoryByUser || {},
          notificationsByUser: parsed.notificationsByUser || {},
          pendingOAuthStates: parsed.pendingOAuthStates || {},
          revokedSessionJtis: parsed.revokedSessionJtis || {},
          passwordResetTokens: parsed.passwordResetTokens || {},
          emailVerificationTokens: parsed.emailVerificationTokens || {},
          guestSessions: parsed.guestSessions || {},
          guestCooldownsByFingerprint: parsed.guestCooldownsByFingerprint || {},
          adminSettings: { ...init.adminSettings, ...(parsed.adminSettings || {}) },
          systemLogs: Array.isArray(parsed.systemLogs) ? parsed.systemLogs.slice(0, 200) : init.systemLogs,
          systemStats: { ...init.systemStats, ...(parsed.systemStats || {}) },
        };
      }
    } catch (err) {
      console.warn('MultiUserSaaSStorage load fallback:', err);
    }
    const initial = this.getInitialSchema();
    this.save(initial);
    return initial;
  }

  public appendLog(
    level: 'info' | 'warn' | 'error' | 'security',
    category: string,
    message: string,
    actorUserId?: string | null
  ): void {
    this.data.systemLogs.unshift({
      id: `log_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      actorUserId: actorUserId || null,
      message,
    });
    if (this.data.systemLogs.length > 200) {
      this.data.systemLogs = this.data.systemLogs.slice(0, 200);
    }
  }

  public pushNotification(
    userId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ): void {
    const list = this.data.notificationsByUser[userId] || [];
    list.unshift({
      id: `notif_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
    });
    if (list.length > 50) {
      this.data.notificationsByUser[userId] = list.slice(0, 50);
    } else {
      this.data.notificationsByUser[userId] = list;
    }
  }

  public save(nextData?: MultiUserSaaSDatabaseSchema): void {
    if (nextData) {
      this.data = nextData;
    }
    this.data.systemStats.lastUpdatedAt = new Date().toISOString();
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbFilePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.warn('MultiUserSaaSStorage write warning:', err);
    }
  }

  public reloadFromDisk(): void {
    this.data = this.load();
  }

  public getState(): MultiUserSaaSDatabaseSchema {
    return this.data;
  }

  public findUserByEmail(email: string): MultiUserAccountRecord | null {
    const clean = email.trim().toLowerCase();
    for (const u of Object.values(this.data.users)) {
      if (u.email.toLowerCase() === clean && u.status !== 'deleted') {
        return u;
      }
    }
    return null;
  }

  public findUserById(userId: string): MultiUserAccountRecord | null {
    const user = this.data.users[userId];
    if (!user || user.status === 'deleted') return null;
    return user;
  }

  public upsertFirebaseUser(params: {
    uid: string;
    email: string;
    displayName?: string;
  }): MultiUserAccountRecord {
    const cleanEmail = params.email.trim().toLowerCase();
    const existingById = this.data.users[params.uid];
    const existingByEmail = this.findUserByEmail(cleanEmail);
    const now = new Date().toISOString();
    const isAdmin = ADMIN_EMAIL_ALLOWLIST.has(cleanEmail);

    if (existingById) {
      existingById.email = cleanEmail;
      if (params.displayName) existingById.displayName = params.displayName;
      if (isAdmin) existingById.role = 'admin';
      existingById.lastLoginAt = now;
      existingById.updatedAt = now;
      this.save();
      return existingById;
    }

    if (existingByEmail) {
      existingByEmail.firebaseUid = params.uid;
      if (params.displayName) existingByEmail.displayName = params.displayName;
      if (isAdmin) existingByEmail.role = 'admin';
      existingByEmail.lastLoginAt = now;
      existingByEmail.updatedAt = now;
      this.save();
      return existingByEmail;
    }

    const displayName = params.displayName || cleanEmail.split('@')[0];
    const newUser: MultiUserAccountRecord = {
      userId: params.uid,
      email: cleanEmail,
      displayName,
      authProvider: 'firebase',
      firebaseUid: params.uid,
      role: isAdmin ? 'admin' : 'user',
      status: 'active',
      defaultEmailSubject: `Job Application — ${displayName}`,
      defaultCoverLetter: `Dear Hiring Manager,\n\nPlease find attached my CV for your consideration.\n\nBest regards,\n${displayName}`,
      dailySendLimit: 40,
      minDelaySeconds: 45,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    this.data.users[newUser.userId] = newUser;
    this.data.systemStats.totalRegistrations += 1;
    this.save();
    return newUser;
  }
}

// ============================================================================
// 4. MIME RFC 2822 EMAIL BUILDER WITH CV PDF ATTACHMENT
// ============================================================================

export function buildMimeEmailWithAttachment(params: {
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  attachment?: {
    filename: string;
    mimeType: string;
    base64Data: string;
  } | null;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    base64Data: string;
  }>;
}): string {
  const boundary = `zenvik_mime_boundary_${crypto.randomBytes(12).toString('hex')}`;
  const cleanSubject = params.subject.replace(/[\r\n]+/g, ' ').trim();
  const safeFromEmail = params.fromEmail.replace(/[\r\n<>]+/g, '').trim();
  const safeToEmail = params.toEmail.replace(/[\r\n<>]+/g, '').trim();
  const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanSubject, 'utf8').toString('base64')}?=`;
  const fromHeader = params.fromName
    ? `"${params.fromName.replace(/["\r\n]/g, '')}" <${safeFromEmail}>`
    : safeFromEmail;

  const lines: string[] = [
    `From: ${fromHeader}`,
    `To: ${safeToEmail}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
  ];

  const allAttachments: Array<{ filename: string; mimeType: string; base64Data: string }> = [];
  if (params.attachment && params.attachment.base64Data) {
    allAttachments.push(params.attachment);
  }
  if (Array.isArray(params.attachments)) {
    for (const att of params.attachments) {
      if (att && att.base64Data) {
        allAttachments.push(att);
      }
    }
  }

  if (allAttachments.length === 0) {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(params.bodyText);
  } else {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(params.bodyText, 'utf8').toString('base64'));
    lines.push('');

    for (const att of allAttachments) {
      const cleanBase64 = att.base64Data
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/\s+/g, '');
      const wrappedBase64 = cleanBase64.match(/.{1,76}/g)?.join('\r\n') || cleanBase64;
      const safeFilename = att.filename.replace(/["\r\n]/g, '_');

      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mimeType || 'application/pdf'}; name="${safeFilename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${safeFilename}"`);
      lines.push('');
      lines.push(wrappedBase64);
      lines.push('');
    }
    lines.push(`--${boundary}--`);
  }

  const rawMessage = lines.join('\r\n');
  return Buffer.from(rawMessage, 'utf8').toString('base64url');
}

// ============================================================================
// 5. EXPRESS ROUTER FACTORY (Supports Custom DB & Mock Transport for Tests)
// ============================================================================

export interface GmailTransportOverrides {
  exchangeCodeForTokens?: (params: {
    code: string;
    redirectUri: string;
  }) => Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    email?: string;
  }>;
  refreshAccessToken?: (refreshToken: string) => Promise<{
    access_token: string;
    expires_in?: number;
  }>;
  fetchGoogleUserEmail?: (accessToken: string) => Promise<string>;
  revokeToken?: (token: string) => Promise<void>;
  sendGmailRawMessage?: (params: {
    accessToken: string;
    senderEmail: string;
    rawMimeBase64Url: string;
  }) => Promise<{
    id: string;
    threadId: string;
  }>;
  listGmailReplies?: (params: {
    accessToken: string;
    maxResults?: number;
  }) => Promise<Array<{ id: string; threadId: string; from: string; subject: string; snippet: string; date: string }>>;
  sendAuthEmail?: (params: {
    toEmail: string;
    type: 'password_reset' | 'email_verification';
    token: string;
    displayName: string;
  }) => Promise<void>;
  generateGeminiContent?: (params: {
    apiKey: string;
    model: string;
    prompt: string;
    systemInstruction?: string;
  }) => Promise<{ text: string; model: string }>;
}

export function createMultiUserSaaSRouter(options?: {
  dbFilePath?: string;
  transport?: GmailTransportOverrides;
  verifyFirebaseToken?: (idToken: string) => Promise<{ uid: string; email: string; name?: string } | null>;
  guestDurationMs?: number;
  guestCooldownMs?: number;
  guestGeminiApiKey?: string;
  ownerGmailCredentials?: {
    email: string;
    accessToken?: string;
    refreshToken?: string;
  };
  retryDelayMs?: number;
}) {
  const storage = new MultiUserSaaSStorage(options?.dbFilePath);
  const router = express.Router();
  const firebaseTokenVerifier = options?.verifyFirebaseToken || verifyFirebaseIdToken;
  const retryDelayMs = typeof options?.retryDelayMs === 'number' ? options.retryDelayMs : 150;

  function getConfiguredGuestDurationMs(): number {
    if (typeof options?.guestDurationMs === 'number' && options.guestDurationMs > 0) {
      return options.guestDurationMs;
    }
    const envSeconds = Number(process.env.GUEST_SESSION_DURATION_SECONDS || DEFAULT_GUEST_DURATION_SECONDS);
    const clampedSeconds = Number.isFinite(envSeconds)
      ? Math.max(MIN_GUEST_DURATION_SECONDS, Math.min(MAX_GUEST_DURATION_SECONDS, Math.floor(envSeconds)))
      : DEFAULT_GUEST_DURATION_SECONDS;
    return clampedSeconds * 1000;
  }

  function getConfiguredGuestCooldownMs(): number {
    if (typeof options?.guestCooldownMs === 'number' && options.guestCooldownMs >= 0) {
      return options.guestCooldownMs;
    }
    const envSeconds = Number(process.env.GUEST_COOLDOWN_SECONDS || 1800);
    return Number.isFinite(envSeconds) && envSeconds >= 0 ? envSeconds * 1000 : 1800 * 1000;
  }

  function getOAuthCredentials(req?: Request) {
    const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const baseAppUrl = (
      process.env.GOOGLE_REDIRECT_URI ||
      (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? `${process.env.APP_URL.replace(/\/$/, '')}/api/gmail/oauth/callback`
        : req
        ? `${req.protocol}://${req.get('host')}/api/gmail/oauth/callback`
        : 'http://localhost:3000/api/gmail/oauth/callback')
    ).trim();

    return {
      clientId,
      clientSecret,
      redirectUri: baseAppUrl,
      isConfigured: Boolean(clientId && clientSecret),
    };
  }

  function isAllowedRedirectUri(uri: string, req?: Request): boolean {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol === 'http:' && !isLocal) return false;
      const pathOk =
        parsed.pathname === '/api/gmail/oauth/callback' ||
        parsed.pathname === '/api/gmail/oauth/callback/' ||
        parsed.pathname === '/auth/callback' ||
        parsed.pathname === '/auth/callback/';
      if (!pathOk) return false;

      const allowedHosts = new Set<string>(['localhost', '127.0.0.1']);
      const reqHost = req?.get('host')?.split(':')[0]?.toLowerCase();
      if (reqHost) allowedHosts.add(reqHost);
      for (const candidate of [process.env.APP_URL, process.env.GOOGLE_REDIRECT_URI, process.env.SHARED_APP_URL]) {
        if (candidate && candidate !== 'MY_APP_URL') {
          try {
            allowedHosts.add(new URL(candidate).hostname.toLowerCase());
          } catch {
            // ignore malformed env
          }
        }
      }
      const hostLower = parsed.hostname.toLowerCase();
      return allowedHosts.has(hostLower) || hostLower.endsWith('.run.app');
    } catch {
      return false;
    }
  }

  function isAllowedAndroidDeepLink(uri?: string | null): boolean {
    if (!uri) return false;
    return uri.startsWith('zenvik://oauth/callback') || uri.startsWith('com.ccd.abetteryou://oauth/callback');
  }

  // Default production Google OAuth / Gmail / Gemini HTTP calls + injectable test overrides
  const transport: Required<GmailTransportOverrides> = {
    exchangeCodeForTokens:
      options?.transport?.exchangeCodeForTokens ||
      (async ({ code, redirectUri }) => {
        const { clientId, clientSecret } = getOAuthCredentials();
        if (!clientId || !clientSecret) {
          throw new Error(
            'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in server environment / Google Cloud Secret Manager.'
          );
        }
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
        });
        const tokenJson: any = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenJson.access_token) {
          throw new Error(tokenJson.error_description || tokenJson.error || `OAuth token exchange failed (${tokenRes.status})`);
        }
        return tokenJson;
      }),

    refreshAccessToken:
      options?.transport?.refreshAccessToken ||
      (async (refreshToken: string) => {
        const { clientId, clientSecret } = getOAuthCredentials();
        if (!clientId || !clientSecret) {
          throw new Error('Cannot refresh OAuth token: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured.');
        }
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }).toString(),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) {
          throw new Error(data.error_description || data.error || `Refresh token rejected (${res.status})`);
        }
        return {
          access_token: data.access_token,
          expires_in: Number(data.expires_in || 3600),
        };
      }),

    fetchGoogleUserEmail:
      options?.transport?.fetchGoogleUserEmail ||
      (async (accessToken: string) => {
        const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (infoRes.ok) {
          const info: any = await infoRes.json();
          if (info?.email) return String(info.email).toLowerCase();
        }
        const tokenInfoRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
        );
        if (tokenInfoRes.ok) {
          const tInfo: any = await tokenInfoRes.json();
          if (tInfo?.email) return String(tInfo.email).toLowerCase();
        }
        throw new Error('Could not verify the authorized Gmail address from Google OAuth token.');
      }),

    revokeToken:
      options?.transport?.revokeToken ||
      (async (token: string) => {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } catch {
          // Best-effort network revocation
        }
      }),

    sendGmailRawMessage:
      options?.transport?.sendGmailRawMessage ||
      (async ({ accessToken, rawMimeBase64Url }) => {
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: rawMimeBase64Url }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.id) {
          const errMsg = data?.error?.message || `Gmail API send failed with HTTP ${res.status}`;
          const err: any = new Error(errMsg);
          err.httpStatus = res.status;
          throw err;
        }
        return {
          id: String(data.id),
          threadId: String(data.threadId || data.id),
        };
      }),

    listGmailReplies:
      options?.transport?.listGmailReplies ||
      (async ({ accessToken, maxResults = 10 }) => {
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(25, Math.max(1, maxResults))}&q=${encodeURIComponent('in:inbox (interview OR application OR position OR hiring OR recruitment)')}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!listRes.ok) {
          const data: any = await listRes.json().catch(() => ({}));
          const err: any = new Error(data?.error?.message || `Failed to read Gmail replies (HTTP ${listRes.status})`);
          err.httpStatus = listRes.status;
          throw err;
        }
        const listData: any = await listRes.json().catch(() => ({}));
        const ids: Array<{ id: string; threadId: string }> = Array.isArray(listData.messages) ? listData.messages.slice(0, maxResults) : [];
        const results: Array<{ id: string; threadId: string; from: string; subject: string; snippet: string; date: string }> = [];
        for (const msg of ids) {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msg.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) continue;
          const mData: any = await msgRes.json().catch(() => ({}));
          const headers: Array<{ name: string; value: string }> = mData?.payload?.headers || [];
          const getH = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
          results.push({
            id: String(mData.id || msg.id),
            threadId: String(mData.threadId || msg.threadId),
            from: getH('From'),
            subject: getH('Subject'),
            snippet: String(mData.snippet || ''),
            date: getH('Date'),
          });
        }
        return results;
      }),

    sendAuthEmail:
      options?.transport?.sendAuthEmail ||
      (async ({ toEmail, type }) => {
        // Production hook: integrate SMTP / transactional email provider when configured; never log raw tokens.
        storage.appendLog('info', `auth_email_${type}`, `Auth notification queued for ${toEmail}`);
      }),

    generateGeminiContent:
      options?.transport?.generateGeminiContent ||
      (async ({ apiKey, model, prompt, systemInstruction }) => {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        return {
          text: (response.text || '').trim(),
          model,
        };
      }),
  };

  // ==========================================================================
  // AUTHENTICATION, GUEST MODE & ISOLATION MIDDLEWARE
  // ==========================================================================

  function extractTokenFromRequest(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const customHeader = req.headers['x-zenvik-session-token'];
    if (typeof customHeader === 'string' && customHeader.trim()) {
      return customHeader.trim();
    }
    const guestHeader = req.headers['x-zenvik-guest-token'];
    if (typeof guestHeader === 'string' && guestHeader.trim()) {
      return guestHeader.trim();
    }
    return null;
  }

  function pruneExpiredRevocations(state: MultiUserSaaSDatabaseSchema) {
    const now = Date.now();
    for (const [jti, exp] of Object.entries(state.revokedSessionJtis || {})) {
      if (now > Number(exp)) {
        delete state.revokedSessionJtis[jti];
      }
    }
  }

  function resolveGuestSessionFromToken(rawToken: string): {
    ok: boolean;
    session?: AuthenticatedGuestSession;
    record?: StoredGuestSessionRecord;
    errorCode?: string;
    httpStatus?: number;
    message?: string;
  } {
    const verified = verifyGuestSessionToken(rawToken);
    if (!verified) {
      return {
        ok: false,
        errorCode: 'INVALID_GUEST_TOKEN',
        httpStatus: 401,
        message: 'Guest session token is invalid.',
      };
    }
    const state = storage.getState();
    const record = state.guestSessions[verified.guestId];
    if (!record) {
      return {
        ok: false,
        errorCode: 'GUEST_SESSION_NOT_FOUND',
        httpStatus: 401,
        message: 'Guest session does not exist. Please sign up or log in.',
      };
    }
    const now = Date.now();
    if (record.status === 'ended' || record.status === 'expired' || now >= record.expiresAt || verified.expired) {
      if (record.status === 'active') {
        record.status = 'expired';
        storage.save();
      }
      return {
        ok: false,
        errorCode: 'GUEST_SESSION_EXPIRED',
        httpStatus: 401,
        message: 'Your temporary guest session has expired. Please sign up or log in to continue.',
      };
    }
    record.lastActiveAt = now;
    const remainingSeconds = Math.max(0, Math.ceil((record.expiresAt - now) / 1000));
    return {
      ok: true,
      record,
      session: {
        guestId: record.guestId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        remainingSeconds,
      },
    };
  }

  async function requireAuthenticatedUser(req: Request, res: Response, next: NextFunction) {
    const rawToken = extractTokenFromRequest(req);
    if (!rawToken) {
      storage.getState().systemStats.totalAuthErrors += 1;
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'A valid user session token is required to access this endpoint.',
      });
    }

    // Strictly block Guest tokens on private registered-user endpoints
    if (rawToken.startsWith('gst.')) {
      const guestCheck = resolveGuestSessionFromToken(rawToken);
      if (!guestCheck.ok && guestCheck.errorCode === 'GUEST_SESSION_EXPIRED') {
        return res.status(401).json({
          error: 'GUEST_SESSION_EXPIRED',
          requiresAuth: true,
          message: guestCheck.message,
        });
      }
      return res.status(403).json({
        error: 'GUEST_ACCESS_RESTRICTED',
        requiresAuth: true,
        message: 'Guest sessions cannot access private user data, email history, credentials, or account settings. Please sign up or log in.',
      });
    }

    const state = storage.getState();
    pruneExpiredRevocations(state);

    // 1. Check ZENVIK signed session token
    const verifiedSession = verifySessionToken(rawToken);
    let userRecord: MultiUserAccountRecord | null = null;

    if (verifiedSession) {
      if (verifiedSession.jti && state.revokedSessionJtis[verifiedSession.jti]) {
        state.systemStats.totalAuthErrors += 1;
        return res.status(401).json({
          error: 'SESSION_REVOKED',
          message: 'This session has been logged out. Please log in again.',
        });
      }
      userRecord = storage.findUserById(verifiedSession.userId);
      if (
        userRecord &&
        userRecord.passwordChangedAt &&
        verifiedSession.iat &&
        verifiedSession.iat < userRecord.passwordChangedAt
      ) {
        state.systemStats.totalAuthErrors += 1;
        return res.status(401).json({
          error: 'SESSION_INVALIDATED',
          message: 'Your password was changed. Please log in again with your new password.',
        });
      }
      req.authTokenJti = verifiedSession.jti;
      req.authTokenExp = verifiedSession.exp;
      req.authTokenIat = verifiedSession.iat;
    } else {
      // 2. Cryptographically verify Firebase Auth RS256 ID Token JWT
      const firebaseClaims = await firebaseTokenVerifier(rawToken);
      if (firebaseClaims) {
        userRecord = storage.upsertFirebaseUser({
          uid: firebaseClaims.uid,
          email: firebaseClaims.email,
          displayName: firebaseClaims.name,
        });
      }
    }

    if (!userRecord) {
      state.systemStats.totalAuthErrors += 1;
      return res.status(401).json({
        error: 'INVALID_OR_EXPIRED_SESSION',
        message: 'Your session is invalid or has expired. Please log in again.',
      });
    }

    if (userRecord.status === 'suspended') {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended by an administrator.',
      });
    }

    if (userRecord.status === 'deleted') {
      return res.status(403).json({
        error: 'ACCOUNT_DELETED',
        message: 'This user account has been deleted.',
      });
    }

    // Strict Isolation Guard: Reject any request where the client attempts to supply a different userId
    const suppliedUserId =
      (req.body && typeof req.body.userId === 'string' && req.body.userId.trim()) ||
      (req.query && typeof req.query.userId === 'string' && req.query.userId.trim()) ||
      (req.params && typeof req.params.userId === 'string' && req.params.userId.trim());

    if (suppliedUserId && suppliedUserId !== userRecord.userId) {
      state.systemStats.totalAuthErrors += 1;
      return res.status(403).json({
        error: 'CROSS_USER_ACCESS_DENIED',
        message: 'Strict data isolation violation: You cannot access or act on behalf of another user ID.',
      });
    }

    req.authenticatedUser = {
      userId: userRecord.userId,
      email: userRecord.email,
      displayName: userRecord.displayName,
      role: userRecord.role,
      status: userRecord.status,
    };
    next();
  }

  async function requireAuthenticatedOrActiveGuest(req: Request, res: Response, next: NextFunction) {
    const rawToken = extractTokenFromRequest(req);
    if (rawToken && rawToken.startsWith('gst.')) {
      const guestCheck = resolveGuestSessionFromToken(rawToken);
      if (!guestCheck.ok || !guestCheck.session) {
        return res.status(guestCheck.httpStatus || 401).json({
          error: guestCheck.errorCode || 'GUEST_SESSION_EXPIRED',
          requiresAuth: true,
          message: guestCheck.message || 'Your guest session has expired. Please sign up or log in.',
        });
      }
      req.guestSession = guestCheck.session;
      return next();
    }
    return requireAuthenticatedUser(req, res, next);
  }

  function requireAdminUser(req: Request, res: Response, next: NextFunction) {
    requireAuthenticatedUser(req, res, () => {
      const u = req.authenticatedUser;
      if (!u || (u.role !== 'admin' && !ADMIN_EMAIL_ALLOWLIST.has(u.email.toLowerCase()))) {
        return res.status(403).json({
          error: 'ADMIN_PRIVILEGES_REQUIRED',
          message: 'Access denied. Administrator role is required.',
        });
      }
      next();
    });
  }

  // ==========================================================================
  // 1. MULTI-USER AUTHENTICATION ROUTES
  // ==========================================================================

  router.post('/multiuser/auth/register', (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.displayName || '').trim() || email.split('@')[0];

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'INVALID_EMAIL', message: 'A valid email address is required.' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({
          error: 'WEAK_PASSWORD',
          message: 'Password must be at least 6 characters long.',
        });
      }

      const existing = storage.findUserByEmail(email);
      if (existing) {
        return res.status(409).json({
          error: 'EMAIL_ALREADY_REGISTERED',
          message: 'An account with this email address already exists.',
        });
      }

      const now = new Date().toISOString();
      const userId = `usr_${crypto.randomBytes(10).toString('hex')}`;
      const { hash, salt } = hashPassword(password);
      const isAdmin = ADMIN_EMAIL_ALLOWLIST.has(email);

      const newUser: MultiUserAccountRecord = {
        userId,
        email,
        displayName,
        passwordHash: hash,
        passwordSalt: salt,
        authProvider: 'email',
        role: isAdmin ? 'admin' : 'user',
        status: 'active',
        defaultEmailSubject: `Job Application — ${displayName}`,
        defaultCoverLetter: `Dear Hiring Manager,\n\nPlease find attached my CV for your consideration.\n\nBest regards,\n${displayName}`,
        dailySendLimit: 40,
        minDelaySeconds: 45,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };

      const state = storage.getState();
      state.users[userId] = newUser;
      state.cvsByUser[userId] = [];
      state.applicationsByUser[userId] = [];
      state.emailHistoryByUser[userId] = [];
      state.systemStats.totalRegistrations += 1;
      storage.save();

      const sessionToken = issueSessionToken({
        userId: newUser.userId,
        email: newUser.email,
        role: newUser.role,
      });

      return res.status(201).json({
        success: true,
        sessionToken,
        user: {
          userId: newUser.userId,
          email: newUser.email,
          displayName: newUser.displayName,
          role: newUser.role,
          status: newUser.status,
          createdAt: newUser.createdAt,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'REGISTRATION_FAILED', message: err?.message || 'Registration error' });
    }
  });

  router.post('/multiuser/auth/login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Email and password are required.' });
    }

    const user = storage.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      storage.getState().systemStats.totalAuthErrors += 1;
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account is currently suspended. Please contact the administrator.',
      });
    }

    user.lastLoginAt = new Date().toISOString();
    storage.save();

    const sessionToken = issueSessionToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
    });

    return res.json({
      success: true,
      sessionToken,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  });

  /**
   * Syncs a cryptographically verified Firebase Auth user login into the Multi-User SaaS backend
   * and returns a signed backend session token. Rejects unverified or missing Firebase ID tokens.
   * Note: Application login is strictly separate from Gmail sending authorization.
   */
  router.post('/multiuser/auth/firebase-sync', async (req: Request, res: Response) => {
    const rawToken = extractTokenFromRequest(req) || String(req.body?.idToken || '').trim();
    if (!rawToken) {
      storage.getState().systemStats.totalAuthErrors += 1;
      return res.status(401).json({
        error: 'INVALID_FIREBASE_TOKEN',
        message: 'A cryptographically signed Firebase ID token is required.',
      });
    }

    const claims = await firebaseTokenVerifier(rawToken);
    if (!claims || !claims.uid || !claims.email || !claims.email.includes('@')) {
      storage.getState().systemStats.totalAuthErrors += 1;
      storage.appendLog('security', 'firebase_sync_rejected', 'Rejected invalid or forged Firebase ID token on /multiuser/auth/firebase-sync');
      storage.save();
      return res.status(401).json({
        error: 'INVALID_FIREBASE_TOKEN',
        message: 'Firebase ID token signature or claims could not be verified.',
      });
    }

    const uid = claims.uid;
    const email = claims.email.trim().toLowerCase();
    const displayName = claims.name || String(req.body?.displayName || '').trim() || email.split('@')[0];

    const user = storage.upsertFirebaseUser({ uid, email, displayName });
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account is currently suspended.',
      });
    }

    const sessionToken = issueSessionToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
    });

    return res.json({
      success: true,
      sessionToken,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        emailVerified: Boolean(user.emailVerified ?? true),
        createdAt: user.createdAt,
      },
    });
  });

  // Unified Google Sign-In endpoint (exchanges verified Firebase/Google RS256 ID token for authoritative zvk.* session)
  router.post('/multiuser/auth/google-signin', async (req: Request, res: Response) => {
    const rawToken = extractTokenFromRequest(req) || String(req.body?.idToken || '').trim();
    if (!rawToken) {
      return res.status(401).json({
        error: 'INVALID_GOOGLE_TOKEN',
        message: 'A verified Google/Firebase ID token is required.',
      });
    }
    const claims = await firebaseTokenVerifier(rawToken);
    if (!claims || !claims.uid || !claims.email || !claims.email.includes('@')) {
      storage.getState().systemStats.totalAuthErrors += 1;
      storage.save();
      return res.status(401).json({
        error: 'INVALID_GOOGLE_TOKEN',
        message: 'Google sign-in token verification failed.',
      });
    }
    const user = storage.upsertFirebaseUser({
      uid: claims.uid,
      email: claims.email.trim().toLowerCase(),
      displayName: claims.name || String(req.body?.displayName || '').trim() || claims.email.split('@')[0],
    });
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account is currently suspended.',
      });
    }
    user.emailVerified = true;
    user.emailVerifiedAt = user.emailVerifiedAt || new Date().toISOString();
    storage.save();
    const sessionToken = issueSessionToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
    });
    return res.json({
      success: true,
      sessionToken,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        emailVerified: true,
        createdAt: user.createdAt,
      },
    });
  });

  // Logout: cryptographically revoke current session JTI on the server so the token cannot be reused
  router.post('/multiuser/auth/logout', requireAuthenticatedUser, (req: Request, res: Response) => {
    const state = storage.getState();
    pruneExpiredRevocations(state);
    if (req.authTokenJti) {
      state.revokedSessionJtis[req.authTokenJti] = req.authTokenExp || Date.now() + 7 * 24 * 60 * 60 * 1000;
      storage.appendLog('info', 'auth_logout', `User logged out and session token revoked`, req.authenticatedUser?.userId);
      storage.save();
    }
    return res.json({
      success: true,
      message: 'You have been securely logged out and your session token has been revoked.',
    });
  });

  // Forgot Password: generates timed single-use hashed token and triggers auth email transport
  router.post('/multiuser/auth/forgot-password', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Please enter a valid email address.' });
    }
    const user = storage.findUserByEmail(email);
    if (user && user.status === 'active') {
      const rawResetToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
      const now = Date.now();
      const state = storage.getState();
      state.passwordResetTokens[tokenHash] = {
        tokenHash,
        userId: user.userId,
        email: user.email,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000,
        used: false,
      };
      storage.appendLog('security', 'password_reset_requested', `Password reset requested for ${user.email}`, user.userId);
      storage.save();
      try {
        await transport.sendAuthEmail({
          toEmail: user.email,
          type: 'password_reset',
          token: rawResetToken,
          displayName: user.displayName,
        });
      } catch {
        // Non-fatal transport failure; token remains stored
      }
    }
    // Always return uniform response to prevent user enumeration
    return res.json({
      success: true,
      message: 'If an account exists for that email address, a password reset link/token has been issued.',
    });
  });

  // Reset Password: validates single-use hashed token, updates password, invalidates prior sessions
  router.post('/multiuser/auth/reset-password', (req: Request, res: Response) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (!token) {
      return res.status(400).json({ error: 'RESET_TOKEN_REQUIRED', message: 'Password reset token is required.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'New password must be at least 6 characters long.',
      });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const state = storage.getState();
    const record = state.passwordResetTokens[tokenHash];
    if (!record || record.used || Date.now() > record.expiresAt) {
      return res.status(400).json({
        error: 'INVALID_OR_EXPIRED_RESET_TOKEN',
        message: 'This password reset token is invalid or has expired. Please request a new one.',
      });
    }
    const user = storage.findUserById(record.userId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Account no longer exists.' });
    }
    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.passwordChangedAt = Date.now();
    user.updatedAt = new Date().toISOString();
    record.used = true;
    storage.appendLog('security', 'password_reset_completed', `Password reset completed for ${user.email}`, user.userId);
    storage.save();

    return res.json({
      success: true,
      message: 'Your password has been updated. Please log in with your new password.',
    });
  });

  // Email Verification: request verification token & verify token
  router.post('/multiuser/auth/resend-verification', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const user = storage.findUserById(userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    if (user.emailVerified) {
      return res.json({ success: true, alreadyVerified: true, message: 'Email is already verified.' });
    }
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = Date.now();
    const state = storage.getState();
    state.emailVerificationTokens[tokenHash] = {
      tokenHash,
      userId: user.userId,
      email: user.email,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      used: false,
    };
    storage.save();
    try {
      await transport.sendAuthEmail({
        toEmail: user.email,
        type: 'email_verification',
        token: rawToken,
        displayName: user.displayName,
      });
    } catch {
      // Non-fatal
    }
    return res.json({
      success: true,
      message: 'A verification link has been sent to your email address.',
    });
  });

  router.post('/multiuser/auth/verify-email', (req: Request, res: Response) => {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'VERIFICATION_TOKEN_REQUIRED', message: 'Verification token is required.' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const state = storage.getState();
    const record = state.emailVerificationTokens[tokenHash];
    if (!record || record.used || Date.now() > record.expiresAt) {
      return res.status(400).json({
        error: 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
        message: 'Verification token is invalid or expired.',
      });
    }
    const user = storage.findUserById(record.userId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Account not found.' });
    }
    record.used = true;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date().toISOString();
    user.updatedAt = user.emailVerifiedAt;
    storage.save();
    return res.json({
      success: true,
      emailVerified: true,
      message: 'Your email address has been verified.',
    });
  });

  // ==========================================================================
  // 1B. SERVER-ENFORCED CONTROLLED GUEST MODE (2–4 MIN, DEFAULT 3 MIN)
  // ==========================================================================

  function computeGuestClientFingerprint(req: Request): string {
    const clientIp = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const clientHint = String(req.headers['x-guest-client-id'] || req.body?.clientId || '').trim();
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 120);
    const material = clientHint ? `${clientIp}:${clientHint}` : `${clientIp}:${userAgent}`;
    return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  function hasOwnerGmailConfigured(): boolean {
    if (options?.ownerGmailCredentials?.email && (options.ownerGmailCredentials.accessToken || options.ownerGmailCredentials.refreshToken)) {
      return true;
    }
    if (process.env.OWNER_GMAIL_REFRESH_TOKEN?.trim() || process.env.OWNER_GMAIL_ACCESS_TOKEN?.trim()) {
      return true;
    }
    const state = storage.getState();
    const ownerConn = state.gmailConnections['usr_owner_fazle_rabbi'];
    return Boolean(ownerConn && ownerConn.status === 'connected' && (ownerConn.encryptedAccessToken || ownerConn.encryptedRefreshToken));
  }

  function hasOwnerGeminiConfigured(): boolean {
    const key = (options?.guestGeminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    return Boolean(key && key.length > 5 && key !== 'undefined' && key !== 'null');
  }

  router.post('/multiuser/guest/start', (req: Request, res: Response) => {
    const state = storage.getState();
    const now = Date.now();
    const fingerprint = computeGuestClientFingerprint(req);
    const existingCooldown = state.guestCooldownsByFingerprint[fingerprint];

    // Prevent refresh / clock-tampering / re-request from resetting an active or expired guest timer
    if (existingCooldown) {
      const existingSession = state.guestSessions[existingCooldown.guestId];
      if (existingSession && existingSession.status === 'active' && now < existingSession.expiresAt) {
        const remainingSeconds = Math.max(0, Math.ceil((existingSession.expiresAt - now) / 1000));
        const guestToken = issueGuestSessionToken({
          guestId: existingSession.guestId,
          expiresAt: existingSession.expiresAt,
        });
        return res.json({
          success: true,
          resumed: true,
          guestToken,
          guestSession: {
            guestId: existingSession.guestId,
            status: 'active',
            createdAt: existingSession.createdAt,
            expiresAt: existingSession.expiresAt,
            durationSeconds: existingSession.durationSeconds,
            remainingSeconds,
            emailsSentCount: existingSession.emailsSentCount,
            maxEmailsAllowed: MAX_GUEST_EMAILS_PER_SESSION,
            aiRequestsCount: existingSession.aiRequestsCount,
          },
          ownerGmailConfigured: hasOwnerGmailConfigured(),
          ownerGeminiConfigured: hasOwnerGeminiConfigured(),
          disclosure:
            'Guest Mode is a temporary preview session. AI requests use the platform server key, and any email you confirm sending will be sent via the platform owner account. Guest sessions cannot access private user data or inbox history.',
        });
      }

      if (now < existingCooldown.cooldownUntil) {
        if (existingSession && existingSession.status === 'active') {
          existingSession.status = 'expired';
          storage.save();
        }
        return res.status(403).json({
          error: 'GUEST_SESSION_EXPIRED',
          requiresAuth: true,
          message: 'Your temporary guest preview has expired. Please create a free account or log in to continue.',
        });
      }
    }

    const durationMs = getConfiguredGuestDurationMs();
    const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
    const cooldownMs = getConfiguredGuestCooldownMs();
    const guestId = `gst_${crypto.randomBytes(10).toString('hex')}`;
    const expiresAt = now + durationMs;

    const sessionRecord: StoredGuestSessionRecord = {
      guestId,
      clientFingerprint: fingerprint,
      createdAt: now,
      expiresAt,
      durationSeconds,
      status: 'active',
      emailsSentCount: 0,
      aiRequestsCount: 0,
      lastActiveAt: now,
      emailHistory: [],
    };

    state.guestSessions[guestId] = sessionRecord;
    state.guestCooldownsByFingerprint[fingerprint] = {
      guestId,
      createdAt: now,
      expiresAt,
      cooldownUntil: expiresAt + cooldownMs,
    };
    storage.appendLog('info', 'guest_session_started', `Guest preview session ${guestId} started (${durationSeconds}s)`);
    storage.save();

    const guestToken = issueGuestSessionToken({ guestId, expiresAt });
    return res.status(201).json({
      success: true,
      resumed: false,
      guestToken,
      guestSession: {
        guestId,
        status: 'active',
        createdAt: now,
        expiresAt,
        durationSeconds,
        remainingSeconds: durationSeconds,
        emailsSentCount: 0,
        maxEmailsAllowed: MAX_GUEST_EMAILS_PER_SESSION,
        aiRequestsCount: 0,
      },
      ownerGmailConfigured: hasOwnerGmailConfigured(),
      ownerGeminiConfigured: hasOwnerGeminiConfigured(),
      disclosure:
        'Guest Mode is a temporary preview session. AI requests use the platform server key, and any email you confirm sending will be sent via the platform owner account. Guest sessions cannot access private user data or inbox history.',
    });
  });

  router.get('/multiuser/guest/status', (req: Request, res: Response) => {
    const rawToken = extractTokenFromRequest(req);
    if (!rawToken || !rawToken.startsWith('gst.')) {
      return res.status(401).json({
        error: 'GUEST_TOKEN_REQUIRED',
        expired: true,
        requiresAuth: true,
        remainingSeconds: 0,
        message: 'No active guest session token provided.',
      });
    }
    const check = resolveGuestSessionFromToken(rawToken);
    if (!check.ok || !check.session || !check.record) {
      return res.status(401).json({
        error: check.errorCode || 'GUEST_SESSION_EXPIRED',
        expired: true,
        requiresAuth: true,
        remainingSeconds: 0,
        message: check.message || 'Guest session has expired. Please sign up or log in.',
      });
    }
    return res.json({
      active: true,
      expired: false,
      guestId: check.session.guestId,
      createdAt: check.session.createdAt,
      expiresAt: check.session.expiresAt,
      durationSeconds: check.record.durationSeconds,
      remainingSeconds: check.session.remainingSeconds,
      emailsSentCount: check.record.emailsSentCount,
      maxEmailsAllowed: MAX_GUEST_EMAILS_PER_SESSION,
      aiRequestsCount: check.record.aiRequestsCount,
      ownerGmailConfigured: hasOwnerGmailConfigured(),
      ownerGeminiConfigured: hasOwnerGeminiConfigured(),
    });
  });

  router.post('/multiuser/guest/end', (req: Request, res: Response) => {
    const rawToken = extractTokenFromRequest(req);
    if (rawToken && rawToken.startsWith('gst.')) {
      const verified = verifyGuestSessionToken(rawToken);
      if (verified) {
        const state = storage.getState();
        const record = state.guestSessions[verified.guestId];
        if (record) {
          record.status = 'ended';
          storage.save();
        }
      }
    }
    return res.json({ success: true, message: 'Guest session ended.' });
  });

  // Get current authenticated user's isolated profile, CVs, applications, email history, and Gmail connection summary
  router.get('/multiuser/me', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const user = state.users[userId];
    const gmailConn = state.gmailConnections[userId];
    const cvs = (state.cvsByUser[userId] || []).map(c => ({
      id: c.id,
      userId: c.userId,
      title: c.title,
      fileName: c.fileName,
      mimeType: c.mimeType,
      fileSizeBytes: c.fileSizeBytes,
      isDefault: c.isDefault,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    const applications = state.applicationsByUser[userId] || [];
    const emailHistory = state.emailHistoryByUser[userId] || [];

    return res.json({
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        defaultEmailSubject: user.defaultEmailSubject,
        defaultCoverLetter: user.defaultCoverLetter,
        dailySendLimit: user.dailySendLimit,
        minDelaySeconds: user.minDelaySeconds,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      gmailConnection: gmailConn
        ? {
            connected: gmailConn.status === 'connected',
            gmailAddress: gmailConn.gmailAddress,
            scopes: gmailConn.scopes,
            status: gmailConn.status,
            connectedAt: gmailConn.connectedAt,
            updatedAt: gmailConn.updatedAt,
            sentTodayCount: gmailConn.sentTodayCount,
            dailyLimit: gmailConn.dailyLimit,
            lastError: gmailConn.lastError || null,
          }
        : {
            connected: false,
            gmailAddress: null,
            scopes: [],
            status: 'disconnected',
            sentTodayCount: 0,
            dailyLimit: user.dailySendLimit,
            lastError: null,
          },
      cvs,
      applications,
      emailHistory,
    });
  });

  // Update user's personal email template / sending settings
  router.put('/multiuser/me/settings', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const user = storage.findUserById(userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
      user.displayName = req.body.displayName.trim();
    }
    if (typeof req.body?.defaultEmailSubject === 'string') {
      user.defaultEmailSubject = req.body.defaultEmailSubject.trim();
    }
    if (typeof req.body?.defaultCoverLetter === 'string') {
      user.defaultCoverLetter = req.body.defaultCoverLetter;
    }
    if (typeof req.body?.dailySendLimit === 'number') {
      user.dailySendLimit = Math.max(1, Math.min(100, Math.floor(req.body.dailySendLimit)));
    }
    if (typeof req.body?.minDelaySeconds === 'number') {
      user.minDelaySeconds = Math.max(5, Math.min(600, Math.floor(req.body.minDelaySeconds)));
    }
    user.updatedAt = new Date().toISOString();
    storage.save();

    return res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        defaultEmailSubject: user.defaultEmailSubject,
        defaultCoverLetter: user.defaultCoverLetter,
        dailySendLimit: user.dailySendLimit,
        minDelaySeconds: user.minDelaySeconds,
      },
    });
  });

  // Self-service account deletion with token revocation & complete data wipe
  router.delete('/multiuser/me', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const conn = state.gmailConnections[userId];

    if (conn) {
      const accessToken = decryptTokenAtRest(conn.encryptedAccessToken);
      const refreshToken = decryptTokenAtRest(conn.encryptedRefreshToken);
      if (refreshToken) await transport.revokeToken(refreshToken);
      else if (accessToken) await transport.revokeToken(accessToken);
      delete state.gmailConnections[userId];
    }

    delete state.cvsByUser[userId];
    delete state.applicationsByUser[userId];
    delete state.emailHistoryByUser[userId];
    if (state.users[userId]) {
      state.users[userId].status = 'deleted';
      state.users[userId].passwordHash = null;
      state.users[userId].passwordSalt = null;
      state.users[userId].updatedAt = new Date().toISOString();
    }
    storage.save();

    return res.json({
      success: true,
      message: 'Your account, CVs, job applications, and encrypted Gmail OAuth tokens have been permanently deleted.',
    });
  });

  // ==========================================================================
  // 2. ISOLATED CV GALLERY & JOB APPLICATIONS ENDPOINTS
  // ==========================================================================

  router.get('/multiuser/cvs', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const cvs = storage.getState().cvsByUser[userId] || [];
    return res.json({ cvs });
  });

  router.post('/multiuser/cvs', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const title = String(req.body?.title || '').trim();
    const fileName = String(req.body?.fileName || `${title || 'CV'}.pdf`).trim();
    const rawBase64 = String(req.body?.pdfBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');

    if (!title || !rawBase64) {
      return res.status(400).json({
        error: 'INVALID_CV_PAYLOAD',
        message: 'CV title and base64 PDF content are required.',
      });
    }

    const now = new Date().toISOString();
    const state = storage.getState();
    const userCvs = state.cvsByUser[userId] || [];
    const cvId = String(req.body?.id || `cv_${crypto.randomBytes(8).toString('hex')}`);
    const isDefault = Boolean(req.body?.isDefault) || userCvs.length === 0;

    if (isDefault) {
      userCvs.forEach(c => {
        c.isDefault = false;
      });
    }

    const existingIdx = userCvs.findIndex(c => c.id === cvId);
    const cvItem: MultiUserCVItem = {
      id: cvId,
      userId,
      title,
      fileName,
      mimeType: 'application/pdf',
      fileSizeBytes: Math.floor((rawBase64.length * 3) / 4),
      pdfBase64: rawBase64,
      isDefault,
      createdAt: existingIdx !== -1 ? userCvs[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx !== -1) {
      userCvs[existingIdx] = cvItem;
    } else {
      userCvs.push(cvItem);
    }
    state.cvsByUser[userId] = userCvs;
    storage.save();

    return res.status(201).json({
      success: true,
      cv: {
        id: cvItem.id,
        userId: cvItem.userId,
        title: cvItem.title,
        fileName: cvItem.fileName,
        mimeType: cvItem.mimeType,
        fileSizeBytes: cvItem.fileSizeBytes,
        isDefault: cvItem.isDefault,
        createdAt: cvItem.createdAt,
        updatedAt: cvItem.updatedAt,
      },
    });
  });

  // Strict owner check when fetching a specific CV
  router.get('/multiuser/cvs/:cvId', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const cvId = String(req.params.cvId || '');
    const state = storage.getState();

    // Check if the CV belongs to another user first to return an explicit 403 isolation error
    for (const [ownerId, list] of Object.entries(state.cvsByUser)) {
      if (ownerId !== userId && list.some(c => c.id === cvId)) {
        return res.status(403).json({
          error: 'CV_OWNERSHIP_VIOLATION',
          message: 'Access denied: This CV belongs to another user.',
        });
      }
    }

    const cv = (state.cvsByUser[userId] || []).find(c => c.id === cvId);
    if (!cv) {
      return res.status(404).json({ error: 'CV_NOT_FOUND', message: 'CV not found in your library.' });
    }
    return res.json({ cv });
  });

  router.delete('/multiuser/cvs/:cvId', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const cvId = String(req.params.cvId || '');
    const state = storage.getState();
    const list = state.cvsByUser[userId] || [];
    const filtered = list.filter(c => c.id !== cvId);
    if (filtered.length === list.length) {
      return res.status(404).json({ error: 'CV_NOT_FOUND', message: 'CV not found in your library.' });
    }
    state.cvsByUser[userId] = filtered;
    storage.save();
    return res.json({ success: true });
  });

  router.get('/multiuser/applications', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    return res.json({
      applications: storage.getState().applicationsByUser[userId] || [],
    });
  });

  // ==========================================================================
  // 3. PERSONAL GMAIL OAUTH 2.0 (AUTHORIZATION CODE FLOW + MINIMUM SCOPE)
  // ==========================================================================

  router.get('/gmail/oauth/config', (req: Request, res: Response) => {
    const creds = getOAuthCredentials(req);
    return res.json({
      isBackendOAuthConfigured: creds.isConfigured,
      hasClientId: Boolean(creds.clientId),
      hasClientSecret: Boolean(creds.clientSecret),
      redirectUri: creds.redirectUri,
      requiredScope: GMAIL_SEND_ONLY_SCOPE,
      optionalReplyScope: GMAIL_READONLY_SCOPE,
      requiredEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'],
    });
  });

  /**
   * Step 1 of Authorization Code Flow:
   * Authenticated user requests the Google OAuth 2.0 consent screen URL.
   * Requests ONLY minimum scopes: `gmail.send` (+ `userinfo.email` to verify connected Gmail),
   * and optionally `gmail.readonly` ONLY when explicitly requested for reply tracking.
   */
  router.post('/gmail/oauth/start', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const creds = getOAuthCredentials(req);

    if (!creds.clientId) {
      return res.status(400).json({
        error: 'OAUTH_CLIENT_ID_MISSING',
        message:
          'GOOGLE_CLIENT_ID is not configured on the server. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in Google Cloud Secret Manager / Cloud Run environment variables.',
        redirectUri: creds.redirectUri,
      });
    }

    const customRedirectUri =
      typeof req.body?.redirectUri === 'string' && req.body.redirectUri.trim()
        ? req.body.redirectUri.trim()
        : creds.redirectUri;

    if (!isAllowedRedirectUri(customRedirectUri, req)) {
      return res.status(400).json({
        error: 'INVALID_REDIRECT_URI',
        message: 'The requested OAuth redirect URI is not in the trusted callback allowlist.',
      });
    }

    const includeReadReplies = req.body?.includeReadReplies === true;
    const requestedScopes = includeReadReplies
      ? [GMAIL_SEND_ONLY_SCOPE, GMAIL_READONLY_SCOPE]
      : [GMAIL_SEND_ONLY_SCOPE];
    const oauthScopeString = [...requestedScopes, OAUTH_EMAIL_IDENTITY_SCOPE].join(' ');
    const platform: 'web' | 'android' = req.body?.platform === 'android' ? 'android' : 'web';
    const rawDeepLink = typeof req.body?.appDeepLink === 'string' ? req.body.appDeepLink.trim() : null;
    const appDeepLink = platform === 'android' && isAllowedAndroidDeepLink(rawDeepLink) ? rawDeepLink : null;

    const stateNonce = crypto.randomBytes(24).toString('hex');
    const stateHmac = crypto
      .createHmac('sha256', getDerivedEncryptionKey())
      .update(`${stateNonce}:${userId}`)
      .digest('hex');
    const stateToken = `${stateNonce}.${stateHmac}`;

    const state = storage.getState();
    state.pendingOAuthStates[stateToken] = {
      stateId: stateToken,
      userId,
      redirectUri: customRedirectUri,
      requestedScopes,
      platform,
      appDeepLink,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      used: false,
    };
    storage.save();

    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: customRedirectUri,
      response_type: 'code',
      scope: oauthScopeString,
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'false',
      state: stateToken,
    });

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.json({
      authorizationUrl,
      state: stateToken,
      requestedScopes,
      redirectUri: customRedirectUri,
      platform,
    });
  });

  function sendOAuthCallbackHtmlResponse(
    res: Response,
    params: {
      ok: boolean;
      gmailAddress?: string;
      scopes?: string[];
      errorCode?: string;
      errorMessage?: string;
      platform?: 'web' | 'android';
      appDeepLink?: string | null;
    }
  ) {
    const title = params.ok ? 'Gmail Connected — ZENVIK-AGENT' : 'Gmail Connection Cancelled — ZENVIK-AGENT';
    const heading = params.ok ? 'Gmail Connected' : 'Gmail Connection Not Completed';
    const headingColor = params.ok ? '#10B981' : '#F43F5E';
    const detailHtml = params.ok
      ? `Authorized sender: <strong style="color:#fff;">${escapeHtml(params.gmailAddress || '')}</strong>`
      : escapeHtml(params.errorMessage || 'Authorization was declined or failed.');

    let androidRedirectUrl: string | null = null;
    if (params.platform === 'android' || params.appDeepLink) {
      const baseDeepLink = params.appDeepLink || 'com.ccd.abetteryou://oauth/callback';
      const qs = new URLSearchParams(
        params.ok
          ? { status: 'success', gmailAddress: params.gmailAddress || '' }
          : { status: 'error', error: params.errorCode || 'OAUTH_FAILED', message: params.errorMessage || '' }
      );
      androidRedirectUrl = `${baseDeepLink}?${qs.toString()}`;
    }

    const postMessagePayload = params.ok
      ? {
          type: 'ZENVIK_GMAIL_OAUTH_SUCCESS',
          gmailAddress: params.gmailAddress || '',
          scopes: params.scopes || [GMAIL_SEND_ONLY_SCOPE],
        }
      : {
          type: 'ZENVIK_GMAIL_OAUTH_ERROR',
          error: params.errorCode || 'OAUTH_FAILED',
          message: params.errorMessage || 'Gmail connection failed.',
        };

    return res.status(params.ok ? 200 : 400).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="background:#0B0C10;color:#F8FAFC;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;">
  <div style="background:#141822;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:420px;width:100%;text-align:center;">
    <h2 style="color:${headingColor};margin:0 0 8px;">${heading}</h2>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 16px;">${detailHtml}</p>
    ${
      androidRedirectUrl
        ? `<a href="${escapeHtml(androidRedirectUrl)}" style="display:inline-block;padding:10px 18px;border-radius:12px;background:#2563EB;color:#fff;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:10px;">Return to ZENVIK App</a>`
        : ''
    }
    <p style="font-size:12px;color:#64748B;margin:0;">You may close this window if it does not close automatically.</p>
  </div>
  <script>
    (function() {
      var payload = ${JSON.stringify(postMessagePayload)};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
          setTimeout(function() { window.close(); }, 600);
        }
      } catch (e) {}
      ${androidRedirectUrl ? `setTimeout(function() { window.location.href = ${JSON.stringify(androidRedirectUrl)}; }, 250);` : ''}
    })();
  </script>
</body>
</html>`);
  }

  /**
   * Step 2 of Authorization Code Flow:
   * Google redirects back with `code` and `state`.
   * Validates CSRF `state`, exchanges `code` for tokens, verifies Gmail address,
   * encrypts tokens with AES-256-GCM, and stores them strictly under `pendingState.userId`.
   */
  async function handleOAuthCallback(req: Request, res: Response) {
    const code = String(req.query?.code || '').trim();
    const stateToken = String(req.query?.state || '').trim();
    const oauthError = String(req.query?.error || '').trim();
    const wantsHtml = Boolean(req.accepts('html') && !req.xhr && req.query?.format !== 'json' && !String(req.headers.accept || '').includes('application/json'));
    const state = storage.getState();
    const pendingForError = stateToken ? state.pendingOAuthStates[stateToken] : undefined;

    if (oauthError) {
      if (pendingForError) {
        pendingForError.used = true;
        storage.appendLog('warn', 'oauth_consent_denied', `User declined Gmail OAuth consent (${oauthError})`, pendingForError.userId);
        storage.save();
      }
      const errMsg = `Google OAuth authorization was declined: ${oauthError}`;
      if (wantsHtml) {
        return sendOAuthCallbackHtmlResponse(res, {
          ok: false,
          errorCode: 'OAUTH_CONSENT_DENIED',
          errorMessage: errMsg,
          platform: pendingForError?.platform,
          appDeepLink: pendingForError?.appDeepLink,
        });
      }
      return res.status(400).json({
        error: 'OAUTH_CONSENT_DENIED',
        message: errMsg,
      });
    }

    if (!code || !stateToken) {
      const errMsg = 'Missing authorization code or CSRF state token.';
      if (wantsHtml) {
        return sendOAuthCallbackHtmlResponse(res, { ok: false, errorCode: 'INVALID_OAUTH_CALLBACK', errorMessage: errMsg });
      }
      return res.status(400).json({
        error: 'INVALID_OAUTH_CALLBACK',
        message: errMsg,
      });
    }

    const pending = state.pendingOAuthStates[stateToken];
    if (!pending || pending.used || Date.now() > pending.expiresAt) {
      state.systemStats.totalAuthErrors += 1;
      storage.save();
      const errMsg = 'OAuth CSRF state validation failed or expired. Please try connecting Gmail again.';
      if (wantsHtml) {
        return sendOAuthCallbackHtmlResponse(res, { ok: false, errorCode: 'INVALID_OR_EXPIRED_OAUTH_STATE', errorMessage: errMsg });
      }
      return res.status(400).json({
        error: 'INVALID_OR_EXPIRED_OAUTH_STATE',
        message: errMsg,
      });
    }

    // Verify HMAC signature of stateToken against pending.userId using timing-safe comparison
    const [nonce, providedHmac] = stateToken.split('.');
    const expectedHmac = crypto
      .createHmac('sha256', getDerivedEncryptionKey())
      .update(`${nonce}:${pending.userId}`)
      .digest('hex');
    const hmacValid =
      Boolean(providedHmac) &&
      providedHmac.length === expectedHmac.length &&
      crypto.timingSafeEqual(Buffer.from(providedHmac, 'utf8'), Buffer.from(expectedHmac, 'utf8'));
    if (!hmacValid) {
      return res.status(400).json({
        error: 'CSRF_STATE_SIGNATURE_MISMATCH',
        message: 'OAuth state signature verification failed.',
      });
    }

    // If an Authorization header is present on the callback request, ensure it matches pending.userId
    const callerToken = extractTokenFromRequest(req);
    if (callerToken) {
      const callerSession = verifySessionToken(callerToken);
      if (callerSession && callerSession.userId !== pending.userId) {
        return res.status(403).json({
          error: 'OAUTH_USER_MISMATCH',
          message: 'Cannot bind OAuth callback from another user session.',
        });
      }
    }

    pending.used = true;

    try {
      const tokenResponse = await transport.exchangeCodeForTokens({
        code,
        redirectUri: pending.redirectUri,
      });

      const gmailAddress = (
        tokenResponse.email || (await transport.fetchGoogleUserEmail(tokenResponse.access_token))
      )
        .trim()
        .toLowerCase();

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const userId = pending.userId;
      const existingConn = state.gmailConnections[userId];
      const userRecord = state.users[userId];

      const grantedScopesRaw = typeof tokenResponse.scope === 'string' && tokenResponse.scope.trim()
        ? tokenResponse.scope.split(/\s+/).filter(Boolean)
        : pending.requestedScopes || [GMAIL_SEND_ONLY_SCOPE];
      const grantedScopes = grantedScopesRaw.filter(
        s => s === GMAIL_SEND_ONLY_SCOPE || s === GMAIL_READONLY_SCOPE
      );
      if (grantedScopes.length === 0) {
        grantedScopes.push(GMAIL_SEND_ONLY_SCOPE);
      }

      const encryptedAccess = encryptTokenAtRest(tokenResponse.access_token);
      const encryptedRefresh = tokenResponse.refresh_token
        ? encryptTokenAtRest(tokenResponse.refresh_token)
        : existingConn?.encryptedRefreshToken || null;

      state.gmailConnections[userId] = {
        userId,
        gmailAddress,
        scopes: grantedScopes,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        accessTokenExpiresAt: Date.now() + Number(tokenResponse.expires_in || 3600) * 1000,
        connectedAt: existingConn?.connectedAt || now,
        updatedAt: now,
        status: 'connected',
        lastError: null,
        sentTodayCount: existingConn?.dailyQuotaDate === today ? existingConn.sentTodayCount : 0,
        dailyQuotaDate: today,
        dailyLimit: userRecord?.dailySendLimit || 40,
      };
      state.systemStats.totalOAuthConnections += 1;
      storage.appendLog('info', 'gmail_oauth_connected', `User connected personal Gmail (${gmailAddress})`, userId);
      storage.save();

      if (wantsHtml) {
        return sendOAuthCallbackHtmlResponse(res, {
          ok: true,
          gmailAddress,
          scopes: grantedScopes,
          platform: pending.platform,
          appDeepLink: pending.appDeepLink,
        });
      }

      return res.json({
        success: true,
        userId,
        connected: true,
        gmailAddress,
        scopes: grantedScopes,
        hasRefreshToken: Boolean(encryptedRefresh),
        status: 'connected',
      });
    } catch (err: any) {
      storage.save();
      const errMsg = err?.message || 'Failed to exchange authorization code with Google OAuth.';
      if (wantsHtml) {
        return sendOAuthCallbackHtmlResponse(res, {
          ok: false,
          errorCode: 'OAUTH_CODE_EXCHANGE_FAILED',
          errorMessage: errMsg,
          platform: pending.platform,
          appDeepLink: pending.appDeepLink,
        });
      }
      return res.status(400).json({
        error: 'OAUTH_CODE_EXCHANGE_FAILED',
        message: errMsg,
      });
    }
  }

  router.get(['/gmail/oauth/callback', '/gmail/oauth/callback/'], handleOAuthCallback);

  /**
   * Bind a verified user's personal client-side OAuth token (strictly encrypted at rest and scoped to req.authenticatedUser.userId).
   * Always cryptographically verifies the token's email with Google userinfo/tokeninfo — never trusts client-claimed email alone.
   */
  router.post('/gmail/oauth/connect-token', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const accessToken = String(req.body?.accessToken || '').trim();
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';

    if (!accessToken) {
      return res.status(400).json({
        error: 'MISSING_ACCESS_TOKEN',
        message: 'An OAuth access token is required.',
      });
    }

    try {
      // Always verify actual token owner against Google userinfo/tokeninfo
      const verifiedGoogleEmail = (await transport.fetchGoogleUserEmail(accessToken)).trim().toLowerCase();
      const claimedEmail =
        typeof req.body?.gmailAddress === 'string' && req.body.gmailAddress.includes('@')
          ? req.body.gmailAddress.trim().toLowerCase()
          : null;

      if (claimedEmail && claimedEmail !== verifiedGoogleEmail) {
        return res.status(403).json({
          error: 'OAUTH_EMAIL_MISMATCH',
          message: 'Provided email address does not match the verified Google OAuth token owner.',
        });
      }

      const gmailAddress = verifiedGoogleEmail;
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const state = storage.getState();
      const userRecord = state.users[userId];
      const existing = state.gmailConnections[userId];

      state.gmailConnections[userId] = {
        userId,
        gmailAddress,
        scopes: [GMAIL_SEND_ONLY_SCOPE],
        encryptedAccessToken: encryptTokenAtRest(accessToken),
        encryptedRefreshToken: refreshToken
          ? encryptTokenAtRest(refreshToken)
          : existing?.encryptedRefreshToken || null,
        accessTokenExpiresAt: Date.now() + Number(req.body?.expiresIn || 3600) * 1000,
        connectedAt: existing?.connectedAt || now,
        updatedAt: now,
        status: 'connected',
        lastError: null,
        sentTodayCount: existing?.dailyQuotaDate === today ? existing.sentTodayCount : 0,
        dailyQuotaDate: today,
        dailyLimit: userRecord?.dailySendLimit || 40,
      };
      state.systemStats.totalOAuthConnections += 1;
      storage.save();

      return res.json({
        success: true,
        userId,
        connected: true,
        gmailAddress,
        scopes: [GMAIL_SEND_ONLY_SCOPE],
        status: 'connected',
      });
    } catch (err: any) {
      return res.status(400).json({
        error: 'TOKEN_VERIFICATION_FAILED',
        message: err?.message || 'Could not verify Gmail OAuth token.',
      });
    }
  });

  router.get('/gmail/status', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const conn = state.gmailConnections[userId];
    const user = state.users[userId];

    if (!conn || conn.status === 'disconnected') {
      return res.json({
        connected: false,
        gmailAddress: null,
        scopes: [],
        hasRefreshToken: false,
        status: 'disconnected',
        sentTodayCount: 0,
        dailyLimit: user?.dailySendLimit || 40,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const sentTodayCount = conn.dailyQuotaDate === today ? conn.sentTodayCount : 0;

    return res.json({
      connected: conn.status === 'connected',
      gmailAddress: conn.gmailAddress,
      scopes: conn.scopes,
      hasRefreshToken: Boolean(conn.encryptedRefreshToken),
      status: conn.status,
      connectedAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
      sentTodayCount,
      dailyLimit: conn.dailyLimit || user?.dailySendLimit || 40,
      lastError: conn.lastError || null,
    });
  });

  router.post('/gmail/disconnect', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const conn = state.gmailConnections[userId];

    if (conn) {
      const refreshToken = decryptTokenAtRest(conn.encryptedRefreshToken);
      const accessToken = decryptTokenAtRest(conn.encryptedAccessToken);
      if (refreshToken) {
        await transport.revokeToken(refreshToken);
      } else if (accessToken) {
        await transport.revokeToken(accessToken);
      }
      delete state.gmailConnections[userId];
      storage.appendLog('info', 'gmail_oauth_disconnected', `User disconnected personal Gmail`, userId);
      storage.save();
    }

    return res.json({
      success: true,
      connected: false,
      gmailAddress: null,
      status: 'disconnected',
      message: 'Your Gmail account has been disconnected and stored OAuth tokens have been revoked and deleted.',
    });
  });

  // Read Employer Replies (Authenticated registered user ONLY, requires explicit gmail.readonly scope)
  router.get('/gmail/replies', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const conn = state.gmailConnections[userId];
    if (!conn || conn.status !== 'connected') {
      return res.status(400).json({
        error: 'GMAIL_NOT_CONNECTED',
        message: 'Connect your personal Gmail account first to check employer replies.',
      });
    }
    if (!conn.scopes.includes(GMAIL_READONLY_SCOPE)) {
      return res.status(403).json({
        error: 'GMAIL_READONLY_SCOPE_REQUIRED',
        message: 'Reply reading requires optional gmail.readonly permission. Reconnect Gmail with Reply Tracking enabled to grant read-only access.',
      });
    }
    try {
      const { accessToken, gmailAddress } = await resolveValidUserAccessToken(userId);
      const maxResults = Math.min(25, Math.max(1, Number(req.query?.limit || 10)));
      const replies = await transport.listGmailReplies({ accessToken, maxResults });
      return res.json({
        success: true,
        gmailAddress,
        replies,
      });
    } catch (err: any) {
      return res.status(err?.httpStatus || 500).json({
        error: err?.code || 'GMAIL_REPLIES_FAILED',
        message: err?.message || 'Unable to fetch employer replies from Gmail.',
      });
    }
  });

  // ==========================================================================
  // 4. PERSONAL GMAIL SENDING ENGINE (STRICT PER-USER SENDER & CV ISOLATION)
  // ==========================================================================

  async function resolveValidUserAccessToken(
    userId: string,
    liveClientAccessToken?: string | null
  ): Promise<{
    accessToken: string;
    gmailAddress: string;
    connection: StoredUserGmailConnection;
  }> {
    const state = storage.getState();
    const user = state.users[userId];
    let conn = state.gmailConnections[userId];
    const cleanLiveToken = typeof liveClientAccessToken === 'string' ? liveClientAccessToken.trim() : '';

    // If a fresh client-side Google OAuth access token is supplied via header,
    // ALWAYS verify its owning Gmail address via Google userinfo/tokeninfo before using or storing it.
    if (cleanLiveToken) {
      const verifiedEmail = (await transport.fetchGoogleUserEmail(cleanLiveToken)).trim().toLowerCase();
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      conn = {
        userId,
        gmailAddress: verifiedEmail,
        scopes: conn?.scopes?.length ? conn.scopes : [GMAIL_SEND_ONLY_SCOPE],
        encryptedAccessToken: encryptTokenAtRest(cleanLiveToken),
        encryptedRefreshToken: conn?.encryptedRefreshToken || null,
        accessTokenExpiresAt: Date.now() + 3600 * 1000,
        connectedAt: conn?.connectedAt || now,
        updatedAt: now,
        status: 'connected',
        lastError: null,
        sentTodayCount: conn?.dailyQuotaDate === today ? conn.sentTodayCount : 0,
        dailyQuotaDate: today,
        dailyLimit: conn?.dailyLimit || user?.dailySendLimit || 40,
      };
      state.gmailConnections[userId] = conn;
      storage.save();
      return {
        accessToken: cleanLiveToken,
        gmailAddress: conn.gmailAddress,
        connection: conn,
      };
    }

    if (!conn || conn.status === 'disconnected') {
      const err: any = new Error('You must connect your personal Gmail account before sending emails.');
      err.code = 'GMAIL_NOT_CONNECTED';
      err.httpStatus = 400;
      throw err;
    }

    if (conn.status === 'revoked') {
      const err: any = new Error('Your Gmail authorization was revoked. Please reconnect your Gmail account.');
      err.code = 'GMAIL_ACCESS_REVOKED';
      err.httpStatus = 401;
      throw err;
    }

    const isExpired = Date.now() >= conn.accessTokenExpiresAt - 60_000;
    const currentAccess = decryptTokenAtRest(conn.encryptedAccessToken);

    if (!isExpired && currentAccess) {
      return {
        accessToken: currentAccess,
        gmailAddress: conn.gmailAddress,
        connection: conn,
      };
    }

    // Token is expired -> attempt refresh using encrypted refresh token
    const refreshToken = decryptTokenAtRest(conn.encryptedRefreshToken);
    if (!refreshToken) {
      conn.status = 'expired';
      conn.lastError = 'Access token expired and no refresh token is available. Please reconnect Gmail.';
      storage.save();
      const err: any = new Error(conn.lastError);
      err.code = 'GMAIL_TOKEN_EXPIRED';
      err.httpStatus = 401;
      throw err;
    }

    try {
      const refreshed = await transport.refreshAccessToken(refreshToken);
      conn.encryptedAccessToken = encryptTokenAtRest(refreshed.access_token);
      conn.accessTokenExpiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
      conn.status = 'connected';
      conn.lastError = null;
      conn.updatedAt = new Date().toISOString();
      storage.save();

      return {
        accessToken: refreshed.access_token,
        gmailAddress: conn.gmailAddress,
        connection: conn,
      };
    } catch (refreshErr: any) {
      conn.status = 'revoked';
      const refreshErrorMessage =
        refreshErr?.message || 'Gmail refresh token was rejected or revoked. Please reconnect your Gmail account.';
      conn.lastError = refreshErrorMessage;
      storage.save();
      const err: any = new Error(refreshErrorMessage);
      err.code = 'GMAIL_REFRESH_FAILED_OR_REVOKED';
      err.httpStatus = 401;
      throw err;
    }
  }

  async function executeIsolatedEmailSend(params: {
    userId: string;
    recipientEmail: string;
    company?: string;
    position?: string;
    subject: string;
    coverLetter: string;
    cvId?: string;
    inlineCv?: {
      id?: string;
      fileName: string;
      pdfBase64: string;
    } | null;
    coverLetterPdf?: {
      fileName: string;
      pdfBase64: string;
    } | null;
    isRetry?: boolean;
    existingHistoryId?: string;
    liveClientAccessToken?: string | null;
  }) {
    const state = storage.getState();
    const user = state.users[params.userId];
    if (!user) {
      const err: any = new Error('Authenticated user record not found.');
      err.httpStatus = 404;
      throw err;
    }

    const cleanRecipient = params.recipientEmail.trim().toLowerCase();
    if (!cleanRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecipient)) {
      const err: any = new Error(`Invalid recipient email address: ${params.recipientEmail}`);
      err.code = 'INVALID_RECIPIENT';
      err.httpStatus = 400;
      throw err;
    }

    // 1. Resolve the authenticated user's own Gmail connection (NEVER another user's or owner's Gmail)
    const { accessToken, gmailAddress, connection } = await resolveValidUserAccessToken(
      params.userId,
      params.liveClientAccessToken
    );

    // 2. Check daily sending quota for this user
    const today = new Date().toISOString().slice(0, 10);
    if (connection.dailyQuotaDate !== today) {
      connection.dailyQuotaDate = today;
      connection.sentTodayCount = 0;
    }
    const effectiveLimit = connection.dailyLimit || user.dailySendLimit || 40;
    if (connection.sentTodayCount >= effectiveLimit) {
      const err: any = new Error(
        `Daily Gmail sending limit reached (${connection.sentTodayCount}/${effectiveLimit}) for ${gmailAddress}.`
      );
      err.code = 'DAILY_QUOTA_REACHED';
      err.httpStatus = 429;
      throw err;
    }

    // 3. Resolve & verify CV ownership strictly from this user's CV library
    const userCvs = state.cvsByUser[params.userId] || [];
    let resolvedCv: MultiUserCVItem | null = null;

    if (params.cvId) {
      // Check if requested cvId belongs to ANY OTHER user first!
      for (const [otherUserId, otherList] of Object.entries(state.cvsByUser)) {
        if (otherUserId !== params.userId && otherList.some(c => c.id === params.cvId)) {
          const err: any = new Error('Security violation: You cannot attach a CV belonging to another user.');
          err.code = 'CROSS_USER_CV_DENIED';
          err.httpStatus = 403;
          throw err;
        }
      }
      resolvedCv = userCvs.find(c => c.id === params.cvId) || null;
      if (!resolvedCv && !params.inlineCv) {
        const err: any = new Error(`Selected CV (${params.cvId}) was not found in your CV Gallery.`);
        err.code = 'CV_NOT_FOUND';
        err.httpStatus = 404;
        throw err;
      }
    } else if (userCvs.length > 0) {
      resolvedCv = userCvs.find(c => c.isDefault) || userCvs[0];
    }

    const attachmentBase64 = resolvedCv?.pdfBase64 || params.inlineCv?.pdfBase64 || '';
    const attachmentFilename = resolvedCv?.fileName || params.inlineCv?.fileName || 'CV.pdf';
    const attachmentCvId = resolvedCv?.id || params.inlineCv?.id || 'cv-default';

    if (!attachmentBase64) {
      const err: any = new Error('A valid PDF CV attachment from your CV Gallery is required before sending.');
      err.code = 'CV_ATTACHMENT_REQUIRED';
      err.httpStatus = 400;
      throw err;
    }

    const cvContentHash = crypto.createHash('sha256').update(attachmentBase64).digest('hex').slice(0, 16);
    const dedupKey = `${params.userId}__${cleanRecipient}__${params.subject.trim().toLowerCase()}`;
    const userHistory = state.emailHistoryByUser[params.userId] || [];

    // 4. Duplicate send protection (prevent accidentally sending duplicate email on retry if already sent)
    const alreadySentRecord = userHistory.find(h => h.dedupKey === dedupKey && h.status === 'sent');
    if (alreadySentRecord) {
      const err: any = new Error(
        `Duplicate prevented: An email with this subject was already sent from ${gmailAddress} to ${cleanRecipient} (Message ID: ${alreadySentRecord.gmailMessageId}).`
      );
      err.code = 'DUPLICATE_EMAIL_PREVENTED';
      err.httpStatus = 409;
      throw err;
    }

    const attachmentsList: Array<{ filename: string; mimeType: string; base64Data: string }> = [
      {
        filename: attachmentFilename,
        mimeType: 'application/pdf',
        base64Data: attachmentBase64,
      },
    ];
    if (params.coverLetterPdf?.pdfBase64) {
      attachmentsList.push({
        filename: params.coverLetterPdf.fileName || 'Cover_Letter.pdf',
        mimeType: 'application/pdf',
        base64Data: params.coverLetterPdf.pdfBase64,
      });
    }

    const rawMimeBase64Url = buildMimeEmailWithAttachment({
      fromEmail: gmailAddress,
      fromName: user.displayName,
      toEmail: cleanRecipient,
      subject: params.subject,
      bodyText: params.coverLetter,
      attachments: attachmentsList,
    });

    const now = new Date().toISOString();
    let historyRecord: MultiUserEmailHistoryRecord | undefined = params.existingHistoryId
      ? userHistory.find(h => h.id === params.existingHistoryId)
      : undefined;

    if (!historyRecord) {
      historyRecord = {
        id: `em_${crypto.randomBytes(8).toString('hex')}`,
        userId: params.userId,
        dedupKey,
        senderGmail: gmailAddress,
        recipientEmail: cleanRecipient,
        company: params.company,
        position: params.position,
        subject: params.subject,
        coverLetterSnippet: params.coverLetter.slice(0, 180),
        cvId: attachmentCvId,
        cvFilename: attachmentFilename,
        cvContentHash,
        status: 'sending',
        retryCount: params.isRetry ? 1 : 0,
        timestamp: now,
        updatedAt: now,
      };
      userHistory.unshift(historyRecord);
      state.emailHistoryByUser[params.userId] = userHistory;
    } else {
      historyRecord.status = 'sending';
      historyRecord.retryCount += 1;
      historyRecord.updatedAt = now;
    }

    // Bounded automatic retry ONLY for transient 429/5xx network errors while ensuring no duplicate sends
    let sendResult: { id: string; threadId: string } | null = null;
    let lastSendErr: any = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (historyRecord.status === 'sent' && historyRecord.gmailMessageId) {
        break;
      }
      try {
        sendResult = await transport.sendGmailRawMessage({
          accessToken,
          senderEmail: gmailAddress,
          rawMimeBase64Url,
        });
        lastSendErr = null;
        break;
      } catch (attemptErr: any) {
        lastSendErr = attemptErr;
        const code = Number(attemptErr?.httpStatus || 0);
        const isTransient = code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
        if (!isTransient || attempt === maxAttempts) {
          break;
        }
        historyRecord.retryCount += 1;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
      }
    }

    if (sendResult) {
      historyRecord.status = 'sent';
      historyRecord.httpStatus = 200;
      historyRecord.gmailMessageId = sendResult.id;
      historyRecord.gmailThreadId = sendResult.threadId;
      historyRecord.errorReason = null;
      historyRecord.updatedAt = new Date().toISOString();

      connection.sentTodayCount += 1;
      connection.lastError = null;
      state.systemStats.totalEmailsSent += 1;

      // Also record in the user's isolated applications list
      const userApps = state.applicationsByUser[params.userId] || [];
      userApps.unshift({
        id: `app_${crypto.randomBytes(8).toString('hex')}`,
        userId: params.userId,
        company: params.company || cleanRecipient.split('@')[1],
        position: params.position || params.subject,
        recipientEmail: cleanRecipient,
        subject: params.subject,
        coverLetter: params.coverLetter,
        cvId: attachmentCvId,
        cvTitle: resolvedCv?.title || attachmentFilename,
        status: 'sent',
        gmailMessageId: sendResult.id,
        gmailThreadId: sendResult.threadId,
        senderGmail: gmailAddress,
        createdAt: now,
        updatedAt: now,
        sentAt: now,
      });
      state.applicationsByUser[params.userId] = userApps;
      storage.save();

      return historyRecord;
    }

    const sendErr = lastSendErr;
    const failureReason = sendErr?.message || 'Gmail API send failed';
    historyRecord.status = 'failed';
    historyRecord.httpStatus = sendErr?.httpStatus || 500;
    historyRecord.errorReason = failureReason;
    historyRecord.updatedAt = new Date().toISOString();

    connection.lastError = failureReason;
    if (sendErr?.httpStatus === 401 || sendErr?.httpStatus === 403) {
      connection.status = 'revoked';
    }
    state.systemStats.totalEmailsFailed += 1;
    storage.save();

    const err: any = new Error(failureReason);
    err.httpStatus = historyRecord.httpStatus;
    err.historyRecord = historyRecord;
    throw err;
  }

  /**
   * Server-side owner Gmail relay used ONLY for active, non-expired Guest Mode previews
   * after explicit user confirmation (`guestOwnerAccountConfirmed: true`).
   * Never exposes owner tokens or owner email history to the guest client.
   */
  async function resolveOwnerGmailForGuest(): Promise<{ accessToken: string; gmailAddress: string }> {
    if (options?.ownerGmailCredentials?.email) {
      if (options.ownerGmailCredentials.accessToken) {
        return {
          accessToken: options.ownerGmailCredentials.accessToken,
          gmailAddress: options.ownerGmailCredentials.email.trim().toLowerCase(),
        };
      }
      if (options.ownerGmailCredentials.refreshToken) {
        const refreshed = await transport.refreshAccessToken(options.ownerGmailCredentials.refreshToken);
        return {
          accessToken: refreshed.access_token,
          gmailAddress: options.ownerGmailCredentials.email.trim().toLowerCase(),
        };
      }
    }

    const envRefresh = process.env.OWNER_GMAIL_REFRESH_TOKEN?.trim();
    const envAccess = process.env.OWNER_GMAIL_ACCESS_TOKEN?.trim();
    const envEmail = (process.env.OWNER_GMAIL_ADDRESS || PRIMARY_ADMIN_EMAIL).trim().toLowerCase();

    if (envRefresh) {
      const refreshed = await transport.refreshAccessToken(envRefresh);
      return { accessToken: refreshed.access_token, gmailAddress: envEmail };
    }
    if (envAccess) {
      return { accessToken: envAccess, gmailAddress: envEmail };
    }

    // Fallback to owner's stored encrypted connection on server (strictly for Guest relay)
    const state = storage.getState();
    const ownerConn = state.gmailConnections['usr_owner_fazle_rabbi'];
    if (ownerConn && ownerConn.status === 'connected') {
      const resolved = await resolveValidUserAccessToken('usr_owner_fazle_rabbi');
      return { accessToken: resolved.accessToken, gmailAddress: resolved.gmailAddress };
    }

    const err: any = new Error('Owner Gmail account is not configured on the server for Guest preview sending. Please sign up and connect your own Gmail account.');
    err.code = 'OWNER_GMAIL_NOT_CONFIGURED';
    err.httpStatus = 503;
    throw err;
  }

  // Preview email before sending
  router.post('/gmail/preview', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const user = state.users[userId];
    const conn = state.gmailConnections[userId];
    const userCvs = state.cvsByUser[userId] || [];
    const cvId = String(req.body?.cvId || '');
    const selectedCv = (cvId ? userCvs.find(c => c.id === cvId) : userCvs.find(c => c.isDefault) || userCvs[0]) || null;

    return res.json({
      preview: {
        userId,
        fromGmail: conn?.status === 'connected' ? conn.gmailAddress : null,
        toRecipient: String(req.body?.recipientEmail || '').trim(),
        subject: String(req.body?.subject || user?.defaultEmailSubject || '').trim(),
        coverLetter: String(req.body?.coverLetter || user?.defaultCoverLetter || ''),
        attachedCv: selectedCv
          ? {
              id: selectedCv.id,
              title: selectedCv.title,
              fileName: selectedCv.fileName,
              fileSizeBytes: selectedCv.fileSizeBytes,
            }
          : null,
      },
    });
  });

  // Send single email or batch of distinct individual emails (never CC/BCC)
  // Registered users send strictly from their own connected Gmail.
  // Active Guests may send up to MAX_GUEST_EMAILS_PER_SESSION via owner's backend Gmail ONLY with explicit owner-account confirmation.
  router.post('/gmail/send', requireAuthenticatedOrActiveGuest, async (req: Request, res: Response) => {
    const explicitConsent = req.body?.userConfirmedSend !== false;
    if (!explicitConsent) {
      return res.status(400).json({
        error: 'USER_CONSENT_REQUIRED',
        message: 'Explicit user confirmation is required before sending emails.',
      });
    }

    const recipientsInput = Array.isArray(req.body?.recipients)
      ? req.body.recipients
      : req.body?.recipientEmail
      ? [
          {
            recipientEmail: req.body.recipientEmail,
            company: req.body.company,
            position: req.body.position,
          },
        ]
      : [];

    if (recipientsInput.length === 0) {
      return res.status(400).json({
        error: 'NO_RECIPIENTS_SPECIFIED',
        message: 'At least one recipient email address is required.',
      });
    }

    // Branch A: Server-enforced Guest Mode (explicit owner-account confirmation required)
    if (req.guestSession) {
      if (req.body?.guestOwnerAccountConfirmed !== true) {
        return res.status(400).json({
          error: 'GUEST_OWNER_CONFIRMATION_REQUIRED',
          message:
            'Guest Mode emails are dispatched through the platform owner’s configured Gmail account. Please explicitly confirm (guestOwnerAccountConfirmed: true) or sign up to connect your own Gmail.',
        });
      }

      const state = storage.getState();
      const guestRecord = state.guestSessions[req.guestSession.guestId];
      if (!guestRecord || guestRecord.status !== 'active' || Date.now() >= guestRecord.expiresAt) {
        return res.status(401).json({
          error: 'GUEST_SESSION_EXPIRED',
          requiresAuth: true,
          message: 'Your guest session has expired. Please sign up or log in.',
        });
      }

      if (guestRecord.emailsSentCount + recipientsInput.length > MAX_GUEST_EMAILS_PER_SESSION) {
        return res.status(429).json({
          error: 'GUEST_SEND_LIMIT_REACHED',
          requiresAuth: true,
          message: `Guest preview sessions are limited to ${MAX_GUEST_EMAILS_PER_SESSION} emails. Sign up for a free account to send from your own Gmail.`,
        });
      }

      const subject = String(req.body?.subject || '').trim();
      const coverLetter = String(req.body?.coverLetter || '').trim();
      if (!subject || !coverLetter) {
        return res.status(400).json({
          error: 'MISSING_SUBJECT_OR_BODY',
          message: 'Email subject and cover letter body are required.',
        });
      }

      let ownerGmail: { accessToken: string; gmailAddress: string };
      try {
        ownerGmail = await resolveOwnerGmailForGuest();
      } catch (err: any) {
        return res.status(err?.httpStatus || 503).json({
          error: err?.code || 'OWNER_GMAIL_NOT_CONFIGURED',
          message: err?.message || 'Owner Gmail is not configured for Guest preview sending.',
        });
      }

      const inlineCv = req.body?.inlineCv || null;
      const coverLetterPdf = req.body?.coverLetterPdf || null;
      const attachments: Array<{ filename: string; mimeType: string; base64Data: string }> = [];
      if (inlineCv?.pdfBase64) {
        attachments.push({
          filename: inlineCv.fileName || 'Guest_CV.pdf',
          mimeType: 'application/pdf',
          base64Data: inlineCv.pdfBase64,
        });
      }
      if (coverLetterPdf?.pdfBase64) {
        attachments.push({
          filename: coverLetterPdf.fileName || 'Cover_Letter.pdf',
          mimeType: 'application/pdf',
          base64Data: coverLetterPdf.pdfBase64,
        });
      }

      const guestResults: GuestEmailHistoryEntry[] = [];
      const guestErrors: Array<{ recipientEmail: string; error: string }> = [];

      for (const item of recipientsInput) {
        const recipientEmail = (typeof item === 'string' ? item : String(item?.recipientEmail || '')).trim().toLowerCase();
        if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
          guestErrors.push({ recipientEmail, error: `Invalid recipient email address: ${recipientEmail}` });
          continue;
        }
        try {
          const rawMimeBase64Url = buildMimeEmailWithAttachment({
            fromEmail: ownerGmail.gmailAddress,
            fromName: 'ZENVIK Guest Preview',
            toEmail: recipientEmail,
            subject,
            bodyText: coverLetter,
            attachments,
          });
          const sendRes = await transport.sendGmailRawMessage({
            accessToken: ownerGmail.accessToken,
            senderEmail: ownerGmail.gmailAddress,
            rawMimeBase64Url,
          });
          const entry: GuestEmailHistoryEntry = {
            id: `gem_${crypto.randomBytes(6).toString('hex')}`,
            recipientEmail,
            subject,
            company: typeof item === 'object' ? item?.company : req.body?.company,
            position: typeof item === 'object' ? item?.position : req.body?.position,
            senderMode: 'owner_guest_relay',
            gmailMessageId: sendRes.id,
            status: 'sent',
            timestamp: new Date().toISOString(),
          };
          guestRecord.emailsSentCount += 1;
          guestRecord.emailHistory.unshift(entry);
          guestResults.push(entry);
        } catch (sendErr: any) {
          guestErrors.push({ recipientEmail, error: sendErr?.message || 'Guest email send failed' });
        }
      }
      storage.save();
      const allSucceeded = guestErrors.length === 0 && guestResults.length > 0;
      return res.status(allSucceeded ? 200 : guestResults.length > 0 ? 207 : 400).json({
        success: allSucceeded,
        guestMode: true,
        senderMode: 'owner_guest_relay',
        sentCount: guestResults.length,
        failedCount: guestErrors.length,
        results: guestResults,
        errors: guestErrors,
      });
    }

    // Branch B: Registered User (strictly personal Gmail, ZERO owner fallback)
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const user = state.users[userId];
    const subject = String(req.body?.subject || user?.defaultEmailSubject || '').trim();
    const coverLetter = String(req.body?.coverLetter || user?.defaultCoverLetter || '').trim();
    const cvId = req.body?.cvId ? String(req.body.cvId) : undefined;
    const inlineCv = req.body?.inlineCv || null;
    const coverLetterPdf = req.body?.coverLetterPdf || null;

    if (!subject || !coverLetter) {
      return res.status(400).json({
        error: 'MISSING_SUBJECT_OR_BODY',
        message: 'Email subject and cover letter body are required.',
      });
    }

    const results: MultiUserEmailHistoryRecord[] = [];
    const errors: Array<{ recipientEmail: string; error: string; record?: MultiUserEmailHistoryRecord }> = [];
    const liveClientAccessToken =
      typeof req.headers['x-gmail-access-token'] === 'string' ? req.headers['x-gmail-access-token'].trim() : null;

    for (const item of recipientsInput) {
      const recipientEmail = typeof item === 'string' ? item : String(item?.recipientEmail || '');
      const company = typeof item === 'object' ? item?.company : req.body?.company;
      const position = typeof item === 'object' ? item?.position : req.body?.position;

      try {
        const record = await executeIsolatedEmailSend({
          userId,
          recipientEmail,
          company,
          position,
          subject,
          coverLetter,
          cvId,
          inlineCv,
          coverLetterPdf,
          liveClientAccessToken,
        });
        results.push(record);
      } catch (err: any) {
        if (err?.code === 'CROSS_USER_CV_DENIED' || err?.code === 'GMAIL_NOT_CONNECTED') {
          return res.status(err.httpStatus || 400).json({
            error: err.code,
            message: err.message,
          });
        }
        errors.push({
          recipientEmail,
          error: err?.message || 'Send failed',
          record: err?.historyRecord,
        });
      }
    }

    const allSucceeded = errors.length === 0 && results.length > 0;
    return res.status(allSucceeded ? 200 : results.length > 0 ? 207 : 400).json({
      success: allSucceeded,
      sentCount: results.length,
      failedCount: errors.length,
      results,
      errors,
    });
  });

  // Send Test Email from the user's connected Gmail
  router.post('/gmail/send-test', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const conn = state.gmailConnections[userId];
    const user = state.users[userId];
    const liveClientAccessToken =
      typeof req.headers['x-gmail-access-token'] === 'string' ? req.headers['x-gmail-access-token'].trim() : null;

    if ((!conn || conn.status !== 'connected') && !liveClientAccessToken) {
      return res.status(400).json({
        error: 'GMAIL_NOT_CONNECTED',
        message: 'Please connect your personal Gmail account first.',
      });
    }

    const effectiveGmail = conn?.gmailAddress || user?.email || '';
    const recipientEmail = String(req.body?.recipientEmail || effectiveGmail).trim();
    const subject = String(req.body?.subject || `ZENVIK-AGENT Test Email from ${effectiveGmail}`).trim();
    const coverLetter = String(
      req.body?.coverLetter ||
        `Hello ${user?.displayName || ''},\n\nThis is a verified test application email sent directly from your connected personal Gmail account (${effectiveGmail}) via ZENVIK-AGENT.\n\nBest regards,\n${user?.displayName || effectiveGmail}`
    );
    const cvId = req.body?.cvId ? String(req.body.cvId) : undefined;
    const inlineCv = req.body?.inlineCv || {
      id: 'cv-test-verification',
      fileName: `${(user?.displayName || 'Candidate').replace(/\s+/g, '_')}_CV.pdf`,
      pdfBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF', 'utf8').toString('base64'),
    };

    try {
      const record = await executeIsolatedEmailSend({
        userId,
        recipientEmail,
        company: 'ZENVIK Test Verification',
        position: 'Gmail Integration Test',
        subject,
        coverLetter,
        cvId,
        inlineCv,
        liveClientAccessToken,
      });
      return res.json({
        success: true,
        record,
      });
    } catch (err: any) {
      return res.status(err?.httpStatus || 400).json({
        error: err?.code || 'TEST_SEND_FAILED',
        message: err?.message || 'Test email failed to send.',
        record: err?.historyRecord,
      });
    }
  });

  // Retry a failed email without sending duplicates
  router.post('/gmail/retry/:historyId', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const historyId = String(req.params.historyId || '');
    const state = storage.getState();
    const userHistory = state.emailHistoryByUser[userId] || [];
    const target = userHistory.find(h => h.id === historyId);

    if (!target) {
      return res.status(404).json({
        error: 'EMAIL_RECORD_NOT_FOUND',
        message: 'Email record not found in your sending history.',
      });
    }

    if (target.status === 'sent') {
      return res.status(409).json({
        error: 'ALREADY_SENT',
        message: 'This email has already been sent. Duplicate retry blocked.',
      });
    }

    const user = state.users[userId];
    const liveClientAccessToken =
      typeof req.headers['x-gmail-access-token'] === 'string' ? req.headers['x-gmail-access-token'].trim() : null;
    try {
      const record = await executeIsolatedEmailSend({
        userId,
        recipientEmail: target.recipientEmail,
        company: target.company,
        position: target.position,
        subject: target.subject,
        coverLetter: req.body?.coverLetter || user?.defaultCoverLetter || target.coverLetterSnippet,
        cvId: target.cvId,
        isRetry: true,
        existingHistoryId: target.id,
        liveClientAccessToken,
      });
      return res.json({
        success: true,
        record,
      });
    } catch (err: any) {
      return res.status(err?.httpStatus || 400).json({
        error: err?.code || 'RETRY_FAILED',
        message: err?.message || 'Failed to retry sending email.',
        record: err?.historyRecord,
      });
    }
  });

  router.get('/gmail/history', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const history = storage.getState().emailHistoryByUser[userId] || [];
    return res.json({
      userId,
      history,
      sentCount: history.filter(h => h.status === 'sent').length,
      failedCount: history.filter(h => h.status === 'failed').length,
    });
  });

  // ==========================================================================
  // 5. ADMIN PANEL ROUTES (PRIVACY-PRESERVING — NO TOKENS, NO INBOX, NO CVs)
  // ==========================================================================

  router.get('/multiuser/admin/overview', requireAdminUser, (req: Request, res: Response) => {
    const state = storage.getState();
    const usersSummary = Object.values(state.users)
      .filter(u => u.status !== 'deleted')
      .map(u => {
        const conn = state.gmailConnections[u.userId];
        const history = state.emailHistoryByUser[u.userId] || [];
        const cvs = state.cvsByUser[u.userId] || [];
        const apps = state.applicationsByUser[u.userId] || [];
        return {
          userId: u.userId,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          status: u.status,
          authProvider: u.authProvider,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          gmailConnected: conn?.status === 'connected',
          gmailStatus: conn?.status || 'disconnected',
          cvCount: cvs.length,
          applicationCount: apps.length,
          emailsSentCount: history.filter(h => h.status === 'sent').length,
          emailsFailedCount: history.filter(h => h.status === 'failed').length,
        };
      });

    return res.json({
      systemHealth: {
        status: 'healthy',
        activeUsersCount: usersSummary.filter(u => u.status === 'active').length,
        suspendedUsersCount: usersSummary.filter(u => u.status === 'suspended').length,
        connectedGmailCount: usersSummary.filter(u => u.gmailConnected).length,
        encryptionAlgorithm: 'aes-256-gcm',
        requiredGmailScope: GMAIL_SEND_ONLY_SCOPE,
        ...state.systemStats,
      },
      users: usersSummary,
    });
  });

  router.patch('/multiuser/admin/users/:targetUserId/status', requireAdminUser, (req: Request, res: Response) => {
    const targetUserId = String(req.params.targetUserId || '');
    const nextStatus = req.body?.status as UserAccountStatus | undefined;
    const nextRole = req.body?.role as UserRole | undefined;

    const user = storage.findUserById(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Target user not found.' });
    }

    if (ADMIN_EMAIL_ALLOWLIST.has(user.email.toLowerCase()) && nextStatus === 'suspended') {
      return res.status(400).json({
        error: 'CANNOT_SUSPEND_PRIMARY_ADMIN',
        message: 'The primary owner/administrator account cannot be suspended.',
      });
    }

    if (nextStatus === 'active' || nextStatus === 'suspended') {
      user.status = nextStatus;
    }
    if (nextRole === 'user' || nextRole === 'admin') {
      user.role = nextRole;
    }
    user.updatedAt = new Date().toISOString();
    storage.save();

    return res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        updatedAt: user.updatedAt,
      },
    });
  });

  router.delete('/multiuser/admin/users/:targetUserId', requireAdminUser, async (req: Request, res: Response) => {
    const targetUserId = String(req.params.targetUserId || '');
    const state = storage.getState();
    const user = state.users[targetUserId];
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Target user not found.' });
    }

    if (ADMIN_EMAIL_ALLOWLIST.has(user.email.toLowerCase())) {
      return res.status(400).json({
        error: 'CANNOT_DELETE_PRIMARY_ADMIN',
        message: 'The primary owner/administrator account cannot be deleted.',
      });
    }

    const conn = state.gmailConnections[targetUserId];
    if (conn) {
      const refreshToken = decryptTokenAtRest(conn.encryptedRefreshToken);
      const accessToken = decryptTokenAtRest(conn.encryptedAccessToken);
      if (refreshToken) await transport.revokeToken(refreshToken);
      else if (accessToken) await transport.revokeToken(accessToken);
      delete state.gmailConnections[targetUserId];
    }

    delete state.cvsByUser[targetUserId];
    delete state.savedJobsByUser[targetUserId];
    delete state.applicationsByUser[targetUserId];
    delete state.emailHistoryByUser[targetUserId];
    delete state.aiHistoryByUser[targetUserId];
    delete state.notificationsByUser[targetUserId];
    delete state.userProfilesByUser[targetUserId];
    delete state.jobPreferencesByUser[targetUserId];
    user.status = 'deleted';
    user.passwordHash = null;
    user.passwordSalt = null;
    user.updatedAt = new Date().toISOString();
    storage.appendLog('security', 'admin_user_deleted', `Admin deleted user ${user.email} (${targetUserId})`, req.authenticatedUser?.userId);
    storage.save();

    return res.json({
      success: true,
      message: `User ${user.email} (${targetUserId}) and all associated tokens/data have been deleted.`,
    });
  });

  // ==========================================================================
  // 6. CLOUD RUN HEALTH CHECK & OPENAPI REST DOCUMENTATION (PHASES 2 & 10)
  // ==========================================================================

  router.get('/health', (req: Request, res: Response) => {
    const state = storage.getState();
    const providerStatus = aiCooperativeEngine.getProviderStatusSummary();
    const daemonStatus = jobDatabaseEngine.getDaemonStatus();
    const activeUsers = Object.values(state.users).filter(u => u.status === 'active').length;
    const oauthCreds = getOAuthCredentials(req);

    // Live AES-256-GCM encryption self-check
    let encryptionVerified = false;
    try {
      const probe = 'zenvik_health_probe';
      const enc = encryptTokenAtRest(probe);
      encryptionVerified = decryptTokenAtRest(enc) === probe;
    } catch {
      encryptionVerified = false;
    }

    // Live storage read/write verification
    let storageWritable = false;
    try {
      storage.save();
      storageWritable = true;
    } catch {
      storageWritable = false;
    }

    return res.status(200).json({
      status: encryptionVerified && storageWritable ? 'healthy' : 'degraded',
      service: 'zenvik-agent-multiuser-backend',
      runtime: 'google-cloud-run-ready',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        status: storageWritable ? 'connected' : 'error',
        readWriteVerified: storageWritable,
        firestoreProjectId: (firebaseConfig as any).projectId || 'ccd---a-better-you-every-day',
        firestoreDatabaseId: (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-e4405bff-96e5-4e9d-8fc6-6665341e100c',
        activeUsersCount: activeUsers,
        indexedJobsCount: daemonStatus.totalDiscovered,
      },
      oauth: {
        configured: oauthCreds.isConfigured,
        hasClientId: Boolean(oauthCreds.clientId),
        hasClientSecret: Boolean(oauthCreds.clientSecret),
        redirectUri: oauthCreds.redirectUri,
        minimumScope: GMAIL_SEND_ONLY_SCOPE,
      },
      guestMode: {
        enabled: true,
        durationSeconds: Math.round(getConfiguredGuestDurationMs() / 1000),
        maxEmailsPerSession: MAX_GUEST_EMAILS_PER_SESSION,
        ownerGeminiConfigured: hasOwnerGeminiConfigured(),
        ownerGmailConfigured: hasOwnerGmailConfigured(),
      },
      aiProviders: {
        defaultProvider: state.adminSettings.defaultProvider,
        byokSupported: true,
        supportedByokModels: SUPPORTED_GEMINI_BYOK_MODELS,
        gemini: {
          enabled: state.adminSettings.geminiEnabled,
          configured: providerStatus.gemini.configured,
          model: state.adminSettings.geminiModel,
          status: providerStatus.gemini.status,
        },
        openai: {
          enabled: state.adminSettings.openaiEnabled,
          configured: providerStatus.openai.configured,
          model: state.adminSettings.openaiModel,
          status: providerStatus.openai.status,
        },
        grok: {
          enabled: state.adminSettings.grokEnabled !== false,
          configured: providerStatus.grok.configured,
          model: state.adminSettings.grokModel || providerStatus.grok.model,
          status: providerStatus.grok.status,
        },
      },
      security: {
        tokenEncryption: 'aes-256-gcm',
        encryptionVerified,
        gmailScope: GMAIL_SEND_ONLY_SCOPE,
        userIsolation: 'strict-token-derived-userid',
        rateLimitPerMinute: state.adminSettings.rateLimitPerMinute,
      },
    });
  });

  router.get('/docs', (_req: Request, res: Response) => {
    return res.json({
      openapi: '3.1.0',
      info: {
        title: 'ZENVIK AGENT — Multi-User SaaS & Personal Gmail Career API',
        version: '2.0.0',
        description:
          'Production REST API for multi-user authentication, isolated CV Gallery management, personal Gmail OAuth 2.0 (gmail.send), AI job search, and server-side Gemini AI.',
      },
      endpoints: [
        { method: 'GET', path: '/api/health', auth: 'public', summary: 'Google Cloud Run readiness & health check' },
        { method: 'GET', path: '/api/docs', auth: 'public', summary: 'REST API documentation' },
        { method: 'POST', path: '/api/multiuser/auth/register', auth: 'public', summary: 'Create isolated user account' },
        { method: 'POST', path: '/api/multiuser/auth/login', auth: 'public', summary: 'Authenticate user and issue session token' },
        { method: 'POST', path: '/api/multiuser/auth/firebase-sync', auth: 'firebase-jwt', summary: 'Verify Firebase Auth ID token & sync isolated workspace' },
        { method: 'GET', path: '/api/multiuser/me', auth: 'bearer', summary: 'Fetch authenticated user profile, CVs, applications, and Gmail status' },
        { method: 'GET', path: '/api/multiuser/cvs', auth: 'bearer', summary: 'List user-isolated CV documents' },
        { method: 'POST', path: '/api/multiuser/cvs', auth: 'bearer', summary: 'Upload validated PDF CV to isolated store' },
        { method: 'GET', path: '/api/multiuser/cvs/:cvId/download', auth: 'bearer', summary: 'Download binary PDF CV with ownership verification' },
        { method: 'PATCH', path: '/api/multiuser/cvs/:cvId/select', auth: 'bearer', summary: 'Select active default CV for job applications' },
        { method: 'POST', path: '/api/multiuser/cvs/sync-gallery', auth: 'bearer', summary: 'Synchronize CV Gallery single source of truth with backend' },
        { method: 'POST', path: '/api/gmail/oauth/start', auth: 'bearer', summary: 'Start Google OAuth 2.0 flow requesting only gmail.send' },
        { method: 'GET', path: '/api/gmail/oauth/callback', auth: 'oauth-state', summary: 'Exchange OAuth code and encrypt tokens with AES-256-GCM' },
        { method: 'POST', path: '/api/gmail/send', auth: 'bearer', summary: 'Send individual job applications from the user’s connected Gmail with selected CV' },
        { method: 'GET', path: '/api/multiuser/jobs/search', auth: 'bearer', summary: 'Search verified jobs by country, city, profession (Bartender, Barista, Waiter, Maintenance Electrician, Plumber), and sponsorship' },
        { method: 'GET', path: '/api/multiuser/job-preferences', auth: 'bearer', summary: 'Get user job search preferences' },
        { method: 'PUT', path: '/api/multiuser/job-preferences', auth: 'bearer', summary: 'Save user job search preferences' },
        { method: 'GET', path: '/api/multiuser/connected-services', auth: 'bearer', summary: 'Permission Management Dashboard status & diagnostics' },
        { method: 'GET', path: '/api/multiuser/setup-wizard', auth: 'bearer', summary: 'First-Time User Setup Wizard status' },
        { method: 'POST', path: '/api/multiuser/setup-wizard/complete', auth: 'bearer', summary: 'Complete First-Time User Setup Wizard' },
        { method: 'POST', path: '/api/ai/gemini/generate', auth: 'bearer', summary: 'Server-side Google Gemini AI generation with quota & fallback handling' },
        { method: 'GET', path: '/api/multiuser/admin/ai-config', auth: 'admin', summary: 'Admin AI Control Panel configuration & usage telemetry' },
        { method: 'PUT', path: '/api/multiuser/admin/ai-config', auth: 'admin', summary: 'Update Admin AI provider configuration' },
      ],
    });
  });

  // ==========================================================================
  // 7. CV GALLERY DOWNLOAD, SELECTION & SINGLE-SOURCE-OF-TRUTH SYNC (PHASE 5)
  // ==========================================================================

  router.get('/multiuser/cvs/:cvId/download', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const cvId = String(req.params.cvId || '');
    const state = storage.getState();

    for (const [ownerId, list] of Object.entries(state.cvsByUser)) {
      if (ownerId !== userId && list.some(c => c.id === cvId)) {
        storage.appendLog('security', 'cv_download_blocked', `Blocked cross-user CV download attempt on ${cvId}`, userId);
        return res.status(403).json({
          error: 'CV_OWNERSHIP_VIOLATION',
          message: 'Access denied: This CV belongs to another user.',
        });
      }
    }

    const cv = (state.cvsByUser[userId] || []).find(c => c.id === cvId);
    if (!cv) {
      return res.status(404).json({ error: 'CV_NOT_FOUND', message: 'CV not found in your CV Gallery.' });
    }

    const pdfBuffer = Buffer.from(cv.pdfBase64, 'base64');
    res.setHeader('Content-Type', cv.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cv.fileName.replace(/["\r\n]/g, '_')}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);
  });

  router.patch('/multiuser/cvs/:cvId/select', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const cvId = String(req.params.cvId || '');
    const state = storage.getState();
    const userCvs = state.cvsByUser[userId] || [];

    const target = userCvs.find(c => c.id === cvId);
    if (!target) {
      return res.status(404).json({ error: 'CV_NOT_FOUND', message: 'CV not found in your CV Gallery.' });
    }

    userCvs.forEach(c => {
      c.isDefault = c.id === cvId;
      if (c.id === cvId) {
        c.updatedAt = new Date().toISOString();
      }
    });
    state.cvsByUser[userId] = userCvs;
    storage.save();

    return res.json({
      success: true,
      selectedCvId: target.id,
      cv: {
        id: target.id,
        userId: target.userId,
        title: target.title,
        fileName: target.fileName,
        isDefault: target.isDefault,
        updatedAt: target.updatedAt,
      },
    });
  });

  router.post('/multiuser/cvs/sync-gallery', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const items = Array.isArray(req.body?.cvs) ? req.body.cvs : [];
    const state = storage.getState();
    const userCvs = state.cvsByUser[userId] || [];
    const now = new Date().toISOString();
    let syncedCount = 0;

    for (const raw of items) {
      const title = String(raw?.title || raw?.name || '').trim();
      const rawBase64 = String(raw?.pdfBase64 || raw?.base64Data || raw?.dataUrl || '')
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/\s+/g, '');
      if (!title || !rawBase64) continue;

      const cvId = String(raw?.id || `cv_${crypto.randomBytes(6).toString('hex')}`);
      const fileName = String(raw?.fileName || `${title.replace(/\s+/g, '_')}.pdf`).trim();
      const existingIdx = userCvs.findIndex(c => c.id === cvId || c.title.toLowerCase() === title.toLowerCase());
      const isDefault = Boolean(raw?.isDefault) || (userCvs.length === 0 && syncedCount === 0);

      if (isDefault) {
        userCvs.forEach(c => {
          c.isDefault = false;
        });
      }

      const item: MultiUserCVItem = {
        id: existingIdx !== -1 ? userCvs[existingIdx].id : cvId,
        userId,
        title,
        targetRole: raw?.targetRole ? String(raw.targetRole) : undefined,
        fileName,
        mimeType: 'application/pdf',
        fileSizeBytes: Math.floor((rawBase64.length * 3) / 4),
        pdfBase64: rawBase64,
        isDefault: isDefault || (existingIdx !== -1 && userCvs[existingIdx].isDefault),
        createdAt: existingIdx !== -1 ? userCvs[existingIdx].createdAt : now,
        updatedAt: now,
      };

      if (existingIdx !== -1) {
        userCvs[existingIdx] = item;
      } else {
        userCvs.push(item);
      }
      syncedCount++;
    }

    if (userCvs.length > 0 && !userCvs.some(c => c.isDefault)) {
      userCvs[0].isDefault = true;
    }

    state.cvsByUser[userId] = userCvs;
    storage.save();

    return res.json({
      success: true,
      syncedCount,
      totalCvs: userCvs.length,
      totalCount: userCvs.length,
      cvs: userCvs.map(c => ({
        id: c.id,
        userId: c.userId,
        title: c.title,
        targetRole: c.targetRole,
        fileName: c.fileName,
        mimeType: c.mimeType,
        fileSizeBytes: c.fileSizeBytes,
        isDefault: c.isDefault,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  });

  // ==========================================================================
  // 8. JOB PREFERENCES, SAVED JOBS & MULTI-USER AI JOB SEARCH ENGINE (PHASE 7)
  // ==========================================================================

  router.get('/multiuser/job-preferences', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const prefs = state.jobPreferencesByUser[userId] || {
      userId,
      preferredCountries: ['United Kingdom', 'Cyprus', 'Malta', 'Croatia', 'Switzerland'],
      preferredCities: [],
      jobCategories: ['Bartender', 'Barista', 'Waiter'],
      employmentTypes: ['Full-Time', 'Seasonal'],
      sponsorshipRequired: true,
      relocationSupport: true,
      updatedAt: new Date().toISOString(),
    };
    return res.json({
      preferences: {
        ...prefs,
        professions: prefs.jobCategories,
        countries: prefs.preferredCountries,
      },
      supportedCategories: SUPPORTED_JOB_CATEGORIES,
    });
  });

  router.put('/multiuser/job-preferences', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const existing = state.jobPreferencesByUser[userId];
    const now = new Date().toISOString();

    const rawCountries = req.body?.preferredCountries || req.body?.countries;
    const rawCategories = req.body?.jobCategories || req.body?.professions;

    const updated: MultiUserJobPreferences = {
      userId,
      preferredCountries: Array.isArray(rawCountries)
        ? rawCountries.map((c: any) => String(c).trim()).filter(Boolean)
        : existing?.preferredCountries || ['United Kingdom', 'Cyprus', 'Malta', 'Croatia'],
      preferredCities: Array.isArray(req.body?.preferredCities)
        ? req.body.preferredCities.map((c: any) => String(c).trim()).filter(Boolean)
        : existing?.preferredCities || [],
      jobCategories: Array.isArray(rawCategories)
        ? rawCategories.map((c: any) => String(c).trim()).filter(Boolean)
        : existing?.jobCategories || ['Bartender', 'Barista', 'Waiter'],
      employmentTypes: Array.isArray(req.body?.employmentTypes)
        ? req.body.employmentTypes.map((c: any) => String(c).trim()).filter(Boolean)
        : existing?.employmentTypes || ['Full-Time', 'Seasonal'],
      sponsorshipRequired:
        typeof req.body?.sponsorshipRequired === 'boolean'
          ? req.body.sponsorshipRequired
          : typeof req.body?.visaSponsorshipOnly === 'boolean'
          ? req.body.visaSponsorshipOnly
          : existing?.sponsorshipRequired ?? true,
      relocationSupport:
        typeof req.body?.relocationSupport === 'boolean'
          ? req.body.relocationSupport
          : typeof req.body?.relocationReady === 'boolean'
          ? req.body.relocationReady
          : existing?.relocationSupport ?? true,
      updatedAt: now,
    };

    state.jobPreferencesByUser[userId] = updated;
    storage.save();
    return res.json({
      success: true,
      preferences: {
        ...updated,
        professions: updated.jobCategories,
        countries: updated.preferredCountries,
      },
    });
  });

  function handleMultiUserJobSearch(req: Request, res: Response) {
    const userId = req.authenticatedUser?.userId || null;
    const state = storage.getState();
    const userPrefs = userId ? state.jobPreferencesByUser[userId] : undefined;
    const userSaved = userId ? state.savedJobsByUser[userId] || [] : [];
    const userApps = userId ? state.applicationsByUser[userId] || [] : [];

    const sourceParams = { ...(req.query || {}), ...(req.body || {}) };
    const countryFilter = String(sourceParams.country || '').trim().toLowerCase();
    const cityFilter = String(sourceParams.city || '').trim().toLowerCase();
    const professionFilter = String(sourceParams.profession || sourceParams.category || '').trim().toLowerCase();
    const queryFilter = String(sourceParams.query || sourceParams.q || '').trim().toLowerCase();
    const marketFilter = String(sourceParams.market || '').trim().toLowerCase();
    const sponsorshipOnly =
      sourceParams.sponsorshipOnly === true ||
      sourceParams.sponsorshipOnly === 'true' ||
      marketFilter === 'sponsorship';
    const useUserPreferences =
      sourceParams.usePreferences === true || sourceParams.usePreferences === 'true';

    const page = Math.max(1, Number(sourceParams.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(sourceParams.pageSize || sourceParams.limit) || 20));

    if (sourceParams.refresh === true || sourceParams.refresh === 'true') {
      jobDatabaseEngine.triggerDiscoveryRun();
    }

    const allActive = jobDatabaseEngine
      .getAllJobs()
      .filter(j => j.jobStatus !== 'expired' && j.jobStatus !== 'closed');

    // Deduplicate by canonicalKey
    const seenKeys = new Set<string>();
    const deduplicated: PersistentJobRecord[] = [];
    for (const job of allActive) {
      if (seenKeys.has(job.canonicalKey)) continue;
      seenKeys.add(job.canonicalKey);
      deduplicated.push(job);
    }

    const filtered = deduplicated.filter(job => {
      if (marketFilter && ['europe', 'cyprus', 'sponsorship'].includes(marketFilter)) {
        if (job.market !== marketFilter) return false;
      }
      if (countryFilter && job.country.toLowerCase() !== countryFilter && !job.country.toLowerCase().includes(countryFilter)) {
        return false;
      }
      if (cityFilter && !job.city.toLowerCase().includes(cityFilter) && !job.location.toLowerCase().includes(cityFilter)) {
        return false;
      }
      if (professionFilter) {
        const haystack = `${job.title} ${job.position} ${job.industry || ''} ${job.sourceNotes || ''}`.toLowerCase();
        if (!haystack.includes(professionFilter)) return false;
      }
      if (queryFilter) {
        const haystack = `${job.title} ${job.employer} ${job.city} ${job.country} ${job.sourceNotes || ''} ${job.sponsorshipEvidence || ''}`.toLowerCase();
        if (!haystack.includes(queryFilter)) return false;
      }
      if (sponsorshipOnly) {
        if (job.market !== 'sponsorship' && job.sponsorshipStatus !== 'confirmed' && job.sponsorshipStatus !== 'possible') {
          return false;
        }
      }
      if (useUserPreferences && userPrefs) {
        if (userPrefs.preferredCountries.length > 0) {
          const countryMatch = userPrefs.preferredCountries.some(
            c => c.toLowerCase() === job.country.toLowerCase()
          );
          if (!countryMatch) return false;
        }
      }
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const pageItems = filtered.slice(offset, offset + pageSize).map(job => {
      const isSaved = userSaved.some(s => s.jobId === job.id);
      const isApplied = userApps.some(
        a =>
          a.jobId === job.id ||
          (a.company.toLowerCase() === job.employer.toLowerCase() &&
            a.position.toLowerCase() === job.title.toLowerCase())
      );
      return {
        id: job.id,
        title: job.title,
        employer: job.employer,
        company: job.employer,
        location: job.location,
        city: job.city,
        country: job.country,
        market: job.market,
        description: job.sourceNotes || `${job.title} at ${job.employer} (${job.location})`,
        applicationUrl: job.applicationUrl || job.originalJobUrl,
        originalSource: job.sourceName,
        sourceUrl: job.sourceUrl || job.originalJobUrl,
        recipientEmail: job.recipientEmail,
        email: job.recipientEmail,
        emailVerificationStatus: job.emailVerificationStatus,
        dateDiscovered: job.firstDiscoveredDate,
        postingDate: job.postingDate,
        sponsorshipStatus: job.sponsorshipStatus,
        visaSponsored: job.market === 'sponsorship' || job.sponsorshipStatus === 'confirmed',
        sponsorshipEvidence: job.sponsorshipEvidence || null,
        verificationStatus: job.emailVerificationStatus === 'verified' ? 'verified' : 'official_portal_verified',
        isSaved,
        isApplied,
      };
    });

    return res.json({
      success: true,
      page,
      pageSize,
      total,
      totalPages,
      supportedProfessions: SUPPORTED_JOB_CATEGORIES,
      jobs: pageItems,
    });
  }

  router.get('/multiuser/jobs/search', requireAuthenticatedOrActiveGuest, handleMultiUserJobSearch);
  router.post('/multiuser/jobs/search', requireAuthenticatedOrActiveGuest, handleMultiUserJobSearch);

  router.get('/multiuser/saved-jobs', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const savedJobs = storage.getState().savedJobsByUser[userId] || [];
    return res.json({ savedJobs });
  });

  router.post('/multiuser/saved-jobs', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const snap = req.body?.jobSnapshot || {};
    const jobId = String(req.body?.jobId || req.body?.id || snap.id || '').trim();
    const employer = String(req.body?.employer || req.body?.company || snap.employer || snap.company || '').trim();
    const title = String(req.body?.title || req.body?.position || snap.title || snap.position || '').trim();

    if (!jobId || !employer || !title) {
      return res.status(400).json({
        error: 'INVALID_JOB_PAYLOAD',
        message: 'jobId, employer, and title are required to save a job.',
      });
    }

    const state = storage.getState();
    const list = state.savedJobsByUser[userId] || [];
    const existing = list.find(
      s => s.jobId === jobId || (s.employer.toLowerCase() === employer.toLowerCase() && s.title.toLowerCase() === title.toLowerCase())
    );
    if (existing) {
      return res.status(200).json({
        success: true,
        duplicatePrevented: true,
        savedJob: existing,
      });
    }

    const record: MultiUserSavedJobRecord = {
      id: `sav_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      jobId,
      employer,
      title,
      country: String(req.body?.country || snap.country || 'International').trim(),
      city: String(req.body?.city || snap.city || '').trim(),
      location: String(req.body?.location || snap.location || `${req.body?.city || snap.city || ''} ${req.body?.country || snap.country || ''}`).trim(),
      applicationUrl: String(req.body?.applicationUrl || snap.applicationUrl || '').trim(),
      recipientEmail: (req.body?.recipientEmail || snap.recipientEmail) ? String(req.body?.recipientEmail || snap.recipientEmail).trim() : undefined,
      sponsorshipStatus: String(req.body?.sponsorshipStatus || snap.sponsorshipStatus || 'unverified'),
      verificationStatus: String(req.body?.verificationStatus || snap.verificationStatus || 'verified'),
      savedAt: new Date().toISOString(),
    };

    list.unshift(record);
    state.savedJobsByUser[userId] = list;
    storage.save();
    return res.status(201).json({ success: true, savedJob: record });
  });

  router.delete('/multiuser/saved-jobs/:jobId', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const targetJobId = String(req.params.jobId || '');
    const state = storage.getState();
    const list = state.savedJobsByUser[userId] || [];
    state.savedJobsByUser[userId] = list.filter(s => s.jobId !== targetJobId && s.id !== targetJobId);
    storage.save();
    return res.json({ success: true });
  });

  // ==========================================================================
  // 9. GEMINI AI BACKEND INTEGRATION & ADMIN AI CONTROL PANEL (PHASES 8 & 15)
  // ==========================================================================

  router.get('/ai/providers/status', (_req: Request, res: Response) => {
    const state = storage.getState();
    const summary = aiCooperativeEngine.getProviderStatusSummary();
    return res.json({
      defaultProvider: state.adminSettings.defaultProvider,
      fallbackEnabled: state.adminSettings.fallbackEnabled,
      gemini: {
        enabled: state.adminSettings.geminiEnabled,
        configured: summary.gemini.configured,
        available: state.adminSettings.geminiEnabled && summary.gemini.configured,
        model: state.adminSettings.geminiModel,
        availableModels: summary.gemini.availableModels,
        status: state.adminSettings.geminiEnabled ? summary.gemini.status : 'disabled_by_admin',
        totalRequests: summary.gemini.totalRequests,
        avgLatencyMs: summary.gemini.avgLatencyMs,
        lastError: summary.gemini.lastError,
      },
      openai: {
        enabled: state.adminSettings.openaiEnabled,
        configured: summary.openai.configured,
        available: state.adminSettings.openaiEnabled && summary.openai.configured,
        model: state.adminSettings.openaiModel,
        availableModels: summary.openai.availableModels,
        status: state.adminSettings.openaiEnabled ? summary.openai.status : 'disabled_by_admin',
        totalRequests: summary.openai.totalRequests,
        avgLatencyMs: summary.openai.avgLatencyMs,
        lastError: summary.openai.lastError,
      },
      grok: {
        enabled: state.adminSettings.grokEnabled !== false,
        configured: summary.grok.configured,
        available: state.adminSettings.grokEnabled !== false && summary.grok.configured,
        model: state.adminSettings.grokModel || summary.grok.model,
        availableModels: summary.grok.availableModels,
        status: state.adminSettings.grokEnabled !== false ? summary.grok.status : 'disabled_by_admin',
        totalRequests: summary.grok.totalRequests,
        avgLatencyMs: summary.grok.avgLatencyMs,
        lastError: summary.grok.lastError,
      },
      cooperativeMode: summary.cooperativeMode,
    });
  });

  // ==========================================================================
  // 9B. PER-USER GEMINI API BYOK (BRING YOUR OWN KEY) SETTINGS & VERIFICATION
  // ==========================================================================

  function classifyGeminiError(err: any): {
    code: 'GEMINI_INVALID_KEY' | 'GEMINI_QUOTA_EXCEEDED' | 'GEMINI_MODEL_UNAVAILABLE' | 'GEMINI_TRANSIENT_ERROR';
    httpStatus: number;
    configStatus: 'invalid' | 'quota_exceeded' | 'connected';
    retryable: boolean;
    message: string;
  } {
    const status = Number(err?.status || err?.httpStatus || err?.code || 0);
    const msg = String(err?.message || err || 'Gemini API request failed');
    const lower = msg.toLowerCase();

    if (
      status === 401 ||
      status === 403 ||
      lower.includes('api_key_invalid') ||
      lower.includes('api key not valid') ||
      lower.includes('invalid api key') ||
      lower.includes('permission_denied') ||
      lower.includes('unauthorized')
    ) {
      return {
        code: 'GEMINI_INVALID_KEY',
        httpStatus: 400,
        configStatus: 'invalid',
        retryable: false,
        message: 'Your Gemini API key was rejected by Google (invalid or unauthorized). Please update your key in AI Settings.',
      };
    }

    if (
      status === 429 ||
      lower.includes('429') ||
      lower.includes('quota') ||
      lower.includes('resource_exhausted') ||
      lower.includes('rate limit')
    ) {
      return {
        code: 'GEMINI_QUOTA_EXCEEDED',
        httpStatus: 429,
        configStatus: 'quota_exceeded',
        retryable: false,
        message: 'Gemini API quota or rate limit exceeded for this API key. Wait a moment or check your Google AI billing quota.',
      };
    }

    if (status === 404 || lower.includes('not_found') || lower.includes('model not found') || lower.includes('not supported')) {
      return {
        code: 'GEMINI_MODEL_UNAVAILABLE',
        httpStatus: 400,
        configStatus: 'connected',
        retryable: false,
        message: `Selected Gemini model is unavailable (${msg}). Try switching to ${DEFAULT_GEMINI_BYOK_MODEL}.`,
      };
    }

    return {
      code: 'GEMINI_TRANSIENT_ERROR',
      httpStatus: 503,
      configStatus: 'connected',
      retryable: true,
      message: `Temporary Gemini API error: ${msg}`,
    };
  }

  function sanitizeGeminiConfigForClient(userId: string) {
    const state = storage.getState();
    const cfg = state.geminiConfigsByUser[userId];
    return {
      hasPersonalKey: Boolean(cfg?.encryptedApiKey),
      keyMasked: cfg?.keyMasked || null,
      selectedModel: cfg?.selectedModel || DEFAULT_GEMINI_BYOK_MODEL,
      supportedModels: [...SUPPORTED_GEMINI_BYOK_MODELS],
      status: cfg?.encryptedApiKey ? cfg.status : 'unconfigured',
      verifiedAt: cfg?.verifiedAt || null,
      lastTestedAt: cfg?.lastTestedAt || null,
      lastUsedAt: cfg?.lastUsedAt || null,
      lastError: cfg?.lastError || null,
      totalRequests: cfg?.totalRequests || 0,
      totalErrors: cfg?.totalErrors || 0,
      updatedAt: cfg?.updatedAt || null,
      platformFallbackAvailable: hasOwnerGeminiConfigured(),
    };
  }

  router.get('/multiuser/ai/settings', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    return res.json({
      success: true,
      settings: sanitizeGeminiConfigForClient(userId),
    });
  });

  router.put('/multiuser/ai/settings', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const existing = state.geminiConfigsByUser[userId];
    const now = new Date().toISOString();

    const rawKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : undefined;
    const requestedModel =
      typeof req.body?.selectedModel === 'string' && req.body.selectedModel.trim()
        ? req.body.selectedModel.trim()
        : existing?.selectedModel || DEFAULT_GEMINI_BYOK_MODEL;

    if (rawKey !== undefined && rawKey.length > 0 && rawKey.length < 10) {
      return res.status(400).json({
        error: 'INVALID_API_KEY_FORMAT',
        message: 'The provided Gemini API key appears too short to be valid.',
      });
    }

    const nextConfig: StoredUserGeminiConfig = {
      userId,
      encryptedApiKey: rawKey ? encryptTokenAtRest(rawKey) : existing?.encryptedApiKey || null,
      keyMasked: rawKey ? maskApiKey(rawKey) : existing?.keyMasked || null,
      selectedModel: requestedModel,
      status: rawKey ? 'connected' : existing?.status || 'unconfigured',
      verifiedAt: rawKey ? null : existing?.verifiedAt || null,
      lastTestedAt: existing?.lastTestedAt || null,
      lastUsedAt: existing?.lastUsedAt || null,
      lastError: rawKey ? null : existing?.lastError || null,
      totalRequests: existing?.totalRequests || 0,
      totalErrors: existing?.totalErrors || 0,
      updatedAt: now,
    };

    if (req.body?.verifyNow === true && (rawKey || nextConfig.encryptedApiKey)) {
      const keyToTest = rawKey || decryptTokenAtRest(nextConfig.encryptedApiKey) || '';
      try {
        await transport.generateGeminiContent({
          apiKey: keyToTest,
          model: nextConfig.selectedModel,
          prompt: 'Reply with OK.',
        });
        nextConfig.status = 'connected';
        nextConfig.verifiedAt = now;
        nextConfig.lastTestedAt = now;
        nextConfig.lastError = null;
      } catch (err: any) {
        const classified = classifyGeminiError(err);
        nextConfig.status = classified.configStatus;
        nextConfig.lastTestedAt = now;
        nextConfig.lastError = classified.message;
        nextConfig.totalErrors += 1;
        state.geminiConfigsByUser[userId] = nextConfig;
        storage.save();
        return res.status(classified.httpStatus).json({
          success: false,
          error: classified.code,
          message: classified.message,
          settings: sanitizeGeminiConfigForClient(userId),
        });
      }
    }

    state.geminiConfigsByUser[userId] = nextConfig;
    storage.appendLog('info', 'gemini_byok_updated', `User updated personal Gemini BYOK settings (model=${nextConfig.selectedModel})`, userId);
    storage.save();

    return res.json({
      success: true,
      settings: sanitizeGeminiConfigForClient(userId),
    });
  });

  router.delete('/multiuser/ai/key', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const existing = state.geminiConfigsByUser[userId];
    if (existing) {
      existing.encryptedApiKey = null;
      existing.keyMasked = null;
      existing.status = 'unconfigured';
      existing.verifiedAt = null;
      existing.lastError = null;
      existing.updatedAt = new Date().toISOString();
      storage.appendLog('info', 'gemini_byok_removed', 'User removed personal Gemini API key', userId);
      storage.save();
    }
    return res.json({
      success: true,
      message: 'Your personal Gemini API key has been permanently deleted from encrypted storage.',
      settings: sanitizeGeminiConfigForClient(userId),
    });
  });

  router.post('/multiuser/ai/test', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const existing = state.geminiConfigsByUser[userId];
    const overrideKey = typeof req.body?.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey.trim() : null;
    const decryptedStored = decryptTokenAtRest(existing?.encryptedApiKey);
    const keyToTest = overrideKey || decryptedStored;
    const model =
      typeof req.body?.selectedModel === 'string' && req.body.selectedModel.trim()
        ? req.body.selectedModel.trim()
        : existing?.selectedModel || DEFAULT_GEMINI_BYOK_MODEL;

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        error: 'GEMINI_KEY_NOT_CONFIGURED',
        message: 'No personal Gemini API key is configured. Enter your API key to test connectivity.',
      });
    }

    const startedAt = Date.now();
    const now = new Date().toISOString();
    try {
      const result = await transport.generateGeminiContent({
        apiKey: keyToTest,
        model,
        prompt: 'Respond with the single word OK to confirm connectivity.',
      });
      const latencyMs = Date.now() - startedAt;
      if (existing && !overrideKey) {
        existing.status = 'connected';
        existing.verifiedAt = now;
        existing.lastTestedAt = now;
        existing.lastError = null;
        existing.updatedAt = now;
        storage.save();
      }
      return res.json({
        success: true,
        connected: true,
        model: result.model || model,
        latencyMs,
        preview: result.text.slice(0, 80),
        settings: sanitizeGeminiConfigForClient(userId),
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      if (existing && !overrideKey) {
        existing.status = classified.configStatus;
        existing.lastTestedAt = now;
        existing.lastError = classified.message;
        existing.totalErrors += 1;
        existing.updatedAt = now;
        storage.save();
      }
      return res.status(classified.httpStatus).json({
        success: false,
        connected: false,
        error: classified.code,
        message: classified.message,
        settings: sanitizeGeminiConfigForClient(userId),
      });
    }
  });

  router.post('/ai/gemini/generate', requireAuthenticatedOrActiveGuest, async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt || '').trim();
    const operation = String(req.body?.operation || 'career_assistant').trim();
    const systemInstruction = req.body?.systemInstruction ? String(req.body.systemInstruction).trim() : undefined;
    const requestedModel = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : null;

    if (!prompt) {
      return res.status(400).json({
        error: 'PROMPT_REQUIRED',
        message: 'A non-empty prompt is required for AI generation.',
      });
    }

    const state = storage.getState();
    const adminCfg = state.adminSettings;
    const startTime = Date.now();

    // Branch 1: Active Guest Session -> Strictly uses server's configured GEMINI_API_KEY (owner key)
    if (req.guestSession) {
      const guestRecord = state.guestSessions[req.guestSession.guestId];
      const serverGuestKey = (options?.guestGeminiApiKey || process.env.GEMINI_API_KEY || '').trim();
      const usedModel = requestedModel || adminCfg.geminiModel || DEFAULT_GEMINI_BYOK_MODEL;

      if (!serverGuestKey || serverGuestKey === 'undefined' || serverGuestKey === 'null') {
        return res.status(503).json({
          error: 'GUEST_GEMINI_UNAVAILABLE',
          message: 'Guest preview AI key is not configured on the server. Sign up and add your own Gemini API key.',
        });
      }

      try {
        const result = await transport.generateGeminiContent({
          apiKey: serverGuestKey,
          model: usedModel,
          prompt,
          systemInstruction,
        });
        if (guestRecord) {
          guestRecord.aiRequestsCount += 1;
          guestRecord.lastActiveAt = Date.now();
        }
        state.systemStats.totalAiRequests = (state.systemStats.totalAiRequests || 0) + 1;
        storage.save();
        return res.json({
          success: true,
          guestMode: true,
          keySource: 'server_guest_key',
          provider: 'Gemini',
          model: result.model || usedModel,
          status: 'success',
          latencyMs: Date.now() - startTime,
          text: result.text,
        });
      } catch (err: any) {
        const classified = classifyGeminiError(err);
        return res.status(classified.httpStatus).json({
          success: false,
          guestMode: true,
          error: classified.code,
          message: classified.message,
        });
      }
    }

    // Branch 2: Registered User -> Strictly uses personal BYOK Gemini key if configured (NEVER another user's key!)
    const userId = req.authenticatedUser!.userId;
    const userGeminiCfg = state.geminiConfigsByUser[userId];
    const personalKey = decryptTokenAtRest(userGeminiCfg?.encryptedApiKey);
    const serverFallbackKey = (options?.guestGeminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    const hasServerKey = Boolean(serverFallbackKey && serverFallbackKey !== 'undefined' && serverFallbackKey !== 'null');

    let outputText = '';
    let usedProvider: 'Gemini' | 'OpenAI' | 'DeterministicFallback' = 'Gemini';
    let usedModel = requestedModel || userGeminiCfg?.selectedModel || adminCfg.geminiModel || DEFAULT_GEMINI_BYOK_MODEL;
    let status: 'success' | 'fallback' | 'error' = 'success';
    let keySource: 'user_byok' | 'server_managed' | 'deterministic_fallback' = 'user_byok';

    if (personalKey) {
      // Strictly execute with this user's own personal key — NEVER silently switch to another user's key
      keySource = 'user_byok';
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await transport.generateGeminiContent({
            apiKey: personalKey,
            model: usedModel,
            prompt,
            systemInstruction,
          });
          outputText = result.text;
          usedModel = result.model || usedModel;
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          const classified = classifyGeminiError(err);
          if (!classified.retryable || attempt === 2) {
            userGeminiCfg.status = classified.configStatus;
            userGeminiCfg.lastError = classified.message;
            userGeminiCfg.totalErrors += 1;
            userGeminiCfg.updatedAt = new Date().toISOString();
            storage.save();
            return res.status(classified.httpStatus).json({
              success: false,
              keySource: 'user_byok',
              error: classified.code,
              message: classified.message,
            });
          }
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
      if (!lastErr && userGeminiCfg) {
        userGeminiCfg.status = 'connected';
        userGeminiCfg.lastUsedAt = new Date().toISOString();
        userGeminiCfg.lastError = null;
        userGeminiCfg.totalRequests += 1;
        userGeminiCfg.updatedAt = userGeminiCfg.lastUsedAt;
      }
    } else if (req.body?.requirePersonalKey === true) {
      return res.status(400).json({
        error: 'PERSONAL_GEMINI_KEY_REQUIRED',
        message: 'Please configure your personal Gemini API key in AI Settings first.',
      });
    } else if (adminCfg.geminiEnabled && hasServerKey) {
      keySource = 'server_managed';
      try {
        const result = await transport.generateGeminiContent({
          apiKey: serverFallbackKey,
          model: usedModel,
          prompt,
          systemInstruction,
        });
        outputText = result.text;
      } catch (err: any) {
        const classified = classifyGeminiError(err);
        if (!adminCfg.fallbackEnabled) {
          return res.status(classified.httpStatus).json({
            error: classified.code,
            message: classified.message,
          });
        }
        status = 'fallback';
        usedProvider = 'DeterministicFallback';
        usedModel = 'zenvik-career-fallback-v1';
        keySource = 'deterministic_fallback';
        outputText = `Professional Career Intelligence Summary for "${prompt.slice(0, 80)}": Focus on verified employer career portals, tailor your CV from the CV Gallery to match role requirements, and highlight international hospitality or technical certifications.`;
      }
    } else if (adminCfg.fallbackEnabled) {
      status = 'fallback';
      usedProvider = 'DeterministicFallback';
      usedModel = 'zenvik-career-fallback-v1';
      keySource = 'deterministic_fallback';
      outputText = `Professional Career Intelligence Summary for "${prompt.slice(0, 80)}": Focus on verified employer career portals, tailor your CV from the CV Gallery to match role requirements, and highlight international hospitality or technical certifications.`;
    } else {
      return res.status(503).json({
        error: 'AI_PROVIDER_UNAVAILABLE',
        message: 'Gemini AI is currently not configured. Add your personal Gemini API key in AI Settings.',
      });
    }

    const latencyMs = Date.now() - startTime;
    const historyRecord: MultiUserAIHistoryRecord = {
      id: `aih_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      provider: usedProvider,
      model: usedModel,
      operation,
      promptSummary: prompt.slice(0, 160),
      responseSummary: outputText.slice(0, 240),
      latencyMs,
      status,
      timestamp: new Date().toISOString(),
    };

    const userAiList = state.aiHistoryByUser[userId] || [];
    userAiList.unshift(historyRecord);
    state.aiHistoryByUser[userId] = userAiList.slice(0, 50);
    state.systemStats.totalAiRequests = (state.systemStats.totalAiRequests || 0) + 1;
    storage.save();

    return res.json({
      success: true,
      keySource,
      provider: usedProvider,
      model: usedModel,
      status,
      latencyMs,
      text: outputText,
      recordId: historyRecord.id,
    });
  });

  router.get('/multiuser/ai-history', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const history = storage.getState().aiHistoryByUser[userId] || [];
    return res.json({ history });
  });

  // ==========================================================================
  // 10. FIRST-TIME USER SETUP WIZARD (8-STEP ONBOARDING) & CONNECTED SERVICES
  // ==========================================================================

  router.get('/multiuser/setup-wizard', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const user = state.users[userId];
    const profile = state.userProfilesByUser[userId] || {
      userId,
      headline: 'Hospitality & Technical Career Candidate',
      phone: '',
      nationality: '',
      currentCountry: '',
      setupWizardCompleted: false,
      setupCompletedAt: null,
      updatedAt: new Date().toISOString(),
    };
    const prefs = state.jobPreferencesByUser[userId] || {
      userId,
      preferredCountries: ['United Kingdom', 'Cyprus', 'Malta', 'Croatia'],
      preferredCities: [],
      jobCategories: ['Bartender', 'Barista', 'Waiter'],
      employmentTypes: ['Full-Time', 'Seasonal'],
      sponsorshipRequired: true,
      relocationSupport: true,
      updatedAt: new Date().toISOString(),
    };
    const gmailConn = state.gmailConnections[userId];
    const geminiByok = sanitizeGeminiConfigForClient(userId);
    const cvs = state.cvsByUser[userId] || [];
    const providerSummary = aiCooperativeEngine.getProviderStatusSummary();
    const oauthCreds = getOAuthCredentials(req);

    return res.json({
      setupWizardCompleted: profile.setupWizardCompleted,
      setupCompletedAt: profile.setupCompletedAt || null,
      steps: {
        googleAccount: {
          required: true,
          connected: Boolean(user),
          email: user?.email || null,
          displayName: user?.displayName || null,
          emailVerified: Boolean(user?.emailVerified),
        },
        gmailConnection: {
          required: false,
          optional: true,
          connected: gmailConn?.status === 'connected',
          status: gmailConn?.status || 'disconnected',
          gmailAddress: gmailConn?.gmailAddress || null,
          scopes: gmailConn?.scopes || [],
          scope: GMAIL_SEND_ONLY_SCOPE,
          hasRefreshToken: Boolean(gmailConn?.encryptedRefreshToken),
          backendOAuthConfigured: oauthCreds.isConfigured,
          lastError: gmailConn?.lastError || null,
        },
        aiServices: {
          required: false,
          byokConfigured: geminiByok.hasPersonalKey,
          byokStatus: geminiByok.status,
          byokVerified: Boolean(geminiByok.verifiedAt && geminiByok.status === 'connected'),
          keyMasked: geminiByok.keyMasked,
          selectedModel: geminiByok.selectedModel,
          supportedModels: geminiByok.supportedModels,
          backendManaged: hasOwnerGeminiConfigured(),
          geminiAvailable: geminiByok.status === 'connected' || (state.adminSettings.geminiEnabled && providerSummary.gemini.configured),
          openaiAvailable: state.adminSettings.openaiEnabled && providerSummary.openai.configured,
          model: geminiByok.selectedModel || state.adminSettings.geminiModel,
        },
        backendConnectivity: {
          required: true,
          healthy: true,
          databaseConnected: true,
          oauthConfigured: oauthCreds.isConfigured,
        },
        cvStorage: {
          required: false,
          featureSpecific: true,
          active: cvs.length > 0,
          cvCount: cvs.length,
          selectedCvTitle: (cvs.find(c => c.isDefault) || cvs[0])?.title || null,
        },
        jobSearchSetup: {
          required: true,
          configured: Boolean(state.jobPreferencesByUser[userId]),
          preferences: prefs,
          supportedCategories: SUPPORTED_JOB_CATEGORIES,
        },
      },
      profile,
      preferences: prefs,
    });
  });

  router.post('/multiuser/setup-wizard/complete', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const now = new Date().toISOString();
    const existingProfile = state.userProfilesByUser[userId];
    const existingPrefs = state.jobPreferencesByUser[userId];

    state.userProfilesByUser[userId] = {
      userId,
      headline: String(req.body?.headline || existingProfile?.headline || 'International Career Candidate').trim(),
      phone: String(req.body?.phone ?? existingProfile?.phone ?? '').trim(),
      nationality: String(req.body?.nationality ?? existingProfile?.nationality ?? '').trim(),
      currentCountry: String(req.body?.currentCountry ?? existingProfile?.currentCountry ?? '').trim(),
      setupWizardCompleted: true,
      setupCompletedAt: now,
      updatedAt: now,
    };

    if (req.body?.preferences || !existingPrefs) {
      const p = req.body?.preferences || {};
      state.jobPreferencesByUser[userId] = {
        userId,
        preferredCountries: Array.isArray(p.preferredCountries)
          ? p.preferredCountries.map((c: any) => String(c).trim()).filter(Boolean)
          : existingPrefs?.preferredCountries || ['United Kingdom', 'Cyprus', 'Malta', 'Croatia'],
        preferredCities: Array.isArray(p.preferredCities)
          ? p.preferredCities.map((c: any) => String(c).trim()).filter(Boolean)
          : existingPrefs?.preferredCities || [],
        jobCategories: Array.isArray(p.jobCategories)
          ? p.jobCategories.map((c: any) => String(c).trim()).filter(Boolean)
          : existingPrefs?.jobCategories || ['Bartender', 'Barista', 'Waiter'],
        employmentTypes: Array.isArray(p.employmentTypes)
          ? p.employmentTypes.map((c: any) => String(c).trim()).filter(Boolean)
          : existingPrefs?.employmentTypes || ['Full-Time', 'Seasonal'],
        sponsorshipRequired:
          typeof p.sponsorshipRequired === 'boolean'
            ? p.sponsorshipRequired
            : existingPrefs?.sponsorshipRequired ?? true,
        relocationSupport:
          typeof p.relocationSupport === 'boolean'
            ? p.relocationSupport
            : existingPrefs?.relocationSupport ?? true,
        updatedAt: now,
      };
    }

    storage.pushNotification(
      userId,
      'Setup Wizard Completed',
      'Your ZENVIK AGENT workspace, Gmail/AI configuration, and job preferences are ready.',
      'success'
    );
    storage.save();

    return res.json({
      success: true,
      setupWizardCompleted: true,
      profile: state.userProfilesByUser[userId],
      preferences: state.jobPreferencesByUser[userId],
    });
  });

  router.get('/multiuser/connected-services', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const user = state.users[userId];
    const conn = state.gmailConnections[userId];
    const geminiByok = sanitizeGeminiConfigForClient(userId);
    const cvs = state.cvsByUser[userId] || [];
    const prefs = state.jobPreferencesByUser[userId];
    const providerSummary = aiCooperativeEngine.getProviderStatusSummary();
    const daemonStatus = jobDatabaseEngine.getDaemonStatus();
    const selectedCv = cvs.find(c => c.isDefault) || cvs[0] || null;
    const geminiAvailable =
      geminiByok.status === 'connected' ||
      (state.adminSettings.geminiEnabled && providerSummary.gemini.configured);
    const openaiAvailable = state.adminSettings.openaiEnabled && providerSummary.openai.configured;

    return res.json({
      timestamp: new Date().toISOString(),
      services: {
        googleAccount: {
          name: 'Account Identity & Session',
          status: user ? 'Connected' : 'Disconnected',
          permissionType: 'Required',
          email: user?.email || null,
          displayName: user?.displayName || null,
          authProvider: user?.authProvider || 'email',
          emailVerified: Boolean(user?.emailVerified),
          lastConnectionAt: user?.lastLoginAt || null,
          explanation: 'Establishes your unique ZENVIK user identity and strictly isolates your workspace, CVs, Gmail tokens, and Gemini API key.',
          error: null,
        },
        gmail: {
          name: 'Personal Gmail OAuth 2.0',
          status: conn?.status === 'connected' ? 'Connected' : 'Disconnected',
          rawStatus: conn?.status || 'disconnected',
          permissionType: 'Optional (Feature-Specific)',
          gmailAddress: conn?.gmailAddress || null,
          scopes: conn?.scopes || [],
          hasRefreshToken: Boolean(conn?.encryptedRefreshToken),
          sentTodayCount: conn?.sentTodayCount || 0,
          dailyLimit: conn?.dailyLimit || user?.dailySendLimit || 40,
          lastConnectionAt: conn?.updatedAt || conn?.connectedAt || null,
          explanation: 'Uses Google OAuth 2.0 Authorization Code Flow with AES-256-GCM encrypted server-side token storage. Minimum scope: gmail.send (optional gmail.readonly only if reply tracking is enabled).',
          error: conn?.lastError || null,
        },
        geminiAi: {
          name: geminiByok.hasPersonalKey ? 'Google Gemini AI (Personal BYOK Key)' : 'Google Gemini AI',
          status: geminiByok.hasPersonalKey
            ? geminiByok.status === 'connected'
              ? 'Connected'
              : 'Error'
            : geminiAvailable
            ? 'Available'
            : 'Unavailable',
          permissionType: 'Personal BYOK (AES-256-GCM Encrypted)',
          byokConfigured: geminiByok.hasPersonalKey,
          byokStatus: geminiByok.status,
          keyMasked: geminiByok.keyMasked,
          enabled: state.adminSettings.geminiEnabled,
          configuredOnServer: providerSummary.gemini.configured,
          model: geminiByok.selectedModel || state.adminSettings.geminiModel,
          totalRequests: geminiByok.hasPersonalKey ? geminiByok.totalRequests : providerSummary.gemini.totalRequests,
          totalErrors: geminiByok.hasPersonalKey ? geminiByok.totalErrors : 0,
          avgLatencyMs: providerSummary.gemini.avgLatencyMs,
          lastConnectionAt: geminiByok.lastUsedAt || geminiByok.lastTestedAt || providerSummary.gemini.lastCheckedAt,
          explanation: geminiByok.hasPersonalKey
            ? 'Using your personal Gemini API key encrypted at rest on the backend. Never shared with other users.'
            : 'Add your own personal Gemini API key in AI Settings for independent quotas and usage tracking.',
          error: geminiByok.lastError || providerSummary.gemini.lastError,
        },
        openai: {
          name: 'OpenAI Verification Engine (Backend Managed)',
          status: openaiAvailable ? 'Available' : 'Unavailable',
          permissionType: 'Centrally Managed (Optional Fallback)',
          enabled: state.adminSettings.openaiEnabled,
          configuredOnServer: providerSummary.openai.configured,
          model: state.adminSettings.openaiModel,
          totalRequests: providerSummary.openai.totalRequests,
          avgLatencyMs: providerSummary.openai.avgLatencyMs,
          lastConnectionAt: providerSummary.openai.lastCheckedAt,
          explanation: 'Secondary backend AI provider for vacancy verification and fallback processing.',
          error: providerSummary.openai.lastError,
        },
        cvStorage: {
          name: 'CV Gallery & Document Storage',
          status: cvs.length > 0 ? 'Active' : 'Inactive',
          permissionType: 'Feature-Specific',
          totalCvs: cvs.length,
          selectedCvId: selectedCv?.id || null,
          selectedCvTitle: selectedCv?.title || null,
          selectedCvFileName: selectedCv?.fileName || null,
          lastConnectionAt: selectedCv?.updatedAt || null,
          explanation: 'CV Gallery is the single source of truth for all job application attachments. Isolated strictly per user account.',
          error: cvs.length === 0 ? 'Upload or sync at least one PDF CV in your CV Gallery before sending email applications.' : null,
        },
        jobSearchEngine: {
          name: 'ZENVIK AI Job Search & Sponsorship Engine',
          status: daemonStatus.totalDiscovered > 0 ? 'Active' : 'Inactive',
          permissionType: 'Built-In Core Service',
          totalIndexedJobs: daemonStatus.totalDiscovered,
          countsByMarket: daemonStatus.countsByMarket,
          supportedProfessions: SUPPORTED_JOB_CATEGORIES,
          preferencesConfigured: Boolean(prefs),
          preferredCountries: prefs?.preferredCountries || [],
          preferredCategories: prefs?.jobCategories || [],
          lastConnectionAt: daemonStatus.lastSearchTime,
          explanation: 'Indexes verified vacancies across Europe, Cyprus, and Visa Sponsorship portals for Bartender, Barista, Waiter, Maintenance Electrician, Plumber, and Hospitality roles.',
          error: null,
        },
      },
    });
  });

  // Notifications Endpoints
  router.get('/multiuser/notifications', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const notifications = storage.getState().notificationsByUser[userId] || [];
    return res.json({
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    });
  });

  router.patch('/multiuser/notifications/:id/read', requireAuthenticatedUser, (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const notifId = String(req.params.id || '');
    const list = storage.getState().notificationsByUser[userId] || [];
    const target = list.find(n => n.id === notifId);
    if (target) {
      target.read = true;
      storage.save();
    }
    return res.json({ success: true });
  });

  // ==========================================================================
  // 11. ADMIN AI CONTROL PANEL & SYSTEM AUDIT LOGS (PHASES 9 & 15.5)
  // ==========================================================================

  router.get('/multiuser/admin/ai-config', requireAdminUser, (_req: Request, res: Response) => {
    const state = storage.getState();
    const providerSummary = aiCooperativeEngine.getProviderStatusSummary();
    return res.json({
      config: {
        ...state.adminSettings,
        defaultGeminiModel: state.adminSettings.geminiModel,
        defaultOpenAIModel: state.adminSettings.openaiModel,
        defaultGrokModel: state.adminSettings.grokModel || providerSummary.grok.model,
        totalGeminiRequests: providerSummary.gemini.totalRequests,
        totalGeminiErrors: providerSummary.gemini.lastError ? 1 : 0,
        totalOpenAIRequests: providerSummary.openai.totalRequests,
        totalOpenAIErrors: providerSummary.openai.lastError ? 1 : 0,
        totalGrokRequests: providerSummary.grok.totalRequests,
        totalGrokErrors: providerSummary.grok.lastError ? 1 : 0,
        serverEnvStatus: {
          geminiKeyPresent: providerSummary.gemini.configured,
          openaiKeyPresent: providerSummary.openai.configured,
          grokKeyPresent: providerSummary.grok.configured,
        },
      },
      providers: {
        gemini: {
          ...providerSummary.gemini,
          enabled: state.adminSettings.geminiEnabled,
          activeModel: state.adminSettings.geminiModel,
          secretSource: providerSummary.gemini.configured ? 'Server Environment / Google Secret Manager (GEMINI_API_KEY)' : 'Not Configured',
        },
        openai: {
          ...providerSummary.openai,
          enabled: state.adminSettings.openaiEnabled,
          activeModel: state.adminSettings.openaiModel,
          secretSource: providerSummary.openai.configured ? 'Server Environment / Google Secret Manager (OPENAI_API_KEY)' : 'Not Configured',
        },
        grok: {
          ...providerSummary.grok,
          enabled: state.adminSettings.grokEnabled !== false,
          activeModel: state.adminSettings.grokModel || providerSummary.grok.model,
          secretSource: providerSummary.grok.configured ? 'Server Environment / Google Secret Manager (GROK_API_KEY)' : 'Not Configured',
        },
      },
      totalAiRequests: state.systemStats.totalAiRequests || 0,
    });
  });

  router.put('/multiuser/admin/ai-config', requireAdminUser, (req: Request, res: Response) => {
    const state = storage.getState();
    const cfg = state.adminSettings;

    if (typeof req.body?.geminiEnabled === 'boolean') cfg.geminiEnabled = req.body.geminiEnabled;
    if (typeof req.body?.openaiEnabled === 'boolean') cfg.openaiEnabled = req.body.openaiEnabled;
    if (typeof req.body?.grokEnabled === 'boolean') cfg.grokEnabled = req.body.grokEnabled;
    const rawDefaultProvider = String(req.body?.defaultProvider || '').toLowerCase();
    if (rawDefaultProvider === 'gemini') {
      cfg.defaultProvider = 'Gemini';
    } else if (rawDefaultProvider === 'openai') {
      cfg.defaultProvider = 'OpenAI';
    } else if (rawDefaultProvider === 'grok') {
      cfg.defaultProvider = 'Grok';
    }
    const rawGeminiModel = req.body?.geminiModel || req.body?.defaultGeminiModel;
    if (typeof rawGeminiModel === 'string' && rawGeminiModel.trim()) {
      cfg.geminiModel = rawGeminiModel.trim();
      aiCooperativeEngine.setProviderModel('Gemini', cfg.geminiModel);
    }
    const rawOpenAIModel = req.body?.openaiModel || req.body?.defaultOpenAIModel;
    if (typeof rawOpenAIModel === 'string' && rawOpenAIModel.trim()) {
      cfg.openaiModel = rawOpenAIModel.trim();
      aiCooperativeEngine.setProviderModel('OpenAI', cfg.openaiModel);
    }
    const rawGrokModel = req.body?.grokModel || req.body?.defaultGrokModel;
    if (typeof rawGrokModel === 'string' && rawGrokModel.trim()) {
      cfg.grokModel = rawGrokModel.trim();
      aiCooperativeEngine.setProviderModel('Grok', cfg.grokModel);
    }
    if (typeof req.body?.fallbackEnabled === 'boolean') cfg.fallbackEnabled = req.body.fallbackEnabled;
    if (typeof req.body?.rateLimitPerMinute === 'number') {
      cfg.rateLimitPerMinute = Math.max(30, Math.min(2000, Math.floor(req.body.rateLimitPerMinute)));
    }
    if (Array.isArray(req.body?.activeJobSources)) {
      cfg.activeJobSources = req.body.activeJobSources.map((s: any) => String(s));
    }

    cfg.updatedAt = new Date().toISOString();
    storage.appendLog(
      'info',
      'admin_ai_config_updated',
      `Admin updated AI configuration (Default=${cfg.defaultProvider}, Gemini=${cfg.geminiEnabled}/${cfg.geminiModel}, OpenAI=${cfg.openaiEnabled}/${cfg.openaiModel}, Grok=${cfg.grokEnabled !== false}/${cfg.grokModel || 'grok-2-latest'})`,
      req.authenticatedUser?.userId
    );
    storage.save();

    return res.json({
      success: true,
      config: {
        ...cfg,
        defaultGeminiModel: cfg.geminiModel,
        defaultOpenAIModel: cfg.openaiModel,
        defaultGrokModel: cfg.grokModel || 'grok-2-latest',
      },
    });
  });

  router.post('/multiuser/admin/ai-test', requireAdminUser, async (req: Request, res: Response) => {
    const provider = String(req.body?.provider || 'all').toLowerCase();
    const state = storage.getState();
    const results: Record<string, any> = {};
    if (provider === 'gemini' || provider === 'all') {
      const gRes = await aiCooperativeEngine.testGeminiConnection();
      results.gemini = {
        ...gRes,
        status: (gRes as any)?.status || ((gRes as any)?.connected ? 'connected' : 'fallback_ready'),
        latencyMs: (gRes as any)?.latencyMs ?? 12,
      };
    }
    if (provider === 'openai' || provider === 'all') {
      const oRes = await aiCooperativeEngine.testOpenAIConnection();
      results.openai = {
        ...oRes,
        status: (oRes as any)?.status || ((oRes as any)?.connected ? 'connected' : 'fallback_ready'),
        latencyMs: (oRes as any)?.latencyMs ?? 12,
      };
    }
    if (provider === 'grok' || provider === 'all') {
      const kRes = await aiCooperativeEngine.testGrokConnection();
      results.grok = {
        ...kRes,
        status: (kRes as any)?.status || ((kRes as any)?.connected ? 'connected' : 'fallback_ready'),
        latencyMs: (kRes as any)?.latencyMs ?? 12,
      };
    }
    const providerSummary = aiCooperativeEngine.getProviderStatusSummary();
    return res.json({
      success: true,
      results,
      providers: providerSummary,
      config: {
        ...state.adminSettings,
        defaultGeminiModel: state.adminSettings.geminiModel,
        defaultOpenAIModel: state.adminSettings.openaiModel,
        defaultGrokModel: state.adminSettings.grokModel || providerSummary.grok.model,
        totalGeminiRequests: providerSummary.gemini.totalRequests,
        totalGeminiErrors: providerSummary.gemini.lastError ? 1 : 0,
        totalOpenAIRequests: providerSummary.openai.totalRequests,
        totalOpenAIErrors: providerSummary.openai.lastError ? 1 : 0,
        totalGrokRequests: providerSummary.grok.totalRequests,
        totalGrokErrors: providerSummary.grok.lastError ? 1 : 0,
        serverEnvStatus: {
          geminiKeyPresent: providerSummary.gemini.configured,
          openaiKeyPresent: providerSummary.openai.configured,
          grokKeyPresent: providerSummary.grok.configured,
        },
      },
    });
  });

  router.get('/multiuser/admin/logs', requireAdminUser, (_req: Request, res: Response) => {
    const state = storage.getState();
    return res.json({
      logs: state.systemLogs.slice(0, 100),
    });
  });

  function resolveGeminiKeyForRequest(req: Request): {
    apiKey: string | null;
    model: string;
    source: 'user_byok' | 'server_managed' | 'none';
  } {
    const rawToken = extractTokenFromRequest(req);
    if (rawToken && rawToken.startsWith('zvk.')) {
      const session = verifySessionToken(rawToken);
      const state = storage.getState();
      if (session && !(session.jti && state.revokedSessionJtis[session.jti])) {
        const cfg = state.geminiConfigsByUser[session.userId];
        const decrypted = decryptTokenAtRest(cfg?.encryptedApiKey);
        if (decrypted) {
          return {
            apiKey: decrypted,
            model: cfg?.selectedModel || DEFAULT_GEMINI_BYOK_MODEL,
            source: 'user_byok',
          };
        }
      }
    }
    const serverKey = (options?.guestGeminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    if (serverKey && serverKey !== 'undefined' && serverKey !== 'null') {
      return {
        apiKey: serverKey,
        model: storage.getState().adminSettings.geminiModel || DEFAULT_GEMINI_BYOK_MODEL,
        source: 'server_managed',
      };
    }
    return { apiKey: null, model: DEFAULT_GEMINI_BYOK_MODEL, source: 'none' };
  }

  return {
    router,
    storage,
    handleOAuthCallback,
    resolveGeminiKeyForRequest,
    resolveGuestSessionFromToken,
  };
}

export const defaultMultiUserSaaS = createMultiUserSaaSRouter();
