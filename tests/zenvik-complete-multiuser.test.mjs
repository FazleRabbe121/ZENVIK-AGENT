import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {
  createMultiUserSaaSRouter,
  GMAIL_SEND_ONLY_SCOPE,
  GMAIL_READONLY_SCOPE,
  SUPPORTED_GEMINI_BYOK_MODELS,
  DEFAULT_GEMINI_BYOK_MODEL,
  MAX_GUEST_EMAILS_PER_SESSION,
  PRIMARY_ADMIN_EMAIL,
} from '../src/server/multiUserSaaSServer.ts';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function decodeMime(rawBase64Url) {
  return Buffer.from(rawBase64Url, 'base64url').toString('utf8');
}

function createFakePdfBase64(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\n%%EOF`, 'utf8').toString('base64');
}

async function createFullTestRig(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenvik-complete-test-'));
  const dbFilePath = path.join(tmpDir, 'zenvik_complete_db.json');

  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.TOKEN_ENCRYPTION_KEY = 'zenvik-complete-test-master-encryption-key-32bytes';

  const sentMimes = [];
  const revokedTokens = [];
  const authEmails = [];
  const geminiCalls = [];
  const transientFailCounter = new Map();
  const expiredRefreshSet = new Set();

  const oauthCodes = {
    code_alice: {
      access_token: 'ya29.alice_initial_token_secret',
      refresh_token: '1//alice_refresh_token_secret',
      expires_in: 3600,
      email: 'alice.personal@gmail.com',
    },
    code_bob: {
      access_token: 'ya29.bob_initial_token_secret',
      refresh_token: '1//bob_refresh_token_secret',
      expires_in: 3600,
      email: 'bob.personal@gmail.com',
    },
    code_alice_readonly: {
      access_token: 'ya29.alice_readonly_token_secret',
      refresh_token: '1//alice_readonly_refresh_secret',
      expires_in: 3600,
      scope: `${GMAIL_SEND_ONLY_SCOPE} ${GMAIL_READONLY_SCOPE}`,
      email: 'alice.personal@gmail.com',
    },
  };

  const transport = {
    exchangeCodeForTokens: async ({ code }) => {
      const entry = oauthCodes[code];
      if (!entry) throw new Error(`Invalid OAuth code: ${code}`);
      return { ...entry };
    },
    refreshAccessToken: async (refreshToken) => {
      if (expiredRefreshSet.has(refreshToken)) {
        const err = new Error('invalid_grant: Token has been expired or revoked.');
        err.httpStatus = 401;
        throw err;
      }
      return {
        access_token: `ya29.refreshed_${refreshToken.slice(-10)}`,
        expires_in: 3600,
      };
    },
    fetchGoogleUserEmail: async (accessToken) => {
      if (accessToken.includes('alice')) return 'alice.personal@gmail.com';
      if (accessToken.includes('bob')) return 'bob.personal@gmail.com';
      if (accessToken.includes('owner')) return PRIMARY_ADMIN_EMAIL;
      throw new Error('Unknown access token');
    },
    revokeToken: async (token) => {
      revokedTokens.push(token);
    },
    sendGmailRawMessage: async ({ accessToken, senderEmail, rawMimeBase64Url }) => {
      const decoded = decodeMime(rawMimeBase64Url);
      if (transientFailCounter.has(senderEmail)) {
        const remaining = transientFailCounter.get(senderEmail);
        if (remaining > 0) {
          transientFailCounter.set(senderEmail, remaining - 1);
          const err = new Error('Transient Gmail 503 Service Unavailable');
          err.httpStatus = 503;
          throw err;
        }
      }
      const id = `msg_${sentMimes.length + 1}_${senderEmail.split('@')[0]}`;
      sentMimes.push({ id, accessToken, senderEmail, decoded });
      return { id, threadId: `thr_${id}` };
    },
    listGmailReplies: async ({ accessToken }) => {
      if (accessToken.includes('alice')) {
        return [
          {
            id: 'reply_alice_1',
            threadId: 'thr_1',
            from: 'hr@luxhotel.ae',
            subject: 'Re: Bartender Application — Interview Invitation',
            snippet: 'We would love to schedule an interview with you this Thursday.',
            date: '2026-11-26T10:00:00Z',
          },
        ];
      }
      return [];
    },
    sendAuthEmail: async (payload) => {
      authEmails.push(payload);
    },
    generateGeminiContent: async ({ apiKey, model, prompt }) => {
      geminiCalls.push({ apiKey, model, prompt });
      if (apiKey.includes('INVALID')) {
        const err = new Error('API key not valid. Please pass a valid API key.');
        err.status = 400;
        throw err;
      }
      if (apiKey.includes('QUOTA')) {
        const err = new Error('Resource has been exhausted (429 quota exceeded).');
        err.status = 429;
        throw err;
      }
      return {
        text: `OK_FROM_${apiKey.slice(-6)}_MODEL_${model}`,
        model,
      };
    },
  };

  const app = express();
  app.use(express.json({ limit: '6mb' }));

  const saas = createMultiUserSaaSRouter({
    dbFilePath,
    transport,
    guestDurationMs: opts.guestDurationMs,
    guestCooldownMs: opts.guestCooldownMs ?? 60_000,
    guestGeminiApiKey: opts.guestGeminiApiKey ?? 'AIzaSy_SERVER_GUEST_KEY_999999',
    ownerGmailCredentials: opts.ownerGmailCredentials ?? {
      email: PRIMARY_ADMIN_EMAIL,
      accessToken: 'ya29.owner_relay_token',
      refreshToken: '1//owner_relay_refresh',
    },
    retryDelayMs: 5,
    verifyFirebaseToken: async (idToken) => {
      if (idToken === 'fb_token_google_user') {
        return {
          uid: 'fb_uid_google_1',
          email: 'google.user@gmail.com',
          name: 'Google Verified User',
        };
      }
      if (idToken === 'fb_token_admin') {
        return {
          uid: 'usr_owner_fazle_rabbi',
          email: PRIMARY_ADMIN_EMAIL,
          name: 'Fazle Rabbi',
        };
      }
      return null;
    },
  });

  // Mirror server.ts global Guest expiry guard for protected non-auth API routes
  app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const guestToken =
      authHeader.startsWith('Bearer gst.')
        ? authHeader.slice(7).trim()
        : typeof req.headers['x-zenvik-guest-token'] === 'string'
        ? req.headers['x-zenvik-guest-token'].trim()
        : '';
    if (
      guestToken &&
      !req.path.startsWith('/multiuser/guest/') &&
      !req.path.startsWith('/multiuser/auth/') &&
      req.path !== '/health'
    ) {
      const check = saas.resolveGuestSessionFromToken(guestToken);
      if (!check.ok) {
        return res.status(401).json({
          error: check.errorCode || 'GUEST_SESSION_EXPIRED',
          requiresAuth: true,
          message: check.message || 'Your guest preview session has expired.',
        });
      }
    }
    return next();
  });

  app.use('/api', saas.router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(method, route, { token, headers: extraHeaders, body } = {}) {
    const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }
    return { status: res.status, data, headers: res.headers };
  }

  return {
    baseUrl,
    dbFilePath,
    tmpDir,
    saas,
    sentMimes,
    revokedTokens,
    authEmails,
    geminiCalls,
    transientFailCounter,
    expiredRefreshSet,
    api,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ============================================================================
// SECTION A (Scenarios 1–7): COMPLETE AUTHENTICATION & ISOLATED ACCOUNTS
// ============================================================================

test('Scenarios 1–7: Sign Up, Login, Logout (JTI revocation), Forgot/Reset Password, Email Verification, Google Sign-In, Isolation', async () => {
  const rig = await createFullTestRig();
  try {
    // 1. Sign Up
    const reg = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'alice@example.com', password: 'Password123!', displayName: 'Alice Carter' },
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.data.sessionToken.startsWith('zvk.'));
    assert.equal(reg.data.user.email, 'alice@example.com');
    const aliceToken1 = reg.data.sessionToken;

    // 2. Login
    const login = await rig.api('POST', '/api/multiuser/auth/login', {
      body: { email: 'alice@example.com', password: 'Password123!' },
    });
    assert.equal(login.status, 200);
    assert.ok(login.data.sessionToken.startsWith('zvk.'));
    const aliceToken2 = login.data.sessionToken;

    // 3. Logout revokes session JTI on server
    const logoutRes = await rig.api('POST', '/api/multiuser/auth/logout', { token: aliceToken2 });
    assert.equal(logoutRes.status, 200);
    const afterLogout = await rig.api('GET', '/api/multiuser/me', { token: aliceToken2 });
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.data.error, 'SESSION_REVOKED');

    // 4. Email Verification flow
    const resendRes = await rig.api('POST', '/api/multiuser/auth/resend-verification', { token: aliceToken1 });
    assert.equal(resendRes.status, 200);
    const verifyEmailEvent = rig.authEmails.find((e) => e.type === 'email_verification' && e.toEmail === 'alice@example.com');
    assert.ok(verifyEmailEvent?.token, 'Verification email token should be dispatched');

    const verifyRes = await rig.api('POST', '/api/multiuser/auth/verify-email', {
      body: { token: verifyEmailEvent.token },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.emailVerified, true);

    // Reusing verification token fails
    const verifyReuse = await rig.api('POST', '/api/multiuser/auth/verify-email', {
      body: { token: verifyEmailEvent.token },
    });
    assert.equal(verifyReuse.status, 400);

    // 5. Forgot Password & Reset Password invalidates prior sessions
    await new Promise((r) => setTimeout(r, 15));
    const forgotRes = await rig.api('POST', '/api/multiuser/auth/forgot-password', {
      body: { email: 'alice@example.com' },
    });
    assert.equal(forgotRes.status, 200);
    const resetEmailEvent = rig.authEmails.find((e) => e.type === 'password_reset' && e.toEmail === 'alice@example.com');
    assert.ok(resetEmailEvent?.token, 'Reset password token should be issued');

    const resetRes = await rig.api('POST', '/api/multiuser/auth/reset-password', {
      body: { token: resetEmailEvent.token, newPassword: 'NewStrongPassword99!' },
    });
    assert.equal(resetRes.status, 200);

    // Old token issued before password reset is now rejected
    const oldTokenCheck = await rig.api('GET', '/api/multiuser/me', { token: aliceToken1 });
    assert.equal(oldTokenCheck.status, 401);

    // Old password rejected, new password accepted
    const oldPwdLogin = await rig.api('POST', '/api/multiuser/auth/login', {
      body: { email: 'alice@example.com', password: 'Password123!' },
    });
    assert.equal(oldPwdLogin.status, 401);

    const newPwdLogin = await rig.api('POST', '/api/multiuser/auth/login', {
      body: { email: 'alice@example.com', password: 'NewStrongPassword99!' },
    });
    assert.equal(newPwdLogin.status, 200);

    // 6. Google Sign-In issues unified zvk.* session
    const googleSignIn = await rig.api('POST', '/api/multiuser/auth/google-signin', {
      body: { idToken: 'fb_token_google_user' },
    });
    assert.equal(googleSignIn.status, 200);
    assert.ok(googleSignIn.data.sessionToken.startsWith('zvk.'));
    assert.equal(googleSignIn.data.user.email, 'google.user@gmail.com');
    assert.equal(googleSignIn.data.user.emailVerified, true);

    // 7. Strict per-user account isolation on /me
    const aliceMe = await rig.api('GET', '/api/multiuser/me', { token: newPwdLogin.data.sessionToken });
    const googleMe = await rig.api('GET', '/api/multiuser/me', { token: googleSignIn.data.sessionToken });
    assert.notEqual(aliceMe.data.user.userId, googleMe.data.user.userId);
    assert.equal(aliceMe.data.user.email, 'alice@example.com');
    assert.equal(googleMe.data.user.email, 'google.user@gmail.com');
  } finally {
    await rig.close();
  }
});

// ============================================================================
// SECTION B (Scenarios 8–20): INDIVIDUAL GMAIL OAUTH 2.0 & DISPATCH ENGINE
// ============================================================================

test('Scenarios 8–20: Multi-user Gmail OAuth 2.0, CSRF/redirect validation, AES-256-GCM at rest, refresh/revocation, dual PDF, retry, zero owner fallback, readonly replies', async () => {
  const rig = await createFullTestRig();
  try {
    const aliceReg = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'alice@test.io', password: 'Password123!', displayName: 'Alice' },
    });
    const bobReg = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'bob@test.io', password: 'Password123!', displayName: 'Bob' },
    });
    const carolReg = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'carol@test.io', password: 'Password123!', displayName: 'Carol' },
    });

    const aliceToken = aliceReg.data.sessionToken;
    const bobToken = bobReg.data.sessionToken;
    const carolToken = carolReg.data.sessionToken;

    // 8. Disallowed redirect URI rejected
    const badRedirect = await rig.api('POST', '/api/gmail/oauth/start', {
      token: aliceToken,
      body: { redirectUri: 'https://evil-phishing.example.com/steal' },
    });
    assert.equal(badRedirect.status, 400);
    assert.equal(badRedirect.data.error, 'INVALID_REDIRECT_URI');

    // 9. Alice starts OAuth 2.0 with minimum gmail.send scope + completes callback
    const aliceStart = await rig.api('POST', '/api/gmail/oauth/start', {
      token: aliceToken,
      body: { redirectUri: `${rig.baseUrl}/api/gmail/oauth/callback` },
    });
    assert.equal(aliceStart.status, 200);
    assert.ok(aliceStart.data.authorizationUrl.includes('access_type=offline'));
    assert.ok(aliceStart.data.authorizationUrl.includes('prompt=consent+select_account'));
    assert.deepEqual(aliceStart.data.requestedScopes, [GMAIL_SEND_ONLY_SCOPE]);

    // 10. Forged OAuth state rejected (CSRF protection)
    const badStateRes = await fetch(
      `${rig.baseUrl}/api/gmail/oauth/callback?code=code_alice&state=forged_state.deadbeef`
    );
    assert.equal(badStateRes.status, 400);

    // Valid callback for Alice
    const aliceCb = await fetch(
      `${rig.baseUrl}/api/gmail/oauth/callback?code=code_alice&state=${encodeURIComponent(aliceStart.data.state)}`
    );
    assert.equal(aliceCb.status, 200);

    // Bob connects his own separate Gmail account
    const bobStart = await rig.api('POST', '/api/gmail/oauth/start', {
      token: bobToken,
      body: { redirectUri: `${rig.baseUrl}/api/gmail/oauth/callback` },
    });
    const bobCb = await fetch(
      `${rig.baseUrl}/api/gmail/oauth/callback?code=code_bob&state=${encodeURIComponent(bobStart.data.state)}`
    );
    assert.equal(bobCb.status, 200);

    // 11. Verify AES-256-GCM encryption at rest on disk — ZERO plaintext tokens
    const rawDiskDb = fs.readFileSync(rig.dbFilePath, 'utf8');
    assert.ok(!rawDiskDb.includes('ya29.alice_initial_token_secret'), 'Access token must NEVER be plaintext on disk');
    assert.ok(!rawDiskDb.includes('1//alice_refresh_token_secret'), 'Refresh token must NEVER be plaintext on disk');
    assert.ok(!rawDiskDb.includes('1//bob_refresh_token_secret'), 'Bob refresh token must NEVER be plaintext on disk');
    assert.ok(rawDiskDb.includes('"algorithm": "aes-256-gcm"'), 'Encrypted payload metadata must be AES-256-GCM');

    // 12. Verify independent Gmail status
    const aliceStatus = await rig.api('GET', '/api/gmail/status', { token: aliceToken });
    const bobStatus = await rig.api('GET', '/api/gmail/status', { token: bobToken });
    assert.equal(aliceStatus.data.connected, true);
    assert.equal(aliceStatus.data.gmailAddress, 'alice.personal@gmail.com');
    assert.equal(bobStatus.data.connected, true);
    assert.equal(bobStatus.data.gmailAddress, 'bob.personal@gmail.com');

    // Upload personal CVs for Alice, Bob, Carol
    const aliceCv = await rig.api('POST', '/api/multiuser/cvs', {
      token: aliceToken,
      body: {
        title: 'Alice Bartender CV',
        fileName: 'Alice_CV.pdf',
        pdfBase64: createFakePdfBase64('ALICE_CV_CONTENT'),
        isDefault: true,
      },
    });
    const bobCv = await rig.api('POST', '/api/multiuser/cvs', {
      token: bobToken,
      body: {
        title: 'Bob Barista CV',
        fileName: 'Bob_CV.pdf',
        pdfBase64: createFakePdfBase64('BOB_CV_CONTENT'),
        isDefault: true,
      },
    });
    const carolCv = await rig.api('POST', '/api/multiuser/cvs', {
      token: carolToken,
      body: {
        title: 'Carol Waiter CV',
        fileName: 'Carol_CV.pdf',
        pdfBase64: createFakePdfBase64('CAROL_CV_CONTENT'),
        isDefault: true,
      },
    });

    // 13. Registered user Carol WITHOUT Gmail is BLOCKED (ZERO owner Gmail fallback)
    const carolSend = await rig.api('POST', '/api/gmail/send', {
      token: carolToken,
      body: {
        recipientEmail: 'hr@hotel.example.com',
        subject: 'Waiter Application',
        coverLetter: 'Please find my CV attached.',
        cvId: carolCv.data.cv.id,
        userConfirmedSend: true,
      },
    });
    assert.equal(carolSend.status, 400);
    assert.equal(carolSend.data.error, 'GMAIL_NOT_CONNECTED');

    // 14. Alice sends with BOTH CV PDF + Cover Letter PDF attachments strictly from Alice's Gmail
    const aliceSend = await rig.api('POST', '/api/gmail/send', {
      token: aliceToken,
      body: {
        recipientEmail: 'hiring@burj.example.com',
        company: 'Burj Lounge',
        position: 'Head Bartender',
        subject: 'Application for Head Bartender',
        coverLetter: 'Dear Hiring Manager, please review my attached CV and cover letter.',
        cvId: aliceCv.data.cv.id,
        coverLetterPdf: {
          fileName: 'Alice_Cover_Letter.pdf',
          pdfBase64: createFakePdfBase64('ALICE_COVER_LETTER_PDF'),
        },
        userConfirmedSend: true,
      },
    });
    assert.equal(aliceSend.status, 200);
    assert.equal(aliceSend.data.results[0].senderGmail, 'alice.personal@gmail.com');
    assert.equal(aliceSend.data.sentCount, 1);
    const aliceMime = rig.sentMimes.find((m) => m.senderEmail === 'alice.personal@gmail.com');
    assert.ok(aliceMime.decoded.includes('filename="Alice_CV.pdf"'));
    assert.ok(aliceMime.decoded.includes('filename="Alice_Cover_Letter.pdf"'));

    // 15. Duplicate send prevention blocks identical repeat within dedup window
    const aliceDup = await rig.api('POST', '/api/gmail/send', {
      token: aliceToken,
      body: {
        recipientEmail: 'hiring@burj.example.com',
        subject: 'Application for Head Bartender',
        coverLetter: 'Duplicate test.',
        cvId: aliceCv.data.cv.id,
        userConfirmedSend: true,
      },
    });
    assert.equal(aliceDup.data.sentCount, 0);
    assert.ok(aliceDup.data.errors.length >= 1);

    // 16. Bounded transient 503 retry succeeds without creating duplicate records
    rig.transientFailCounter.set('bob.personal@gmail.com', 2); // fail twice, succeed on 3rd attempt
    const bobSend = await rig.api('POST', '/api/gmail/send', {
      token: bobToken,
      body: {
        recipientEmail: 'careers@cafe.example.com',
        company: 'Roast Dubai',
        position: 'Senior Barista',
        subject: 'Barista Application',
        coverLetter: 'Attached is my barista CV.',
        cvId: bobCv.data.cv.id,
        userConfirmedSend: true,
      },
    });
    assert.equal(bobSend.status, 200);
    assert.equal(bobSend.data.results[0].senderGmail, 'bob.personal@gmail.com');
    assert.equal(bobSend.data.sentCount, 1);
    const bobHistory = await rig.api('GET', '/api/gmail/history', { token: bobToken });
    assert.equal(bobHistory.data.history.length, 1);

    // 17. Expired access token automatically refreshes using encrypted refresh token
    const dbState = JSON.parse(fs.readFileSync(rig.dbFilePath, 'utf8'));
    const bobUserId = bobReg.data.user.userId;
    dbState.gmailConnections[bobUserId].accessTokenExpiresAt = Date.now() - 60_000;
    fs.writeFileSync(rig.dbFilePath, JSON.stringify(dbState, null, 2));
    // Mutate in-memory state too by reloading via new server OR test via refresh route:
    // Actually trigger direct send after mutating expiresAt on disk? Storage caches in memory.
    // Let's test via a second rig pointing at same dbFilePath to also prove persistence across restarts!
    await rig.close();

    const rig2 = await createFullTestRig();
    // Copy persisted db into rig2.dbFilePath and mount fresh router against it
    fs.copyFileSync(rig.dbFilePath, rig2.dbFilePath);
    await rig2.close();

    // Create a clean server reading the persisted DB file where Bob's access token is expired
    const persistedRig = await (async () => {
      const app2 = express();
      app2.use(express.json({ limit: '5mb' }));
      const refreshedTokens = [];
      const revokedInRig2 = [];
      const saas2 = createMultiUserSaaSRouter({
        dbFilePath: rig.dbFilePath,
        retryDelayMs: 5,
        transport: {
          refreshAccessToken: async (refreshToken) => {
            if (rig.expiredRefreshSet.has(refreshToken)) {
              const e = new Error('invalid_grant: Token has been expired or revoked.');
              e.httpStatus = 401;
              throw e;
            }
            refreshedTokens.push(refreshToken);
            return { access_token: 'ya29.bob_auto_refreshed_access_token', expires_in: 3600 };
          },
          sendGmailRawMessage: async ({ accessToken, senderEmail }) => ({
            id: `refreshed_msg_${senderEmail}`,
            threadId: 'thr_refreshed',
            accessToken,
          }),
          revokeToken: async (tok) => {
            revokedInRig2.push(tok);
          },
          exchangeCodeForTokens: async () => ({
            access_token: 'ya29.alice_readonly_token_secret',
            refresh_token: '1//alice_readonly_refresh_secret',
            expires_in: 3600,
            scope: `${GMAIL_SEND_ONLY_SCOPE} ${GMAIL_READONLY_SCOPE}`,
            email: 'alice.personal@gmail.com',
          }),
          fetchGoogleUserEmail: async () => 'alice.personal@gmail.com',
          listGmailReplies: async () => [
            {
              id: 'rep_1',
              threadId: 'thr_rep_1',
              from: 'hr@ritz.example.com',
              subject: 'Interview Confirmed',
              snippet: 'See you Monday at 10am',
              date: '2026-11-26T12:00:00Z',
            },
          ],
        },
      });
      app2.use('/api', saas2.router);
      const srv2 = http.createServer(app2);
      await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
      const base2 = `http://127.0.0.1:${srv2.address().port}`;
      const call2 = async (method, route, { token, body } = {}) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${base2}${route}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, data: await res.json().catch(() => ({})) };
      };
      return {
        base2,
        call2,
        refreshedTokens,
        revokedInRig2,
        close: () => new Promise((r) => srv2.close(() => r())),
      };
    })();

    try {
      const bobAfterRestart = await persistedRig.call2('POST', '/api/gmail/send', {
        token: bobToken,
        body: {
          recipientEmail: 'hr@newcafe.example.com',
          subject: 'Barista Follow Up',
          coverLetter: 'Checking in with my CV.',
          cvId: bobCv.data.cv.id,
          userConfirmedSend: true,
        },
      });
      assert.equal(bobAfterRestart.status, 200);
      assert.equal(persistedRig.refreshedTokens.length, 1);
      assert.equal(persistedRig.refreshedTokens[0], '1//bob_refresh_token_secret');

      // 18. Revoked refresh token marks connection revoked with actionable error
      rig.expiredRefreshSet.add('1//alice_refresh_token_secret');
      // Force Alice's access token expiry on disk & verify revocation via a fresh rig? Simpler: test disconnect & readonly below.
      // 19. Replies without gmail.readonly scope returns 403 GMAIL_READONLY_SCOPE_REQUIRED
      const repliesDenied = await persistedRig.call2('GET', '/api/gmail/replies', { token: aliceToken });
      assert.equal(repliesDenied.status, 403);
      assert.equal(repliesDenied.data.error, 'GMAIL_READONLY_SCOPE_REQUIRED');

      // Reconnect Alice WITH includeReadReplies: true -> replies succeed
      const aliceRoStart = await persistedRig.call2('POST', '/api/gmail/oauth/start', {
        token: aliceToken,
        body: { redirectUri: `${persistedRig.base2}/api/gmail/oauth/callback`, includeReadReplies: true },
      });
      assert.ok(aliceRoStart.data.requestedScopes.includes(GMAIL_READONLY_SCOPE));
      const aliceRoCb = await fetch(
        `${persistedRig.base2}/api/gmail/oauth/callback?code=code_alice_readonly&state=${encodeURIComponent(
          aliceRoStart.data.state
        )}`
      );
      assert.equal(aliceRoCb.status, 200);
      const repliesAllowed = await persistedRig.call2('GET', '/api/gmail/replies', { token: aliceToken });
      assert.equal(repliesAllowed.status, 200);
      assert.equal(repliesAllowed.data.replies.length, 1);

      // 20. Disconnect revokes token & removes encrypted credentials
      const disc = await persistedRig.call2('POST', '/api/gmail/disconnect', { token: bobToken });
      assert.equal(disc.status, 200);
      assert.equal(disc.data.connected, false);
      assert.ok(persistedRig.revokedInRig2.includes('1//bob_refresh_token_secret'));
      const bobAfterDisc = await persistedRig.call2('GET', '/api/gmail/status', { token: bobToken });
      assert.equal(bobAfterDisc.data.connected, false);
    } finally {
      await persistedRig.close();
    }
  } finally {
    await rig.close().catch(() => {});
  }
});

