# ZENVIK-AGENT — Backend Repair Status (19 Nov 2026)

## Safety / rollback
- The pre-repair snapshot is preserved on branch `backup/pre-backend-repair-2026-11-19`.
- All repair work is being made on `repair/backend-full-2026-11-19`.
- The production/default `main` branch has not been changed by this repair series.

## Completed in the repair branch
1. Replaced hard-coded `gemini-4-hydrogen` references in the main Express AI, cooperative AI, personal AI chat, recipe AI, and interview AI model selection with configurable `GEMINI_MODEL` / `GEMINI_INTERVIEW_MODEL`, defaulting to the currently documented stable `gemini-3.8-flash`.
2. Updated the cooperative AI model telemetry to show the configured model and available stable fallback choices.
3. Added `GET /readyz`. It reports only whether provider settings are present (never secret values); it does not claim that a provider call or database write has succeeded.
4. Excluded local JSON/SQLite runtime database files from the Cloud Run Docker build context. These files must not be treated as durable Cloud Run storage.
5. Added the Gemini model settings to `.env.example`.

## Verified repository findings / remaining work before production
### Critical security
- `firestore.rules` currently grants unauthenticated read/write access to `cv_accounts` and `cv_users`. This must be replaced with a verified owner/participant access policy after confirming every legacy collection path still used by the app.
- The Express API exposes many state-changing routes (jobs, email sending, admin diagnostics, interview administration, Python agent actions). A Firebase ID-token middleware and route-by-route authorization policy are not yet implemented. Do not enable public unauthenticated Cloud Run access.

### Critical persistence
- `src/server/jobDatabase.ts`, `src/server/interviewCenterServer.ts`, and `src/server/personalAIServer.ts` persist state in local JSON files.
- `jobhunter-agent` stores its operational state in SQLite under the container filesystem.
- Cloud Run instances have disposable local filesystems. Excluding these files from the image avoids baking stale runtime data into deployments, but does not migrate persistence. A Firestore/Cloud SQL-backed repository and a data migration plan are still required before production use.

### Integration work still required
- Frontend API calls must attach Firebase ID tokens to protected API requests; this must be implemented and tested across the app before enabling the backend authorization middleware.
- Gmail OAuth consent/scopes, redirect/authorized domains, refresh-token handling, and Android sign-in need real account and device testing.
- Ollama currently defaults to localhost; Cloud Run needs a reachable hosted inference endpoint or the feature must remain disabled.
- Python JobHunter needs production-safe persistent storage, profile/CV handling, and secrets.
- The Android build workflow and backend Docker build must both pass CI after the remaining code changes.

## Current deployment status
**Not deployed to Cloud Run by this repair.** The existing Cloud Run service shown by the user has not been verified as this repository's Express backend. Do not press Redeploy or switch public access on until the security, persistence, and integration gates above are complete.

## Validation endpoints after a future deployment
- `/healthz`: process liveness only.
- `/readyz`: configuration-presence diagnostics only. HTTP 503 means required Gemini configuration is absent; HTTP 200 does not replace real integration tests.
