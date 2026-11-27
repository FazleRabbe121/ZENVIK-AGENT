import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {
  verifyFirebaseIdToken,
  buildMimeEmailWithAttachment,
  createMultiUserSaaSRouter,
} from '../src/server/multiUserSaaSServer.ts';
import { aiCooperativeEngine } from '../src/server/aiCooperativeEngine.ts';
import { personalAIChatRouter, getAIProvidersStatus } from '../src/server/personalAIChatEngine.ts';

test('Cryptographic Firebase ID token verifier rejects unsigned and forged JWTs', async () => {
  const unsignedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const forgedPayload = Buffer.from(
    JSON.stringify({
      sub: 'usr_owner_fazle_rabbi',
      email: 'fazle.rabbe.doc@gmail.com',
      aud: 'ccd---a-better-you-every-day',
      iss: 'https://securetoken.google.com/ccd---a-better-you-every-day',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');

  const unsignedJwt = `${unsignedHeader}.${forgedPayload}.`;
  assert.equal(await verifyFirebaseIdToken(unsignedJwt), null);

  const rs256ForgedHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'nonexistent-kid-123' })).toString('base64url');
  const rs256ForgedJwt = `${rs256ForgedHeader}.${forgedPayload}.invalidsignaturebytes`;
  assert.equal(await verifyFirebaseIdToken(rs256ForgedJwt), null);
});

test('MIME email builder strips CRLF header injection characters from sender, recipient, and subject', () => {
  const rawBase64Url = buildMimeEmailWithAttachment({
    fromEmail: 'alice@gmail.com\r\nBcc: attacker@evil.com',
    fromName: 'Alice\r\nX-Injected: true',
    toEmail: 'hr@hotel.com\r\nCc: spy@evil.com',
    subject: 'Bartender Application\r\nBcc: leak@evil.com',
    bodyText: 'Hello Hiring Team',
  });
  const decoded = Buffer.from(rawBase64Url, 'base64url').toString('utf8');
  assert.doesNotMatch(decoded, /\r\nBcc:/i);
  assert.doesNotMatch(decoded, /\r\nCc:/i);
  assert.doesNotMatch(decoded, /\r\nX-Injected:/i);
});

test('3-AI Cooperative Engine exposes Gemini, OpenAI, and Grok provider metrics and health checks', async () => {
  const summary = aiCooperativeEngine.getProviderStatusSummary();
  assert.equal(summary.gemini.provider, 'Gemini');
  assert.equal(summary.openai.provider, 'OpenAI');
  assert.equal(summary.grok.provider, 'Grok');
  assert.ok(Array.isArray(summary.grok.availableModels) && summary.grok.availableModels.length > 0);

  const chatProviders = getAIProvidersStatus();
  assert.equal(chatProviders.gemini.defaultModel, 'gemini-4-hydrogen');
  assert.ok(chatProviders.grok);
});

test('Personal AI custom integration endpoint blocks SSRF/private/metadata URLs', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/personal-ai', personalAIChatRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ssrfRes1 = await fetch(`${baseUrl}/api/personal-ai/integrations/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Metadata Probe',
        customEndpointUrl: 'http://169.254.169.254/computeMetadata/v1/',
      }),
    });
    assert.equal(ssrfRes1.status, 400);

    const ssrfRes2 = await fetch(`${baseUrl}/api/personal-ai/integrations/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Localhost Probe',
        customEndpointUrl: 'https://127.0.0.1:8080/internal',
      }),
    });
    assert.equal(ssrfRes2.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Multi-user POST /api/gmail/send delegation prevents legacy route shadowing', async () => {
  const app = express();
  app.use(express.json());

  // Mirror server.ts delegation guard before defaultMultiUserSaaS.router
  app.post('/api/gmail/send', (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const bodyObj = req.body || {};
    const isMultiUserPayload =
      Array.isArray(bodyObj.recipients) ||
      'recipientEmail' in bodyObj ||
      'cvId' in bodyObj ||
      'coverLetter' in bodyObj ||
      authHeader.startsWith('Bearer zvk.') ||
      Boolean(req.headers['x-zenvik-session-token']);
    if (isMultiUserPayload) return next();
    return res.status(400).json({ legacyHit: true });
  });

  const saas = createMultiUserSaaSRouter();
  app.use('/api', saas.router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Multi-user payload without token must reach multiUserSaaSServer and return 401 AUTHENTICATION_REQUIRED (NOT legacy 400)
    const res = await fetch(`${baseUrl}/api/gmail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: [{ recipientEmail: 'hr@luxuryhotel.com' }],
        subject: 'Application',
        coverLetter: 'Cover letter',
        userConfirmedSend: true,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 401);
    assert.equal(data.error, 'AUTHENTICATION_REQUIRED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PostgreSQL multi-user migration SQL and .env.example placeholders exist and contain no real secrets', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations/002_multiuser_saas_postgres_schema.sql'),
    'utf8'
  );
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.zenvik_users/);
  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);

  const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
  assert.match(envExample, /GEMINI_API_KEY=/);
  assert.match(envExample, /OPENAI_API_KEY=/);
  assert.match(envExample, /GROK_API_KEY=/);
  assert.match(envExample, /TOKEN_ENCRYPTION_KEY=/);
  assert.match(envExample, /DATABASE_URL=/);
  assert.doesNotMatch(envExample, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(envExample, /sk-[0-9A-Za-z]{20,}/);
});