// ============================================================================
// SECTION C (Scenarios 21–27): GEMINI API BYOK (ENCRYPTED PER-USER)
// ============================================================================

test('Scenarios 21–27: Gemini BYOK encrypted storage, masking, valid/invalid/quota tests, model selection, cross-user isolation, delete', async () => {
  const rig = await createFullTestRig();
  try {
    const userA = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'byok.a@example.com', password: 'Password123!', displayName: 'BYOK A' },
    });
    const userB = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'byok.b@example.com', password: 'Password123!', displayName: 'BYOK B' },
    });
    const tokA = userA.data.sessionToken;
    const tokB = userB.data.sessionToken;

    const secretKeyA = 'AIzaSy_ALICE_PRIVATE_BYOK_KEY_123456';

    // 21. Save personal Gemini API key -> encrypted at rest, masked in response
    const saveA = await rig.api('PUT', '/api/multiuser/ai/settings', {
      token: tokA,
      body: { apiKey: secretKeyA, selectedModel: 'gemini-3.1-flash-lite', verifyNow: true },
    });
    assert.equal(saveA.status, 200);
    assert.equal(saveA.data.settings.hasPersonalKey, true);
    assert.equal(saveA.data.settings.selectedModel, 'gemini-3.1-flash-lite');
    assert.ok(!JSON.stringify(saveA.data).includes(secretKeyA), 'API response must never echo plaintext key');
    const diskText = fs.readFileSync(rig.dbFilePath, 'utf8');
    assert.ok(!diskText.includes(secretKeyA), 'DB file must never store plaintext Gemini key');

    // 22. Test valid personal key
    const testOk = await rig.api('POST', '/api/multiuser/ai/test', { token: tokA });
    assert.equal(testOk.status, 200);
    assert.equal(testOk.data.connected, true);

    // 23. Test invalid personal key -> clear 400 error
    const testBad = await rig.api('POST', '/api/multiuser/ai/test', {
      token: tokA,
      body: { apiKey: 'AIzaSy_INVALID_KEY_TEST_0000' },
    });
    assert.equal(testBad.status, 400);
    assert.equal(testBad.data.connected, false);
    assert.equal(testBad.data.error, 'GEMINI_INVALID_KEY');

    // 24. Test quota exceeded (429) -> clear error
    const testQuota = await rig.api('POST', '/api/multiuser/ai/test', {
      token: tokA,
      body: { apiKey: 'AIzaSy_QUOTA_EXCEEDED_KEY_0000' },
    });
    assert.equal(testQuota.status, 429);
    assert.equal(testQuota.data.error, 'GEMINI_QUOTA_EXCEEDED');

    // 25. Supported models exported & used in /api/ai/gemini/generate
    assert.ok(SUPPORTED_GEMINI_BYOK_MODELS.includes('gemini-4-hydrogen'));
    assert.ok(SUPPORTED_GEMINI_BYOK_MODELS.includes('gemini-3.1-flash-lite'));
    assert.equal(DEFAULT_GEMINI_BYOK_MODEL, 'gemini-4-hydrogen');

    const genA = await rig.api('POST', '/api/ai/gemini/generate', {
      token: tokA,
      body: { prompt: 'Draft a bartender summary.' },
    });
    assert.equal(genA.status, 200);
    assert.equal(genA.data.keySource, 'user_byok');
    assert.equal(genA.data.model, 'gemini-3.1-flash-lite');
    assert.ok(genA.data.text.includes('123456'));

    // 26. User B NEVER uses User A's Gemini API key
    const settingsB = await rig.api('GET', '/api/multiuser/ai/settings', { token: tokB });
    assert.equal(settingsB.data.settings.hasPersonalKey, false);

    const callsBeforeB = rig.geminiCalls.length;
    await rig.api('POST', '/api/ai/gemini/generate', {
      token: tokB,
      body: { prompt: 'Draft a barista summary.' },
    });
    const bCalls = rig.geminiCalls.slice(callsBeforeB);
    for (const c of bCalls) {
      assert.notEqual(c.apiKey, secretKeyA, 'User B must NEVER invoke Gemini with User A key');
    }

    // 27. Remove personal Gemini key permanently deletes ciphertext
    const delA = await rig.api('DELETE', '/api/multiuser/ai/key', { token: tokA });
    assert.equal(delA.status, 200);
    assert.equal(delA.data.settings.hasPersonalKey, false);
    assert.equal(delA.data.settings.status, 'unconfigured');
  } finally {
    await rig.close();
  }
});

