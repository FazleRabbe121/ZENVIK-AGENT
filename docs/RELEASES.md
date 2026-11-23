# ZENVIK-AGENT — Releases, CI/CD & Deployment (`RELEASES.md`)

This document describes the automated build, release, and deployment pipelines for **ZENVIK-AGENT**.

---

## 1. Version & Package Metadata

- **Version Name**: `1.0.0`
- **Android Version Code**: `1`
- **Production Package ID**: `com.ccd.abetteryou`
- **Debug Package ID**: `com.ccd.abetteryou.debug`
- **Supported Android Versions**: Android 8.0 (`minSdk 26`) through Android 15 (`targetSdk 35`)
- **Latest Debug APK URL**:
  `https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/latest/download/ZENVIK-AGENT-debug.apk`

---

## 2. Automated Android APK Workflow (`.github/workflows/build-android-apk.yml`)

Triggered automatically on every push to `main` or `master`, on pull requests, or manually via `workflow_dispatch`:

1. **Checkout & Node 20 Setup**: Installs dependencies via `npm install`.
2. **Quality Gate**: Runs `npm run lint` (`tsc --noEmit`) and `npm test` (Node test runner).
3. **Web Bundle Packaging**: Runs `npm run build` and copies `dist/*` into `android/app/src/main/assets/dist/`.
4. **Android Compilation**: Sets up JDK 17 (Temurin) and Gradle 8.10.2, then runs `./gradlew assembleDebug --no-daemon --stacktrace`.
5. **Artifact Upload**: Uploads `ZENVIK-AGENT-debug.apk` as a downloadable workflow artifact (`ZENVIK-AGENT-Android-Debug-APK`).
6. **GitHub Release Publishing**: On pushes to `main`/`master`, automatically creates or updates the `v1.0.0-debug` release using `softprops/action-gh-release@v2` and attaches `ZENVIK-AGENT-debug.apk` and `app-debug.apk` so the `/releases/latest/download/ZENVIK-AGENT-debug.apk` link always serves the newest build.

---

## 3. GitHub Pages Deployment Workflow (`.github/workflows/deploy.yml`)

Triggered on pushes to `main` or `workflow_dispatch`:

1. **Quality Gate**: Runs `npm install`, `npm run lint`, and `npm test`.
2. **Static SPA Build**: Runs `npm run build` with `VITE_BASE_PATH` configured automatically for the repository (`/${repo_name}/`), copies `dist/index.html` to `dist/404.html` for client-side SPA routing fallback, and creates `dist/.nojekyll`.
3. **Deploy**: Publishes `dist/` to GitHub Pages via `actions/deploy-pages@v4`.

### Important Note: Static GitHub Pages vs. Express Backend Routes
- **GitHub Pages** hosts static frontend files (`dist/`) only. Client-side features backed by Firebase Firestore, local storage, Recipe Book static data, and browser-direct Gmail OAuth work directly on GitHub Pages.
- **Server-side Express endpoints** (`/api/ai/*`, `/api/jobs/discover`, `/api/interview/*`, `/api/personal-ai/*`, `/api/download-project`) require a running Node.js runtime (`server.ts`), such as the live Google Cloud Run deployment (`https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app`).
