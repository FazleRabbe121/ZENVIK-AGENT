# Architecture Overview

## High-level structure

    Android APK ─┐
                 ├── React + Vite frontend (src/)
    Desktop/PWA ─┘          |
                            ├── Firebase Web SDK
                            |    ├── Firebase Authentication
                            |    └── Cloud Firestore
                            |
                            └── HTTP/API integrations
                                 └── Hosted backend / external providers

    GitHub Actions
      ├── Build static frontend → GitHub Pages
      └── Build frontend assets → Android WebView APK → GitHub Release

## Main source areas

| Path | Responsibility |
|---|---|
| src/App.tsx | Application shell, access modes, app-wide state, main view selection |
| src/components/ | Navigation, dialogs, shared UI and Android export/install tools |
| src/views/ | Dashboard and feature screens |
| src/services/firebase.ts | Firebase app, Authentication and Firestore client setup |
| src/services/ | Feature-level storage, job, Gmail, CV, and persistence logic |
| src/context/ThemeContext.tsx | Theme state and controls |
| public/ | Static images, PWA manifest, favicon, and downloadable public files |
| server.ts | Express/server entry point and server-side API routes |
| android/ | Native Android project, manifest, WebView host, styles and assets |
| .github/workflows/ | Automated website and Android build/release pipelines |
| docs/ | User and developer documentation |

## Data and authentication boundaries

The frontend uses the Firebase Web SDK. Authentication and Firestore are external cloud services; Android WebView is only a host for the frontend. A successful APK build does not automatically provision Firebase, set Firestore rules, authorize OAuth domains, or deploy an Express backend.

Feature-level behavior may depend on:
- A valid Firebase project configuration
- Enabled Authentication providers and authorized domains
- Correct Firestore Security Rules
- Google OAuth scopes and user consent
- Correct server-side API credentials
- A reachable and compatible backend endpoint

## Distribution modes

### GitHub Pages / PWA

The Pages workflow deploys a static web build. On a GitHub project page, all public asset and PWA paths must respect the repository subpath.

### Android WebView APK

The Android workflow embeds the Vite dist output into the APK. MainActivity.kt uses AndroidX WebViewAssetLoader so the bundled app is served through the supported appassets.androidplatform.net origin rather than relying on file:// module loading.

The APK is a snapshot of the frontend build. It does not continuously fetch new frontend code from GitHub. A new APK must be built and installed to update the bundled version.

## Security principles

- Do not commit API secrets, private keys, or signing keystores.
- Keep server credentials on the backend, not in client JavaScript.
- Enforce user data access in Firestore Security Rules; hiding a UI screen is not authorization.
- Request only necessary OAuth scopes.
- Review changes to workflow permissions before merging.