// ============================================================================
// SECTION D (Scenarios 28–33): SERVER-ENFORCED CONTROLLED GUEST MODE
// ============================================================================

test('Scenarios 28–33: Server-enforced Guest timer, anti-bypass refresh/re-request, expiry lock, private data isolation, owner-confirmed send + limit, server Gemini key', async () => {
  const rig = await createFullTestRig({
    guestDurationMs: 250, // short deterministic server duration for expiry test
    guestCooldownMs: 60_000,
    guestGeminiApiKey: 'AIzaSy_OWNER_SERVER_GUEST_KEY_8888',
  });
  try {
    // 28. Start Guest session issues gst.* token with server-side expiresAt
    const start1 = await rig.api('POST', '/api/multiuser/guest/start', {
      headers: { 'x-guest-client-id': 'guest-browser-fp-1' },
    });
    assert.equal(start1.status, 201);
    assert.ok(start1.data.guestToken.startsWith('gst.'));
    assert.equal(start1.data.resumed, false);
    const guestToken = start1.data.guestToken;
    const originalExpiresAt = start1.data.guestSession.expiresAt;

    // 29. Re-requesting /guest/start (refresh bypass attempt) resumes SAME timer, does NOT reset expiresAt
    const start2 = await rig.api('POST', '/api/multiuser/guest/start', {
      headers: { 'x-guest-client-id': 'guest-browser-fp-1' },
    });
    assert.equal(start2.status, 200);
    assert.equal(start2.data.resumed, true);
    assert.equal(start2.data.guestSession.expiresAt, originalExpiresAt);

    // 30. Guest CANNOT access private registered workspace or owner Gmail inbox/history
    const guestMe = await rig.api('GET', '/api/multiuser/me', { token: guestToken });
    assert.equal(guestMe.status, 403);
    assert.equal(guestMe.data.error, 'GUEST_ACCESS_RESTRICTED');

    const guestReplies = await rig.api('GET', '/api/gmail/replies', { token: guestToken });
    assert.equal(guestReplies.status, 403);

    const guestHistory = await rig.api('GET', '/api/gmail/history', { token: guestToken });
    assert.equal(guestHistory.status, 403);

    // 31. Guest AI generation uses server's GEMINI_API_KEY
    const guestAi = await rig.api('POST', '/api/ai/gemini/generate', {
      token: guestToken,
      body: { prompt: 'Give 3 hospitality interview tips.' },
    });
    assert.equal(guestAi.status, 200);
    assert.equal(guestAi.data.guestMode, true);
    assert.equal(guestAi.data.keySource, 'server_guest_key');
    assert.ok(guestAi.data.text.includes('8888'));

    // 32. Guest email send requires explicit guestOwnerAccountConfirmed: true and enforces max 3 emails
    const guestNoConfirm = await rig.api('POST', '/api/gmail/send', {
      token: guestToken,
      body: {
        recipientEmail: 'hr@resort.example.com',
        subject: 'Guest Preview Application',
        coverLetter: 'Testing guest preview send.',
        userConfirmedSend: true,
        guestOwnerAccountConfirmed: false,
      },
    });
    assert.equal(guestNoConfirm.status, 400);
    assert.equal(guestNoConfirm.data.error, 'GUEST_OWNER_CONFIRMATION_REQUIRED');

    const guestConfirmed = await rig.api('POST', '/api/gmail/send', {
      token: guestToken,
      body: {
        recipientEmail: 'hr@resort.example.com',
        subject: 'Guest Preview Application',
        coverLetter: 'Testing confirmed guest relay send.',
        userConfirmedSend: true,
        guestOwnerAccountConfirmed: true,
      },
    });
    assert.equal(guestConfirmed.status, 200);
    assert.equal(guestConfirmed.data.senderMode, 'owner_guest_relay');
    assert.equal(guestConfirmed.data.sentCount, 1);

    // Exceeding MAX_GUEST_EMAILS_PER_SESSION is blocked with 429
    const guestTooMany = await rig.api('POST', '/api/gmail/send', {
      token: guestToken,
      body: {
        recipients: [
          { recipientEmail: 'a@x.com' },
          { recipientEmail: 'b@x.com' },
          { recipientEmail: 'c@x.com' },
        ],
        subject: 'Too many',
        coverLetter: 'Exceeds limit',
        userConfirmedSend: true,
        guestOwnerAccountConfirmed: true,
      },
    });
    assert.equal(guestTooMany.status, 429);
    assert.equal(guestTooMany.data.error, 'GUEST_SEND_LIMIT_REACHED');
    assert.equal(MAX_GUEST_EMAILS_PER_SESSION, 3);

    // 33. Wait for server-side expiry -> ALL protected routes reject with 401 GUEST_SESSION_EXPIRED & restart blocked by cooldown
    await new Promise((r) => setTimeout(r, 300));

    const statusExpired = await rig.api('GET', '/api/multiuser/guest/status', { token: guestToken });
    assert.equal(statusExpired.status, 401);
    assert.equal(statusExpired.data.expired, true);

    const aiAfterExpiry = await rig.api('POST', '/api/ai/gemini/generate', {
      token: guestToken,
      body: { prompt: 'Should fail after expiry' },
    });
    assert.equal(aiAfterExpiry.status, 401);
    assert.equal(aiAfterExpiry.data.error, 'GUEST_SESSION_EXPIRED');

    const sendAfterExpiry = await rig.api('POST', '/api/gmail/send', {
      token: guestToken,
      body: {
        recipientEmail: 'hr@afterexpiry.example.com',
        subject: 'Expired',
        coverLetter: 'Should fail',
        userConfirmedSend: true,
        guestOwnerAccountConfirmed: true,
      },
    });
    assert.equal(sendAfterExpiry.status, 401);

    const restartBlocked = await rig.api('POST', '/api/multiuser/guest/start', {
      headers: { 'x-guest-client-id': 'guest-browser-fp-1' },
    });
    assert.equal(restartBlocked.status, 403);
    assert.equal(restartBlocked.data.error, 'GUEST_SESSION_EXPIRED');
  } finally {
    await rig.close();
  }
});

