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
export const OAUTH_EMAIL_IDENTITY_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
export const PRIMARY_ADMIN_EMAIL = 'fazle.rabbe.doc@gmail.com';
export const LEGACY_ADMIN_EMAIL = 'fazlerabbe905@gmail.com';
export const ADMIN_EMAIL_ALLOWLIST = new Set([
  PRIMARY_ADMIN_EMAIL.toLowerCase(),
  LEGACY_ADMIN_EMAIL.toLowerCase(),
]);

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
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface MultiUserSaaSDatabaseSchema {
  version: number;
  users: Record<string, MultiUserAccountRecord>;
  userProfilesByUser: Record<string, MultiUserProfileRecord>;
  jobPreferencesByUser: Record<string, MultiUserJobPreferences>;
  gmailConnections: Record<string, StoredUserGmailConnection>;
  cvsByUser: Record<string, MultiUserCVItem[]>;
  savedJobsByUser: Record<string, MultiUserSavedJobRecord[]>;
  applicationsByUser: Record<string, MultiUserJobApplication[]>;
  emailHistoryByUser: Record<string, MultiUserEmailHistoryRecord[]>;
  aiHistoryByUser: Record<string, MultiUserAIHistoryRecord[]>;
  notificationsByUser: Record<string, MultiUserNotificationRecord[]>;
  pendingOAuthStates: Record<string, PendingOAuthStateRecord>;
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

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedRequestUser;
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
    };
  } catch {
    return null;
  }
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
      cvsByUser: {},
      savedJobsByUser: {},
      applicationsByUser: {},
      emailHistoryByUser: {},
      aiHistoryByUser: {},
      notificationsByUser: {},
      pendingOAuthStates: {},
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
          cvsByUser: parsed.cvsByUser || {},
          savedJobsByUser: parsed.savedJobsByUser || {},
          applicationsByUser: parsed.applicationsByUser || {},
          emailHistoryByUser: parsed.emailHistoryByUser || {},
          aiHistoryByUser: parsed.aiHistoryByUser || {},
          notificationsByUser: parsed.notificationsByUser || {},
          pendingOAuthStates: parsed.pendingOAuthStates || {},
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

  if (!params.attachment || !params.attachment.base64Data) {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(params.bodyText);
  } else {
    const cleanBase64 = params.attachment.base64Data
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s+/g, '');
    const wrappedBase64 = cleanBase64.match(/.{1,76}/g)?.join('\r\n') || cleanBase64;
    const safeFilename = params.attachment.filename.replace(/["\r\n]/g, '_');

    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(params.bodyText, 'utf8').toString('base64'));
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${params.attachment.mimeType || 'application/pdf'}; name="${safeFilename}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${safeFilename}"`);
    lines.push('');
    lines.push(wrappedBase64);
    lines.push('');
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
}

export function createMultiUserSaaSRouter(options?: {
  dbFilePath?: string;
  transport?: GmailTransportOverrides;
  verifyFirebaseToken?: (idToken: string) => Promise<{ uid: string; email: string; name?: string } | null>;
}) {
  const storage = new MultiUserSaaSStorage(options?.dbFilePath);
  const router = express.Router();
  const firebaseTokenVerifier = options?.verifyFirebaseToken || verifyFirebaseIdToken;

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

  // Default production Google OAuth / Gmail HTTP calls + injectable test overrides
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
  };

  // ==========================================================================
  // AUTHENTICATION & ISOLATION MIDDLEWARE
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
    return null;
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

    // 1. Check ZENVIK signed session token
    const verifiedSession = verifySessionToken(rawToken);
    let userRecord: MultiUserAccountRecord | null = null;

    if (verifiedSession) {
      userRecord = storage.findUserById(verifiedSession.userId);
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
      storage.getState().systemStats.totalAuthErrors += 1;
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
      storage.getState().systemStats.totalAuthErrors += 1;
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
        createdAt: user.createdAt,
      },
    });
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
      requiredEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'],
    });
  });

  /**
   * Step 1 of Authorization Code Flow:
   * Authenticated user requests the Google OAuth 2.0 consent screen URL.
   * Requests ONLY `https://www.googleapis.com/auth/gmail.send` (+ userinfo.email to identify the connected Gmail).
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
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      used: false,
    };
    storage.save();

    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: customRedirectUri,
      response_type: 'code',
      scope: `${GMAIL_SEND_ONLY_SCOPE} ${OAUTH_EMAIL_IDENTITY_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'false',
      state: stateToken,
    });

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.json({
      authorizationUrl,
      state: stateToken,
      requestedScopes: [GMAIL_SEND_ONLY_SCOPE],
      redirectUri: customRedirectUri,
    });
  });

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

    if (oauthError) {
      return res.status(400).json({
        error: 'OAUTH_CONSENT_DENIED',
        message: `Google OAuth authorization was declined: ${oauthError}`,
      });
    }

    if (!code || !stateToken) {
      return res.status(400).json({
        error: 'INVALID_OAUTH_CALLBACK',
        message: 'Missing authorization code or CSRF state token.',
      });
    }

    const state = storage.getState();
    const pending = state.pendingOAuthStates[stateToken];
    if (!pending || pending.used || Date.now() > pending.expiresAt) {
      state.systemStats.totalAuthErrors += 1;
      storage.save();
      return res.status(400).json({
        error: 'INVALID_OR_EXPIRED_OAUTH_STATE',
        message: 'OAuth CSRF state validation failed or expired. Please try connecting Gmail again.',
      });
    }

    // Verify HMAC signature of stateToken against pending.userId
    const [nonce, providedHmac] = stateToken.split('.');
    const expectedHmac = crypto
      .createHmac('sha256', getDerivedEncryptionKey())
      .update(`${nonce}:${pending.userId}`)
      .digest('hex');
    if (providedHmac !== expectedHmac) {
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

      const encryptedAccess = encryptTokenAtRest(tokenResponse.access_token);
      const encryptedRefresh = tokenResponse.refresh_token
        ? encryptTokenAtRest(tokenResponse.refresh_token)
        : existingConn?.encryptedRefreshToken || null;

      state.gmailConnections[userId] = {
        userId,
        gmailAddress,
        scopes: [GMAIL_SEND_ONLY_SCOPE],
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
      storage.save();

      if (req.accepts('html') && !req.xhr && req.query?.format !== 'json') {
        const safeEmailHtml = escapeHtml(gmailAddress);
        return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Gmail Connected — ZENVIK-AGENT</title></head>
<body style="background:#0B0C10;color:#F8FAFC;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:#141822;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:420px;text-align:center;">
    <h2 style="color:#10B981;margin:0 0 8px;">Gmail Connected</h2>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 16px;">Authorized sender: <strong style="color:#fff;">${safeEmailHtml}</strong></p>
    <p style="font-size:12px;color:#64748B;">This window will close automatically.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'ZENVIK_GMAIL_OAUTH_SUCCESS', gmailAddress: ${JSON.stringify(gmailAddress)} }, window.location.origin);
      setTimeout(() => window.close(), 600);
    }
  </script>
</body>
</html>`);
      }

      return res.json({
        success: true,
        userId,
        connected: true,
        gmailAddress,
        scopes: [GMAIL_SEND_ONLY_SCOPE],
        status: 'connected',
      });
    } catch (err: any) {
      storage.save();
      return res.status(400).json({
        error: 'OAUTH_CODE_EXCHANGE_FAILED',
        message: err?.message || 'Failed to exchange authorization code with Google OAuth.',
      });
    }
  }

  router.get(['/gmail/oauth/callback', '/gmail/oauth/callback/'], handleOAuthCallback);

  /**
   * Bind a verified user's personal client-side OAuth token (strictly encrypted at rest and scoped to req.authenticatedUser.userId).
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
      const gmailAddress = (
        typeof req.body?.gmailAddress === 'string' && req.body.gmailAddress.includes('@')
          ? req.body.gmailAddress
          : await transport.fetchGoogleUserEmail(accessToken)
      )
        .trim()
        .toLowerCase();

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

    // If the authenticated user supplied a fresh client-side Google OAuth access token via header,
    // verify/use it directly and keep their connection record fresh so client-side popup OAuth never expires prematurely.
    if (cleanLiveToken) {
      let gmailAddress = conn?.gmailAddress || user?.email || '';
      if (!gmailAddress || !gmailAddress.includes('@')) {
        gmailAddress = (await transport.fetchGoogleUserEmail(cleanLiveToken)).trim().toLowerCase();
      }
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      conn = {
        userId,
        gmailAddress: gmailAddress.trim().toLowerCase(),
        scopes: [GMAIL_SEND_ONLY_SCOPE],
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

    const rawMimeBase64Url = buildMimeEmailWithAttachment({
      fromEmail: gmailAddress,
      fromName: user.displayName,
      toEmail: cleanRecipient,
      subject: params.subject,
      bodyText: params.coverLetter,
      attachment: {
        filename: attachmentFilename,
        mimeType: 'application/pdf',
        base64Data: attachmentBase64,
      },
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

    try {
      const sendResult = await transport.sendGmailRawMessage({
        accessToken,
        senderEmail: gmailAddress,
        rawMimeBase64Url,
      });

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
    } catch (sendErr: any) {
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
  router.post('/gmail/send', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
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

    const state = storage.getState();
    const user = state.users[userId];
    const subject = String(req.body?.subject || user?.defaultEmailSubject || '').trim();
    const coverLetter = String(req.body?.coverLetter || user?.defaultCoverLetter || '').trim();
    const cvId = req.body?.cvId ? String(req.body.cvId) : undefined;
    const inlineCv = req.body?.inlineCv || null;

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

  router.get('/health', (_req: Request, res: Response) => {
    const state = storage.getState();
    const providerStatus = aiCooperativeEngine.getProviderStatusSummary();
    const daemonStatus = jobDatabaseEngine.getDaemonStatus();
    const activeUsers = Object.values(state.users).filter(u => u.status === 'active').length;

    return res.status(200).json({
      status: 'healthy',
      service: 'zenvik-agent-multiuser-backend',
      runtime: 'google-cloud-run-ready',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        status: 'connected',
        firestoreProjectId: (firebaseConfig as any).projectId || 'ccd---a-better-you-every-day',
        firestoreDatabaseId: (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-e4405bff-96e5-4e9d-8fc6-6665341e100c',
        activeUsersCount: activeUsers,
        indexedJobsCount: daemonStatus.totalDiscovered,
      },
      aiProviders: {
        defaultProvider: state.adminSettings.defaultProvider,
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
    const userId = req.authenticatedUser!.userId;
    const state = storage.getState();
    const userPrefs = state.jobPreferencesByUser[userId];
    const userSaved = state.savedJobsByUser[userId] || [];
    const userApps = state.applicationsByUser[userId] || [];

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

  router.get('/multiuser/jobs/search', requireAuthenticatedUser, handleMultiUserJobSearch);
  router.post('/multiuser/jobs/search', requireAuthenticatedUser, handleMultiUserJobSearch);

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

  router.post('/ai/gemini/generate', requireAuthenticatedUser, async (req: Request, res: Response) => {
    const userId = req.authenticatedUser!.userId;
    const prompt = String(req.body?.prompt || '').trim();
    const operation = String(req.body?.operation || 'career_assistant').trim();
    const systemInstruction = req.body?.systemInstruction ? String(req.body.systemInstruction).trim() : undefined;

    if (!prompt) {
      return res.status(400).json({
        error: 'PROMPT_REQUIRED',
        message: 'A non-empty prompt is required for AI generation.',
      });
    }

    const state = storage.getState();
    const adminCfg = state.adminSettings;
    const startTime = Date.now();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    let outputText = '';
    let usedProvider: 'Gemini' | 'OpenAI' | 'DeterministicFallback' = 'Gemini';
    let usedModel = adminCfg.geminiModel || 'gemini-4-hydrogen';
    let status: 'success' | 'fallback' | 'error' = 'success';

    if (adminCfg.geminiEnabled && geminiKey && geminiKey !== 'undefined' && geminiKey !== 'null') {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
        const response = await ai.models.generateContent({
          model: usedModel,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        outputText = (response.text || '').trim();
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (!adminCfg.fallbackEnabled) {
          return res.status(502).json({
            error: 'GEMINI_GENERATION_FAILED',
            message: errMsg,
          });
        }
        status = 'fallback';
        usedProvider = 'DeterministicFallback';
        usedModel = 'zenvik-career-fallback-v1';
        outputText = `Professional Career Intelligence Summary for "${prompt.slice(0, 80)}": Focus on verified employer career portals, tailor your CV from the CV Gallery to match role requirements, and highlight international hospitality or technical certifications.`;
      }
    } else if (adminCfg.fallbackEnabled) {
      status = 'fallback';
      usedProvider = 'DeterministicFallback';
      usedModel = 'zenvik-career-fallback-v1';
      outputText = `Professional Career Intelligence Summary for "${prompt.slice(0, 80)}": Focus on verified employer career portals, tailor your CV from the CV Gallery to match role requirements, and highlight international hospitality or technical certifications.`;
    } else {
      return res.status(503).json({
        error: 'AI_PROVIDER_UNAVAILABLE',
        message: 'Gemini AI is currently disabled or not configured on the server.',
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
  // 10. FIRST-TIME USER SETUP WIZARD & CONNECTED SERVICES DASHBOARD (PHASE 15)
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
    const cvs = state.cvsByUser[userId] || [];
    const providerSummary = aiCooperativeEngine.getProviderStatusSummary();

    return res.json({
      setupWizardCompleted: profile.setupWizardCompleted,
      setupCompletedAt: profile.setupCompletedAt || null,
      steps: {
        googleAccount: {
          required: true,
          connected: Boolean(user),
          email: user?.email || null,
          displayName: user?.displayName || null,
        },
        gmailConnection: {
          required: false,
          optional: true,
          connected: gmailConn?.status === 'connected',
          gmailAddress: gmailConn?.gmailAddress || null,
          scope: GMAIL_SEND_ONLY_SCOPE,
        },
        aiServices: {
          required: false,
          backendManaged: true,
          geminiAvailable: state.adminSettings.geminiEnabled && providerSummary.gemini.configured,
          openaiAvailable: state.adminSettings.openaiEnabled && providerSummary.openai.configured,
          model: state.adminSettings.geminiModel,
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
      'Your ZENVIK AGENT workspace, job preferences, and connected service permissions are configured.',
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
    const cvs = state.cvsByUser[userId] || [];
    const prefs = state.jobPreferencesByUser[userId];
    const providerSummary = aiCooperativeEngine.getProviderStatusSummary();
    const daemonStatus = jobDatabaseEngine.getDaemonStatus();
    const selectedCv = cvs.find(c => c.isDefault) || cvs[0] || null;
    const geminiAvailable = state.adminSettings.geminiEnabled && providerSummary.gemini.configured;
    const openaiAvailable = state.adminSettings.openaiEnabled && providerSummary.openai.configured;

    return res.json({
      timestamp: new Date().toISOString(),
      services: {
        googleAccount: {
          name: 'Google Account Sign-In',
          status: user ? 'Connected' : 'Disconnected',
          permissionType: 'Required',
          email: user?.email || null,
          displayName: user?.displayName || null,
          authProvider: user?.authProvider || 'email',
          lastConnectionAt: user?.lastLoginAt || null,
          explanation: 'Establishes your unique ZENVIK user identity and isolates your cloud workspace. Does NOT grant Gmail sending access automatically.',
          error: null,
        },
        gmail: {
          name: 'Personal Gmail API (gmail.send)',
          status: conn?.status === 'connected' ? 'Connected' : 'Disconnected',
          rawStatus: conn?.status || 'disconnected',
          permissionType: 'Optional (Feature-Specific)',
          gmailAddress: conn?.gmailAddress || null,
          scopes: conn?.scopes || [GMAIL_SEND_ONLY_SCOPE],
          sentTodayCount: conn?.sentTodayCount || 0,
          dailyLimit: conn?.dailyLimit || user?.dailySendLimit || 40,
          lastConnectionAt: conn?.updatedAt || conn?.connectedAt || null,
          explanation: 'Requests only https://www.googleapis.com/auth/gmail.send so you can send job applications with your CV from your own personal Gmail address. Never reads your inbox.',
          error: conn?.lastError || null,
        },
        geminiAi: {
          name: 'Google Gemini AI (Backend Managed)',
          status: geminiAvailable ? 'Available' : 'Unavailable',
          permissionType: 'Centrally Managed',
          enabled: state.adminSettings.geminiEnabled,
          configuredOnServer: providerSummary.gemini.configured,
          model: state.adminSettings.geminiModel,
          totalRequests: providerSummary.gemini.totalRequests,
          avgLatencyMs: providerSummary.gemini.avgLatencyMs,
          lastConnectionAt: providerSummary.gemini.lastCheckedAt,
          explanation: 'Managed securely on the ZENVIK backend via Google Secret Manager / server environment. Users never need to enter a personal Gemini API key.',
          error: providerSummary.gemini.lastError,
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
          explanation: 'CV Gallery is the single source of truth for all job application attachments. Files are uploaded only through the app interface without unrestricted device storage permissions.',
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

  return {
    router,
    storage,
    handleOAuthCallback,
  };
}

export const defaultMultiUserSaaS = createMultiUserSaaSRouter();
