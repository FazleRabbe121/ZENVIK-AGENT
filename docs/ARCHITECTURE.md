# ZENVIK-AGENT — System Architecture (`ARCHITECTURE.md`)

This document details the engineering architecture, data flows, security boundaries, and mobile packaging design of **ZENVIK-AGENT**.

---

## 1. High-Level Architecture

ZENVIK-AGENT operates as a hybrid **Full-Stack Express + React 19 SPA** with offline-resilient **Firebase Firestore** synchronization and a native **Android WebViewAssetLoader** container:

1. **Client Tier (`src/`)**:
   - React 19 + TypeScript + Tailwind CSS v4.
   - Multi-mode access gate (`AuthContext.tsx`): supports full platform access (`89056`), isolated CV-only mode (`00000`), and isolated Interview Preparation Portal (`?portal=interview`).
   - Direct client-side Firebase Auth & Firestore synchronization (`src/services/firebase.ts` and `src/services/firestoreService.ts`).
2. **Backend API Tier (`server.ts`)**:
   - Express server running on Port 3000 alongside Vite in development or serving `dist/` in production.
   - Server-side routes:
     - `/api/ai/*` — Gemini proxy routes with automatic model fallback (`gemini-3-flash-preview` -> `gemini-2.5-flash` -> `gemini-flash-latest`).
     - `/api/jobs/discover` — Server-side multi-board job aggregator (Remotive, Arbeitnow, Jobicy, Findwork, EURES, Adzuna, Jooble, Careerjet, Reed, SerpApi, and Gemini Search Grounding) with strict deduplication.
     - `/api/interview/*` — Isolated Interview Center backend routes.
     - `/api/personal-ai/*` — Personal AI chat, memory extraction, reminders, and study plan orchestration.
     - `/api/recipes/*` — Hospitality Recipe Book APIs and AI beverage image generation.
     - `/api/download-project` — On-the-fly `.zip` source code packager (excluding `node_modules`, `.git`, `dist`, and `.env` secrets) for local Android compilation.

---

## 2. Database & Security Model (`firestore.rules`)

- **Database Provisioning**: Cloud Firestore (`ccd---a-better-you-every-day`, database `ai-studio-e4405bff-96e5-4e9d-8fc6-6665341e100c` in `europe-west2`).
- **Tenant Isolation**:
  - Every authenticated user's records live under `/users/{userId}` and its subcollections (`tasks`, `logs`, `habitLogs`, `expenses`, `debts`, `SavedJobs`, `JobApplications`, `CVProfiles`, `CoverLetters`, `EmailQueue`, `SearchHistory`, `AgentMemory`, `JobMatches`, `InterviewPrep`, `CareerDocuments`).
  - Access is strictly gated by `isOwner(userId)` (`request.auth != null && request.auth.uid == userId`).
- **CV-Only Account Hardening**:
  - `/cv_accounts/{accountId}` and `/cv_users/{phoneNumber}` allow single-document lookup/upsert (`get, create, update`) by exact document ID for CV-only passcode users while restricting `list, delete` to authenticated sessions (`isSignedIn()`), preventing bulk scraping or unauthenticated deletion.

---

## 3. Gmail Application Center & Safe Delivery Queue

Located in `src/services/gmailService.ts` and `src/services/emailQueueService.ts`:
- **OAuth 2.0**: Uses Google Identity Services (`google.accounts.oauth2.initTokenClient`) entirely in the browser with `gmail.send`, `gmail.readonly`, and `gmail.compose` scopes.
- **Anti-Spam & Safety Controls**:
  - **Daily Send Cap**: Hard limit of `40` emails per rolling day (`DAILY_EMAIL_CAP = 40`).
  - **Randomized Human Pacing**: Enforces a `45,000ms` to `90,000ms` delay (`GAP_MIN_MS` / `GAP_MAX_MS`) between consecutive emails.
  - **Duplicate Recipient Guard**: `hasEmailAddressBeenContacted()` checks both the active queue and historical `JobApplications` before enqueueing or sending.
  - **Crash Recovery**: `recoverInterruptedItemsOnStartup()` resets any item stuck in `sending` state for more than 5 minutes back to `queued` with a clear status note.

---

## 4. Android Hybrid Architecture (`WebViewAssetLoader`)

Located in `android/app/src/main/java/com/ccd/abetteryou/MainActivity.kt`:
- **Why `WebViewAssetLoader`**: Vite compiles modern ES module bundles (`<script type="module" crossorigin src="/assets/...">`). Loading `file:///android_asset/dist/index.html` inside Android WebView triggers CORS failures on `type="module"` scripts and breaks root-relative `/assets/*` paths.
- **How It Works**:
  - `WebViewAssetLoader.Builder().setDomain("appassets.androidplatform.net").addPathHandler("/", AssetsPathHandler(this, "dist")).build()` intercepts requests to `https://appassets.androidplatform.net/*` and serves files directly from `android/app/src/main/assets/dist/`.
  - Provides a secure HTTPS origin (`https://appassets.androidplatform.net`) supporting `localStorage`, `IndexedDB`, ES modules, and Web Crypto APIs without CORS errors.
  - External links (`github.com`, `mailto:`, `tel:`, `whatsapp:`) and file downloads (`DownloadListener`) are routed cleanly to Android system intents.