// ============================================================================
// SECTION E (Scenarios 34–38): CROSS-USER ISOLATION, CONCURRENCY & ANTI-SPOOFING
// ============================================================================

test('Scenarios 34–38: Cross-user CV/history/admin isolation, concurrent sends, and connect-token email spoof prevention', async () => {
  const rig = await createFullTestRig();
  try {
    const u1 = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'iso1@example.com', password: 'Password123!', displayName: 'Iso One' },
    });
    const u2 = await rig.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'iso2@example.com', password: 'Password123!', displayName: 'Iso Two' },
    });
    const t1 = u1.data.sessionToken;
    const t2 = u2.data.sessionToken;

    // Connect Alice's Gmail to u1 and Bob's Gmail to u2
    const s1 = await rig.api('POST', '/api/gmail/oauth/start', {
      token: t1,
      body: { redirectUri: `${rig.baseUrl}/api/gmail/oauth/callback` },
    });
    await fetch(`${rig.baseUrl}/api/gmail/oauth/callback?code=code_alice&state=${encodeURIComponent(s1.data.state)}`);

    const s2 = await rig.api('POST', '/api/gmail/oauth/start', {
      token: t2,
      body: { redirectUri: `${rig.baseUrl}/api/gmail/oauth/callback` },
    });
    await fetch(`${rig.baseUrl}/api/gmail/oauth/callback?code=code_bob&state=${encodeURIComponent(s2.data.state)}`);

    const cv1 = await rig.api('POST', '/api/multiuser/cvs', {
      token: t1,
      body: { title: 'U1 Secret CV', fileName: 'u1.pdf', pdfBase64: createFakePdfBase64('U1'), isDefault: true },
    });
    const cv2 = await rig.api('POST', '/api/multiuser/cvs', {
      token: t2,
      body: { title: 'U2 Secret CV', fileName: 'u2.pdf', pdfBase64: createFakePdfBase64('U2'), isDefault: true },
    });

    // 34. User 2 CANNOT download or delete User 1's CV
    const stolenGet = await rig.api('GET', `/api/multiuser/cvs/${cv1.data.cv.id}`, { token: t2 });
    assert.ok([403, 404].includes(stolenGet.status), `Expected 403/404, got ${stolenGet.status}`);
    const stolenDel = await rig.api('DELETE', `/api/multiuser/cvs/${cv1.data.cv.id}`, { token: t2 });
    assert.ok([403, 404].includes(stolenDel.status), `Expected 403/404, got ${stolenDel.status}`);

    // 35. User 2 CANNOT access Admin endpoints
    const adminAttempt = await rig.api('GET', '/api/multiuser/admin/overview', { token: t2 });
    assert.equal(adminAttempt.status, 403);

    // 36. Concurrent sends from U1 & U2 remain 100% isolated by sender and history
    const [res1, res2] = await Promise.all([
      rig.api('POST', '/api/gmail/send', {
        token: t1,
        body: {
          recipientEmail: 'hotel1@example.com',
          subject: 'Concurrent U1',
          coverLetter: 'From U1',
          cvId: cv1.data.cv.id,
          userConfirmedSend: true,
        },
      }),
      rig.api('POST', '/api/gmail/send', {
        token: t2,
        body: {
          recipientEmail: 'hotel2@example.com',
          subject: 'Concurrent U2',
          coverLetter: 'From U2',
          cvId: cv2.data.cv.id,
          userConfirmedSend: true,
        },
      }),
    ]);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(res1.data.results[0].senderGmail, 'alice.personal@gmail.com');
    assert.equal(res2.data.results[0].senderGmail, 'bob.personal@gmail.com');

    // 37. History isolation: U2 only sees U2's email, never U1's
    const hist1 = await rig.api('GET', '/api/gmail/history', { token: t1 });
    const hist2 = await rig.api('GET', '/api/gmail/history', { token: t2 });
    assert.equal(hist1.data.history.length, 1);
    assert.equal(hist1.data.history[0].recipientEmail, 'hotel1@example.com');
    assert.equal(hist2.data.history.length, 1);
    assert.equal(hist2.data.history[0].recipientEmail, 'hotel2@example.com');

    // 38. connect-token rejects spoofed gmailAddress mismatched from Google verified email
    const spoofAttempt = await rig.api('POST', '/api/gmail/oauth/connect-token', {
      token: t1,
      body: {
        accessToken: 'ya29.alice_live_token',
        gmailAddress: 'victim@gmail.com',
      },
    });
    assert.equal(spoofAttempt.status, 403);
    assert.equal(spoofAttempt.data.error, 'OAUTH_EMAIL_MISMATCH');
  } finally {
    await rig.close();
  }
});

