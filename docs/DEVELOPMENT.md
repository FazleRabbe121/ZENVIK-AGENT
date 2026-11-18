# Developer Setup

## Stack

- React 19 + TypeScript
- Vite 8 build tool
- Tailwind CSS 4 through the Vite plugin
- Firebase Web SDK (Authentication / Firestore integration)
- Express server entry point: server.ts
- Android WebView wrapper under android/
- GitHub Actions for Pages deployment and Android APK builds

Check package.json for the exact package versions and scripts.

## Requirements

- Node.js 22 (matches the GitHub Actions workflow)
- npm
- Java 17 for Android builds
- Gradle 8.9 for the current Android workflow
- Android SDK / Android Studio for local Android device testing

## Install and run

    npm install
    npm run dev

The dev script runs tsx server.ts. The actual host/port and available server routes are defined in server.ts; do not assume the frontend-only GitHub Pages deployment runs this Express server.

Build the frontend:

    npm run build

TypeScript check:

    npm run lint

## Environment and secrets

Use .env.example as a variable-name reference. Do not commit a real .env file or private credentials.

Variables listed in the example include:
- GEMINI_API_KEY — Gemini server-side calls
- OPENAI_API_KEY — optional OpenAI verification
- GROK_API_KEY — optional xAI verification
- APP_URL — hosted application/backend URL
- Personal AI engine and scheduler configuration values

Configure secret values in the appropriate hosting provider or GitHub Settings → Secrets and variables → Actions only when a workflow actually consumes them. Never expose server secrets in Vite client-side VITE_* variables or browser bundles.

The Firebase web configuration is imported by src/services/firebase.ts from firebase-applet-config.json. Firebase web configuration is client-visible by design; access control must be enforced with Firebase Authentication, Firestore Security Rules, and provider-side restrictions. Review firestore.rules before production use.

## Base paths

vite.config.ts reads VITE_BASE_PATH.

- GitHub Pages build defaults to /ZENVIK-AGENT/ through .github/workflows/deploy.yml.
- Android bundled build sets VITE_BASE_PATH=./ so local WebView assets resolve relative to the bundled app.
- Keep PWA manifest, HTML icon references, and app logo asset paths relative/base-aware. Do not add root-absolute asset paths that break repository Pages URLs.

## Deployment workflows

### GitHub Pages

.github/workflows/deploy.yml runs on pushes to main and on manual dispatch. It builds and deploys the static frontend using GitHub Pages. It does not deploy server.ts as a persistent Express backend.

### Android APK

.github/workflows/build-android-apk.yml runs on manual dispatch and changes to the configured frontend/Android build paths on main. It:

1. Checks out the repository.
2. Installs Node dependencies and Java 17 / Gradle 8.9.
3. Runs npm run build with VITE_BASE_PATH=./.
4. Copies dist/ into android/app/src/main/assets/dist/.
5. Runs gradle assembleDebug.
6. Uploads the APK ZIP artifact.
7. Publishes ZENVIK-AGENT-Android.apk to the android-latest GitHub Release.

The workflow uses GITHUB_TOKEN with contents: write for the release asset. Keep that permission limited to the build workflow.

## Android application details

- Namespace / release application ID: com.ccd.abetteryou
- Debug application ID: com.ccd.abetteryou.debug (debug suffix is configured in android/app/build.gradle.kts)
- Minimum Android API: 26
- Compile / target SDK: 35
- Java / Kotlin target: 17
- Native WebView assets are served with AndroidX WebViewAssetLoader at https://appassets.androidplatform.net/.

The current CI produces a debug-signed APK. For public Play Store distribution, create a separate release signing setup using a protected upload/signing key, version-code management, app bundle configuration, and Play Console review. Never put a keystore password or private signing key in source control.

## Quality checks

A green GitHub Action proves that its workflow steps completed. It does not prove every provider integration works on a real account/device. Test login, file uploads, Firestore reads/writes, API-backed views, Gmail scopes, and Android WebView behavior on actual devices before calling the release production-ready.
