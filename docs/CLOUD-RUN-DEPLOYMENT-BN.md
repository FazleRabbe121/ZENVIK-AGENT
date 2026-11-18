# ZENVIK-AGENT — Google Cloud Run Backend Deployment

## Why Cloud Run
The repository contains an Express API server in `server.ts`. GitHub Pages only hosts static frontend files and does not run this server. Cloud Run can run the Express server and the React frontend from one HTTPS origin.

## Important deployment blockers — do not skip
1. **API security:** Several existing API routes (including diagnostics, job operations, and email dispatch) do not yet have a verified Firebase ID-token authorization middleware. Do not deploy this service with public unauthenticated access until that is implemented and tested.
2. **Persistent data:** Cloud Run container filesystems are ephemeral. The current job database and Python JobHunter SQLite database write to local files. They can be lost on instance replacement and are not safely shared across multiple instances. Move durable records to Firestore/Cloud SQL or a supported persistent store before relying on production data.
3. **Secrets:** Set `GEMINI_API_KEY` in Cloud Run Secret Manager. Optional `OPENAI_API_KEY` and `GROK_API_KEY` should also be Secret Manager references if enabled. Never put private keys in frontend `VITE_*` variables or commit them.
4. **Ollama:** The Personal AI Agent currently defaults to `ollama` at `http://127.0.0.1:11434/api`. That is not available automatically in Cloud Run. Configure a reachable hosted model endpoint or disable that provider until it is hosted.
5. **Gmail OAuth:** Cloud Run deployment does not configure Google OAuth consent, Gmail scopes, authorized domains, or Android Google sign-in. Those require separate Firebase/Google Cloud Console setup and real-device tests.

## Repository runtime preparation
- `Dockerfile` builds the Vite frontend and runs the Express API server.
- The existing Python JobHunter bridge dependencies are installed in a Python virtual environment.
- `server.ts` listens on Cloud Run's injected `PORT` and exposes `/healthz`.

## Deploying after security and persistence work is complete
In Google Cloud Console:
1. Select the Firebase-associated Google Cloud project.
2. Open Cloud Run → Services → Deploy container / Connect repository.
3. Connect GitHub and select `FazleRabbe121/ZENVIK-AGENT`, branch `main`.
4. Select Dockerfile build.
5. Choose a European region close to the Firebase database location, if available.
6. Set service name `zenvik-agent`, port `8080`, and a low initial maximum instance count.
7. Configure secrets through Secret Manager, not plain source files.
8. Keep unauthenticated access disabled until Firebase ID-token authorization is implemented and tested.
9. After deployment, verify `https://SERVICE_URL/healthz` returns JSON with `ok: true`.

## Cost control
Use request-based billing, scale to zero, and a low maximum instance count initially. Review Cloud Run, Cloud Build, Artifact Registry, logs, and network egress charges. A free tier is not a guarantee of zero total Google Cloud cost.