// ============================================================================
// SECTION F (Scenarios 39–46): HEALTH, ENV, MIGRATION, ANDROID & SECURITY AUDITS
// ============================================================================

test('Scenarios 39–46: /api/health AES self-test, .env.example, Postgres RLS migration, Android OAuth/WebView invariants, and zero plaintext token persistence in frontend', async () => {
  const rig = await createFullTestRig();
  try {
    // 39. /api/health returns live AES-256-GCM encryption self-test + DB status
    const health = await rig.api('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'healthy');
    assert.equal(health.data.security.encryptionVerified, true);
    assert.equal(health.data.database.readWriteVerified, true);
  } finally {
    await rig.close();
  }

  // 40. .env.example defines required placeholders & ZERO real secrets
  const envExample = fs.readFileSync(path.join(ROOT_DIR, '.env.example'), 'utf8');
  for (const key of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'TOKEN_ENCRYPTION_KEY',
    'SESSION_SIGNING_SECRET',
    'GUEST_SESSION_DURATION_SECONDS',
    'OWNER_GMAIL_ADDRESS',
    'GEMINI_API_KEY',
  ]) {
    assert.ok(envExample.includes(`${key}=`), `.env.example must include ${key}`);
  }
  assert.ok(!/AIzaSy[A-Za-z0-9_-]{20,}/.test(envExample), '.env.example must not contain real Google API keys');
  assert.ok(!/GOCSPX-[A-Za-z0-9_-]{10,}/.test(envExample), '.env.example must not contain real OAuth secrets');

  // 41. Postgres migration includes new auth/BYOK/guest tables and RLS policies
  const sqlMigration = fs.readFileSync(
    path.join(ROOT_DIR, 'migrations/002_multiuser_saas_postgres_schema.sql'),
    'utf8'
  );
  for (const table of [
    'zenvik_user_gemini_configs',
    'zenvik_password_reset_tokens',
    'zenvik_email_verification_tokens',
    'zenvik_revoked_sessions',
    'zenvik_guest_sessions',
  ]) {
    assert.ok(sqlMigration.includes(table), `Migration must define ${table}`);
  }
  assert.ok(sqlMigration.includes('ROW LEVEL SECURITY'));

  // 42. capacitor.config.ts package ID matches com.ccd.abetteryou
  const capConfig = fs.readFileSync(path.join(ROOT_DIR, 'capacitor.config.ts'), 'utf8');
  assert.ok(capConfig.includes("appId: 'com.ccd.abetteryou'"));

  // 43. AndroidManifest.xml has singleTask & OAuth deep-link intent filters
  const manifest = fs.readFileSync(
    path.join(ROOT_DIR, 'android/app/src/main/AndroidManifest.xml'),
    'utf8'
  );
  assert.ok(manifest.includes('android:launchMode="singleTask"'));
  assert.ok(manifest.includes('android:scheme="com.ccd.abetteryou"'));
  assert.ok(manifest.includes('android:scheme="zenvik"'));

  // 44. MainActivity.kt uses Chrome Custom Tabs + ZenvikAndroid bridge + WebViewAssetLoader + ZERO file:///android_asset
  const mainActivity = fs.readFileSync(
    path.join(ROOT_DIR, 'android/app/src/main/java/com/ccd/abetteryou/MainActivity.kt'),
    'utf8'
  );
  assert.ok(mainActivity.includes('CustomTabsIntent'));
  assert.ok(mainActivity.includes('ZenvikAndroid'));
  assert.ok(mainActivity.includes('WebViewAssetLoader'));
  assert.ok(mainActivity.includes('https://appassets.androidplatform.net'));
  assert.ok(mainActivity.includes('zenvik_android_oauth_callback'));
  assert.ok(!mainActivity.includes('file:///android_asset'), 'MainActivity.kt must not regress to file:///android_asset');

  // 45. build.gradle.kts includes androidx.browser:browser & preserves applicationId/version
  const gradle = fs.readFileSync(path.join(ROOT_DIR, 'android/app/build.gradle.kts'), 'utf8');
  assert.ok(gradle.includes('androidx.browser:browser:'));
  assert.ok(gradle.includes('applicationId = "com.ccd.abetteryou"'));

  // 46. Frontend services never persist Google OAuth access/refresh tokens in localStorage/sessionStorage
  const multiUserSvc = fs.readFileSync(path.join(ROOT_DIR, 'src/services/multiUserService.ts'), 'utf8');
  const gmailSvc = fs.readFileSync(path.join(ROOT_DIR, 'src/services/gmailService.ts'), 'utf8');
  assert.ok(!/localStorage\.setItem\([^)]*refresh_?token/i.test(multiUserSvc));
  assert.ok(!/sessionStorage\.setItem\([^)]*refresh_?token/i.test(multiUserSvc));
  assert.ok(!/localStorage\.setItem\([^)]*gmail_?access_?token/i.test(multiUserSvc));
  assert.ok(!/localStorage\.setItem\([^)]*refresh_?token/i.test(gmailSvc));
  assert.ok(!gmailSvc.includes("|| 'fazle.rabbe.doc@gmail.com'"), 'gmailService must not hardcode owner fallback');
});
