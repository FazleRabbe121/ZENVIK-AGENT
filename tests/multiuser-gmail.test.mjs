import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {
  createMultiUserSaaSRouter,
  encryptTokenAtRest,
  decryptTokenAtRest,
  GMAIL_SEND_ONLY_SCOPE,
  PRIMARY_ADMIN_EMAIL,
} from '../src/server/multiUserSaaSServer.ts';

function decodeMimeFromBase64Url(rawBase64Url) {
  return Buffer.from(rawBase64Url, 'base64url').toString('utf8');
}

async function createTestServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenvik-multiuser-test-'));
  const dbFilePath = path.join(tmpDir, 'multiuser_test_db.json');

  // Set test OAuth app credentials
  process.env.GOOGLE_CLIENT_ID = 'test-zenvik-google-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-zenvik-google-client-secret';
  process.env.TOKEN_ENCRYPTION_KEY = 'test-32-byte-secret-encryption-key-for-aes-256-gcm';

  const sentMimeCaptures = [];
  const revokedTokens = [];
  const simulatedFailures = new Set();
  const expiredRefreshRejections = new Set();

  const codeToAccountMap = {
    code_user_a: {
      access_token: 'ya29.access_token_user_a_initial',
      refresh_token: '1//refresh_token_user_a_secret',
      expires_in: 3600,
      email: 'usera@gmail.com',
    },
    code_user_b: {
      access_token: 'ya29.access_token_user_b_initial',
      refresh_token: '1//refresh_token_user_b_secret',
      expires_in: 3600,
      email: 'userb@gmail.com',
    },
    code_user_c: {
      access_token: 'ya29.access_token_user_c_initial',
      refresh_token: '1//refresh_token_user_c_secret',
      expires_in: 3600,
      email: 'userc@gmail.com',
    },
  };

  const transport = {
    exchangeCodeForTokens: async ({ code }) => {
      const entry = codeToAccountMap[code];
      if (!entry) {
        throw new Error(`Invalid authorization code: ${code}`);
      }
      return { ...entry };
    },
    refreshAccessToken: async (refreshToken) => {
      if (expiredRefreshRejections.has(refreshToken)) {
        throw new Error('Token has been expired or revoked by the user in Google Account settings.');
      }
      return {
        access_token: `ya29.refreshed_from_${refreshToken.slice(-8)}`,
        expires_in: 3600,
      };
    },
    fetchGoogleUserEmail: async (accessToken) => {
      if (accessToken.includes('user_a')) return 'usera@gmail.com';
      if (accessToken.includes('user_b')) return 'userb@gmail.com';
      if (accessToken.includes('user_c')) return 'userc@gmail.com';
      throw new Error('Unrecognized access token');
    },
    revokeToken: async (token) => {
      revokedTokens.push(token);
    },
    sendGmailRawMessage: async ({ accessToken, senderEmail, rawMimeBase64Url }) => {
      const decodedMime = decodeMimeFromBase64Url(rawMimeBase64Url);
      if (simulatedFailures.has(senderEmail) || decodedMime.includes('fail-delivery@example.com')) {
        const err = new Error('Simulated temporary SMTP/Gmail API delivery failure (HTTP 503)');
        err.httpStatus = 503;
        throw err;
      }
      const msgId = `gmail_msg_${sentMimeCaptures.length + 1}_${senderEmail.split('@')[0]}`;
      sentMimeCaptures.push({
        id: msgId,
        accessToken,
        senderEmail,
        decodedMime,
      });
      return {
        id: msgId,
        threadId: `thread_${msgId}`,
      };
    },
  };

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const saas = createMultiUserSaaSRouter({ dbFilePath, transport });
  app.use('/api', saas.router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function api(method, route, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  return {
    baseUrl,
    dbFilePath,
    tmpDir,
    saas,
    sentMimeCaptures,
    revokedTokens,
    simulatedFailures,
    expiredRefreshRejections,
    transport,
    api,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

test('AES-256-GCM Token Encryption at Rest: never stores plaintext and detects tampering', () => {
  const rawRefreshToken = '1//0g_super_secret_personal_refresh_token_xyz987';
  const encrypted = encryptTokenAtRest(rawRefreshToken);

  assert.equal(encrypted.algorithm, 'aes-256-gcm');
  assert.notEqual(encrypted.ciphertext, rawRefreshToken);
  assert.ok(!JSON.stringify(encrypted).includes(rawRefreshToken));

  const decrypted = decryptTokenAtRest(encrypted);
  assert.equal(decrypted, rawRefreshToken);

  // Tampering with authTag or ciphertext must return null
  const tampered = { ...encrypted, authTag: Buffer.from('0000000000000000').toString('base64') };
  assert.equal(decryptTokenAtRest(tampered), null);
});

test('12-Point Multi-User Verification Plan (Test User A, Test User B, Test User C)', async () => {
  const ctx = await createTestServer();
  try {
    // =========================================================================
    // 1. All three users can register and log in with unique internal user IDs
    // =========================================================================
    const regA = await ctx.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'userA@gmail.com', password: 'PasswordA123!', displayName: 'Test User A' },
    });
    const regB = await ctx.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'userB@gmail.com', password: 'PasswordB123!', displayName: 'Test User B' },
    });
    const regC = await ctx.api('POST', '/api/multiuser/auth/register', {
      body: { email: 'userC@gmail.com', password: 'PasswordC123!', displayName: 'Test User C' },
    });

    assert.equal(regA.status, 201);
    assert.equal(regB.status, 201);
    assert.equal(regC.status, 201);

    const userA = regA.data.user;
    const userB = regB.data.user;
    const userC = regC.data.user;
    assert.notEqual(userA.userId, userB.userId);
    assert.notEqual(userB.userId, userC.userId);

    // Verify login works and application login does NOT auto-connect Gmail
    const loginA = await ctx.api('POST', '/api/multiuser/auth/login', {
      body: { email: 'userA@gmail.com', password: 'PasswordA123!' },
    });
    assert.equal(loginA.status, 200);
    const tokenA = loginA.data.sessionToken;
    const tokenB = regB.data.sessionToken;
    const tokenC = regC.data.sessionToken;

    const statusBeforeConnect = await ctx.api('GET', '/api/gmail/status', { token: tokenA });
    assert.equal(statusBeforeConnect.data.connected, false);

    // =========================================================================
    // 2. All three users connect different personal Gmail accounts via OAuth 2.0
    //    requesting ONLY https://www.googleapis.com/auth/gmail.send
    // =========================================================================
    const startA = await ctx.api('POST', '/api/gmail/oauth/start', { token: tokenA });
    const startB = await ctx.api('POST', '/api/gmail/oauth/start', { token: tokenB });
    const startC = await ctx.api('POST', '/api/gmail/oauth/start', { token: tokenC });

    assert.equal(startA.status, 200);
    assert.deepEqual(startA.data.requestedScopes, [GMAIL_SEND_ONLY_SCOPE]);
    assert.match(startA.data.authorizationUrl, /gmail\.send/);
    assert.doesNotMatch(startA.data.authorizationUrl, /gmail\.readonly|mail\.google\.com/);

    // Verify User B cannot hijack User A's OAuth callback state (Requirement 5 & 6)
    const hijackAttempt = await ctx.api(
      'GET',
      `/api/gmail/oauth/callback?code=code_user_a&state=${encodeURIComponent(startA.data.state)}&format=json`,
      { token: tokenB }
    );
    assert.equal(hijackAttempt.status, 403);
    assert.equal(hijackAttempt.data.error, 'OAUTH_USER_MISMATCH');

    // Complete legitimate OAuth callbacks for User A, User B, and User C
    const cbA = await ctx.api(
      'GET',
      `/api/gmail/oauth/callback?code=code_user_a&state=${encodeURIComponent(startA.data.state)}&format=json`,
      { token: tokenA }
    );
    const cbB = await ctx.api(
      'GET',
      `/api/gmail/oauth/callback?code=code_user_b&state=${encodeURIComponent(startB.data.state)}&format=json`,
      { token: tokenB }
    );
    const cbC = await ctx.api(
      'GET',
      `/api/gmail/oauth/callback?code=code_user_c&state=${encodeURIComponent(startC.data.state)}&format=json`,
      { token: tokenC }
    );

    assert.equal(cbA.status, 200);
    assert.equal(cbA.data.gmailAddress, 'usera@gmail.com');
    assert.equal(cbB.data.gmailAddress, 'userb@gmail.com');
    assert.equal(cbC.data.gmailAddress, 'userc@gmail.com');

    // Verify stored tokens in disk database are encrypted at rest (never plaintext)
    const rawDbJson = fs.readFileSync(ctx.dbFilePath, 'utf8');
    assert.ok(!rawDbJson.includes('ya29.access_token_user_a_initial'), 'Access token must be encrypted on disk');
    assert.ok(!rawDbJson.includes('1//refresh_token_user_a_secret'), 'Refresh token must be encrypted on disk');

    // =========================================================================
    // 3 & 6. Upload separate CVs for User A, User B, User C and verify each user
    //        sends test and job application emails from their own Gmail + own CV
    // =========================================================================
    const cvResA = await ctx.api('POST', '/api/multiuser/cvs', {
      token: tokenA,
      body: {
        title: 'User A Master CV',
        fileName: 'User_A_Resume.pdf',
        pdfBase64: Buffer.from('%PDF-1.4 USER_A_UNIQUE_CV_CONTENT').toString('base64'),
        isDefault: true,
      },
    });
    const cvResB = await ctx.api('POST', '/api/multiuser/cvs', {
      token: tokenB,
      body: {
        title: 'User B Master CV',
        fileName: 'User_B_Resume.pdf',
        pdfBase64: Buffer.from('%PDF-1.4 USER_B_UNIQUE_CV_CONTENT').toString('base64'),
        isDefault: true,
      },
    });
    const cvResC = await ctx.api('POST', '/api/multiuser/cvs', {
      token: tokenC,
      body: {
        title: 'User C Master CV',
        fileName: 'User_C_Resume.pdf',
        pdfBase64: Buffer.from('%PDF-1.4 USER_C_UNIQUE_CV_CONTENT').toString('base64'),
        isDefault: true,
      },
    });

    const cvIdA = cvResA.data.cv.id;
    const cvIdB = cvResB.data.cv.id;
    const cvIdC = cvResC.data.cv.id;

    // 10. Multiple users send test emails simultaneously without mixing accounts or CVs
    const [testSendA, testSendB, testSendC] = await Promise.all([
      ctx.api('POST', '/api/gmail/send-test', {
        token: tokenA,
        body: { recipientEmail: 'employer-for-a@example.com', cvId: cvIdA },
      }),
      ctx.api('POST', '/api/gmail/send-test', {
        token: tokenB,
        body: { recipientEmail: 'employer-for-b@example.com', cvId: cvIdB },
      }),
      ctx.api('POST', '/api/gmail/send-test', {
        token: tokenC,
        body: { recipientEmail: 'employer-for-c@example.com', cvId: cvIdC },
      }),
    ]);

    assert.equal(testSendA.status, 200);
    assert.equal(testSendB.status, 200);
    assert.equal(testSendC.status, 200);

    assert.equal(testSendA.data.record.senderGmail, 'usera@gmail.com');
    assert.equal(testSendA.data.record.cvFilename, 'User_A_Resume.pdf');

    assert.equal(testSendB.data.record.senderGmail, 'userb@gmail.com');
    assert.equal(testSendB.data.record.cvFilename, 'User_B_Resume.pdf');

    assert.equal(testSendC.data.record.senderGmail, 'userc@gmail.com');
    assert.equal(testSendC.data.record.cvFilename, 'User_C_Resume.pdf');

    // Verify captured MIME messages never used the software owner's Gmail (fazle.rabbe.doc@gmail.com)
    for (const capture of ctx.sentMimeCaptures) {
      assert.notEqual(capture.senderEmail, PRIMARY_ADMIN_EMAIL);
    }
    const captureA = ctx.sentMimeCaptures.find((c) => c.senderEmail === 'usera@gmail.com');
    assert.match(captureA.decodedMime, /From: "Test User A" <usera@gmail\.com>/);
    assert.match(captureA.decodedMime, /To: employer-for-a@example\.com/);
    assert.match(captureA.decodedMime, /filename="User_A_Resume\.pdf"/);

    // =========================================================================
    // 4, 5 & 6. Cross-User Data & CV Isolation Checks
    // =========================================================================
    // User A tries to read User B's CV
    const crossReadCv = await ctx.api('GET', `/api/multiuser/cvs/${cvIdB}`, { token: tokenA });
    assert.equal(crossReadCv.status, 403);
    assert.equal(crossReadCv.data.error, 'CV_OWNERSHIP_VIOLATION');

    // User A tries to pass userId: userB.userId in request body
    const spoofedBody = await ctx.api('GET', `/api/multiuser/me?userId=${userB.userId}`, { token: tokenA });
    assert.equal(spoofedBody.status, 403);
    assert.equal(spoofedBody.data.error, 'CROSS_USER_ACCESS_DENIED');

    // User A tries to send an email attaching User B's CV
    const crossAttachCv = await ctx.api('POST', '/api/gmail/send', {
      token: tokenA,
      body: {
        recipientEmail: 'another-hotel@example.com',
        subject: 'Attempt with User B CV',
        coverLetter: 'Should be blocked',
        cvId: cvIdB,
      },
    });
    assert.equal(crossAttachCv.status, 403);
    assert.equal(crossAttachCv.data.error, 'CROSS_USER_CV_DENIED');

    // User A's workspace (/api/multiuser/me) contains ONLY User A's CVs and email history
    const wsA = await ctx.api('GET', '/api/multiuser/me', { token: tokenA });
    assert.equal(wsA.data.user.userId, userA.userId);
    assert.equal(wsA.data.cvs.length, 1);
    assert.equal(wsA.data.cvs[0].id, cvIdA);
    assert.ok(wsA.data.emailHistory.every((h) => h.userId === userA.userId && h.senderGmail === 'usera@gmail.com'));

    // =========================================================================
    // 7. Expired tokens are refreshed securely where possible
    // =========================================================================
    const state = ctx.saas.storage.getState();
    state.gmailConnections[userA.userId].accessTokenExpiresAt = Date.now() - 10_000; // Force expired
    ctx.saas.storage.save();

    const sendAfterExpiry = await ctx.api('POST', '/api/gmail/send', {
      token: tokenA,
      body: {
        recipientEmail: 'refreshed-token-test@example.com',
        subject: 'Application with Auto-Refreshed Token',
        coverLetter: 'Sent after automatic refresh token exchange.',
        cvId: cvIdA,
      },
    });
    assert.equal(sendAfterExpiry.status, 200);
    assert.equal(sendAfterExpiry.data.sentCount, 1);

    // =========================================================================
    // 8. Revoked Gmail access is handled correctly
    // =========================================================================
    state.gmailConnections[userC.userId].accessTokenExpiresAt = Date.now() - 10_000;
    ctx.saas.storage.save();
    ctx.expiredRefreshRejections.add('1//refresh_token_user_c_secret');

    const sendWithRevoked = await ctx.api('POST', '/api/gmail/send', {
      token: tokenC,
      body: {
        recipientEmail: 'hotel-c@example.com',
        subject: 'Revoked Token Test',
        coverLetter: 'Should fail cleanly when token is revoked.',
        cvId: cvIdC,
      },
    });
    assert.equal(sendWithRevoked.status, 400);
    const statusC = await ctx.api('GET', '/api/gmail/status', { token: tokenC });
    assert.equal(statusC.data.status, 'revoked');

    // Disconnect User C's Gmail and verify tokens are revoked & deleted
    const discC = await ctx.api('POST', '/api/gmail/disconnect', { token: tokenC });
    assert.equal(discC.status, 200);
    assert.ok(ctx.revokedTokens.includes('1//refresh_token_user_c_secret'));
    assert.equal(ctx.saas.storage.getState().gmailConnections[userC.userId], undefined);

    // =========================================================================
    // 9. Failed emails are reported accurately and retried without duplicates
    // =========================================================================
    const failRes = await ctx.api('POST', '/api/gmail/send', {
      token: tokenB,
      body: {
        recipientEmail: 'fail-delivery@example.com',
        subject: 'Retry Test Application',
        coverLetter: 'Testing failure recording and retry.',
        cvId: cvIdB,
      },
    });
    assert.equal(failRes.status, 400);
    assert.equal(failRes.data.failedCount, 1);
    const failedHistoryId = failRes.data.errors[0].record.id;
    assert.equal(failRes.data.errors[0].record.status, 'failed');

    // Now fix recipient or allow retry for User B: update target recipient to valid address & retry
    const historyListB = ctx.saas.storage.getState().emailHistoryByUser[userB.userId];
    const failedEntry = historyListB.find((h) => h.id === failedHistoryId);
    failedEntry.recipientEmail = 'recovered-delivery@example.com';
    ctx.saas.storage.save();

    const retrySuccess = await ctx.api('POST', `/api/gmail/retry/${failedHistoryId}`, { token: tokenB });
    assert.equal(retrySuccess.status, 200);
    assert.equal(retrySuccess.data.record.status, 'sent');

    // Attempting to retry an already-sent email must be blocked with 409 ALREADY_SENT
    const duplicateRetry = await ctx.api('POST', `/api/gmail/retry/${failedHistoryId}`, { token: tokenB });
    assert.equal(duplicateRetry.status, 409);
    assert.equal(duplicateRetry.data.error, 'ALREADY_SENT');

    // =========================================================================
    // 11. Admin Panel separation, privacy protection, and account suspension
    // =========================================================================
    // Ordinary user (User A) cannot access Admin Panel
    const nonAdminAttempt = await ctx.api('GET', '/api/multiuser/admin/overview', { token: tokenA });
    assert.equal(nonAdminAttempt.status, 403);

    // Admin user logs in and views overview
    const adminSync = await ctx.api('POST', '/api/multiuser/auth/firebase-sync', {
      body: {
        uid: 'usr_owner_fazle_rabbi',
        email: PRIMARY_ADMIN_EMAIL,
        displayName: 'Fazle Rabbi',
      },
    });
    const adminToken = adminSync.data.sessionToken;
    const adminOverview = await ctx.api('GET', '/api/multiuser/admin/overview', { token: adminToken });
    assert.equal(adminOverview.status, 200);

    // Verify Admin Panel payload NEVER exposes encrypted tokens, raw CVs, or private email contents
    const rawAdminPayload = JSON.stringify(adminOverview.data);
    assert.ok(!rawAdminPayload.includes('encryptedAccessToken'));
    assert.ok(!rawAdminPayload.includes('encryptedRefreshToken'));
    assert.ok(!rawAdminPayload.includes('USER_A_UNIQUE_CV_CONTENT'));

    // Admin suspends User B -> User B is immediately blocked from accessing endpoints
    const suspendB = await ctx.api('PATCH', `/api/multiuser/admin/users/${userB.userId}/status`, {
      token: adminToken,
      body: { status: 'suspended' },
    });
    assert.equal(suspendB.status, 200);

    const blockedB = await ctx.api('GET', '/api/multiuser/me', { token: tokenB });
    assert.equal(blockedB.status, 403);
    assert.equal(blockedB.data.error, 'ACCOUNT_SUSPENDED');

    // Admin re-activates User B -> User B regains access
    await ctx.api('PATCH', `/api/multiuser/admin/users/${userB.userId}/status`, {
      token: adminToken,
      body: { status: 'active' },
    });
    const restoredB = await ctx.api('GET', '/api/multiuser/me', { token: tokenB });
    assert.equal(restoredB.status, 200);

    // =========================================================================
    // 12. Backend data remains available after an instance restart
    // =========================================================================
    const restartedInstance = createMultiUserSaaSRouter({
      dbFilePath: ctx.dbFilePath,
      transport: ctx.transport,
    });
    const persistedUserA = restartedInstance.storage.findUserById(userA.userId);
    assert.ok(persistedUserA, 'User A must persist across instance restart');
    assert.equal(persistedUserA.email, 'usera@gmail.com');
    const persistedConnA = restartedInstance.storage.getState().gmailConnections[userA.userId];
    assert.equal(persistedConnA.gmailAddress, 'usera@gmail.com');
    assert.equal(restartedInstance.storage.getState().cvsByUser[userA.userId][0].id, cvIdA);

    // =========================================================================
    // 13. Phase 2 & 10: Cloud Run Health Check (/api/health) & API Docs (/api/docs)
    // =========================================================================
    const healthRes = await ctx.api('GET', '/api/health');
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.data.status, 'healthy');
    assert.equal(healthRes.data.service, 'zenvik-agent-multiuser-backend');

    const docsRes = await ctx.api('GET', '/api/docs');
    assert.equal(docsRes.status, 200);
    assert.equal(docsRes.data.openapi, '3.1.0');

    // =========================================================================
    // 14. Phase 5: CV Gallery Sync, Binary PDF Download & Ownership Isolation
    // =========================================================================
    const syncGalleryA = await ctx.api('POST', '/api/multiuser/cvs/sync-gallery', {
      token: tokenA,
      body: {
        cvs: [
          {
            title: 'User A Synced Hospitality CV',
            fileName: 'User_A_Synced_Hospitality.pdf',
            pdfBase64: Buffer.from('%PDF-1.4 SYNCED_GALLERY_CV_A').toString('base64'),
            isDefault: false,
          },
        ],
      },
    });
    assert.equal(syncGalleryA.status, 200);
    assert.equal(syncGalleryA.data.syncedCount, 1);
    assert.equal(syncGalleryA.data.totalCount, 2);

    const syncedCvId = syncGalleryA.data.cvs.find((c) => c.fileName === 'User_A_Synced_Hospitality.pdf').id;

    // Select synced CV as default
    const selectRes = await ctx.api('PATCH', `/api/multiuser/cvs/${syncedCvId}/select`, {
      token: tokenA,
    });
    assert.equal(selectRes.status, 200);
    assert.equal(selectRes.data.selectedCvId, syncedCvId);

    // Download binary PDF as owner (User A)
    const downloadOwner = await fetch(`${ctx.baseUrl}/api/multiuser/cvs/${syncedCvId}/download`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(downloadOwner.status, 200);
    assert.match(downloadOwner.headers.get('content-type') || '', /application\/pdf/);

    // Cross-user download attempt (User B tries to download User A's CV) -> 403
    const downloadCross = await ctx.api('GET', `/api/multiuser/cvs/${syncedCvId}/download`, {
      token: tokenB,
    });
    assert.equal(downloadCross.status, 403);
    assert.equal(downloadCross.data.error, 'CV_OWNERSHIP_VIOLATION');

    // =========================================================================
    // 15. Phase 7: Multi-User Job Search Engine (Bartender, Barista, Waiter,
    //     Maintenance Electrician, Plumber) & Per-User Job Preferences
    // =========================================================================
    const prefsUpdateA = await ctx.api('PUT', '/api/multiuser/job-preferences', {
      token: tokenA,
      body: {
        professions: ['Bartender', 'Barista', 'Waiter', 'Maintenance Electrician', 'Plumber'],
        countries: ['Cyprus', 'Malta', 'Germany', 'Netherlands'],
        visaSponsorshipOnly: false,
        relocationReady: true,
      },
    });
    assert.equal(prefsUpdateA.status, 200);
    assert.equal(prefsUpdateA.data.preferences.professions.includes('Maintenance Electrician'), true);
    assert.equal(prefsUpdateA.data.preferences.professions.includes('Plumber'), true);

    // Verify Job Search returns Bartender, Barista, Waiter, Maintenance Electrician, and Plumber jobs
    for (const profession of ['Bartender', 'Barista', 'Waiter', 'Maintenance Electrician', 'Plumber']) {
      const searchRes = await ctx.api('POST', '/api/multiuser/jobs/search', {
        token: tokenA,
        body: { profession, limit: 20 },
      });
      assert.equal(searchRes.status, 200);
      assert.ok(
        searchRes.data.jobs.length > 0,
        `Job search must return verified jobs for profession: ${profession}`
      );
    }

    // Save a job for User A and verify User B does not see it in User B's saved jobs
    const allJobsRes = await ctx.api('GET', '/api/multiuser/jobs/search?limit=5', { token: tokenA });
    const sampleJob = allJobsRes.data.jobs[0];
    const saveJobA = await ctx.api('POST', '/api/multiuser/saved-jobs', {
      token: tokenA,
      body: { jobId: sampleJob.id, jobSnapshot: sampleJob },
    });
    assert.equal(saveJobA.status, 201);

    const savedListB = await ctx.api('GET', '/api/multiuser/saved-jobs', { token: tokenB });
    assert.equal(savedListB.data.savedJobs.length, 0);

    // =========================================================================
    // 16. Phase 8 & 15: Backend Gemini AI Endpoint, Connected Services Dashboard,
    //     First-Time Setup Wizard & Admin AI Control Panel
    // =========================================================================
    const aiGenA = await ctx.api('POST', '/api/ai/gemini/generate', {
      token: tokenA,
      body: {
        taskType: 'cover_letter',
        prompt: 'Write a short hospitality application note for a Head Bartender & Barista role in Cyprus.',
      },
    });
    assert.equal(aiGenA.status, 200);
    assert.ok(aiGenA.data.text && aiGenA.data.text.length > 20);

    const aiHistoryA = await ctx.api('GET', '/api/multiuser/ai-history', { token: tokenA });
    assert.equal(aiHistoryA.status, 200);
    assert.equal(aiHistoryA.data.history.length, 1);

    // Connected Services Dashboard check
    const connServicesA = await ctx.api('GET', '/api/multiuser/connected-services', { token: tokenA });
    assert.equal(connServicesA.status, 200);
    assert.equal(connServicesA.data.services.googleAccount.status, 'Connected');
    assert.equal(connServicesA.data.services.gmail.status, 'Connected');
    assert.equal(connServicesA.data.services.cvStorage.status, 'Active');
    assert.equal(connServicesA.data.services.jobSearchEngine.status, 'Active');

    // First-Time Setup Wizard state & completion
    const wizardCompleteA = await ctx.api('POST', '/api/multiuser/setup-wizard/complete', {
      token: tokenA,
      body: { gmailSkipped: false },
    });
    assert.equal(wizardCompleteA.status, 200);
    assert.equal(wizardCompleteA.data.profile.setupWizardCompleted, true);

    // Admin AI Control Panel: non-admin rejected with 403, admin succeeds
    const nonAdminAI = await ctx.api('PUT', '/api/multiuser/admin/ai-config', {
      token: tokenA,
      body: { defaultGeminiModel: 'gemini-4-hydrogen' },
    });
    assert.equal(nonAdminAI.status, 403);

    const adminAIUpdate = await ctx.api('PUT', '/api/multiuser/admin/ai-config', {
      token: adminToken,
      body: {
        defaultProvider: 'gemini',
        defaultGeminiModel: 'gemini-3.1-flash-lite',
        fallbackEnabled: true,
      },
    });
    assert.equal(adminAIUpdate.status, 200);
    assert.equal(adminAIUpdate.data.config.defaultGeminiModel, 'gemini-3.1-flash-lite');

    const adminAITest = await ctx.api('POST', '/api/multiuser/admin/ai-test', {
      token: adminToken,
    });
    assert.equal(adminAITest.status, 200);
    assert.ok(adminAITest.data.results.gemini.status);
  } finally {
    await ctx.close();
    fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
  }
});

