# ZENVIK-AGENT

**AI Career & Employment Platform** — a React + TypeScript application with job-market tools, application workflow, CV management, Firebase web integration, and an Android WebView build.

## Download and use

- **Latest Android APK:** [Download ZENVIK-AGENT-Android.apk](https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/download/android-latest/ZENVIK-AGENT-Android.apk)
- **Android build history:** [GitHub Actions](https://github.com/FazleRabbe121/ZENVIK-AGENT/actions)
- **Web app:** [GitHub Pages project site](https://fazlerabbe121.github.io/ZENVIK-AGENT/)
- **Apps & Installation Center:** available inside the application navigation.

The APK pipeline currently creates a debug-signed APK for testing. It is not a Play Store production-signed release.

## Documentation

| Guide | What it covers |
|---|---|
| [বাংলা ইনস্টলেশন গাইড](docs/INSTALLATION-BN.md) | Android APK, PWA, desktop install, GitHub update instructions |
| [Documentation index](docs/README.md) | All user and developer guides |
| [Developer setup](docs/DEVELOPMENT.md) | Dependencies, local commands, secrets, and CI/CD |
| [Architecture](docs/ARCHITECTURE.md) | Frontend, Firebase, backend, Android wrapper, service boundaries |
| [Releases & troubleshooting](docs/RELEASES.md) | APK release workflow, download, updates, common failures |

## Main application areas

The source currently includes Dashboard, Europe and Cyprus job markets, global sponsorship, AI job search, saved jobs, CV builder/library, cover letters, professional documents, Gmail application center, delivery queue, application history, employer replies, interview center, certificates, finance, family money, recipes, AI reports, progress statistics, and Apps & Installation Center.

Availability of a screen does not guarantee that its external provider is configured. Firebase, Google OAuth, Gmail/Drive scopes, AI provider keys, Firestore rules, and backend hosting must be configured and tested separately.

## Repository layout

- src/App.tsx — application shell, access modes, global state and view navigation
- src/components/ — navigation, shared controls, dialogs and branding
- src/views/ — feature screens, including AppsCenterView
- src/services/ — Firebase, data persistence, CV, Gmail, job and provider services
- public/ — PWA manifest, icons and static assets
- android/ — Android WebView application, launcher icon, theme and native resources
- server.ts — Express/server entry point
- .github/workflows/ — GitHub Pages and Android APK automation
- docs/ — Bengali user guide and technical documentation

## Local development

Requirements: Node.js 22 and npm. Android builds also require Java 17 and the Android SDK.

Install dependencies:

    npm install

Start the development server:

    npm run dev

Build the frontend:

    npm run build

Run the TypeScript check:

    npm run lint

See [Developer setup](docs/DEVELOPMENT.md) for details.

## Automated deployment

### GitHub Pages

The workflow at .github/workflows/deploy.yml deploys the static frontend when changes are pushed to main. The expected project URL is:

https://fazlerabbe121.github.io/ZENVIK-AGENT/

The actual published URL is controlled by **Repository Settings → Pages**.

GitHub Pages serves static files. It does not run the Express server from server.ts. Any feature that requires server-side API routes needs a separately hosted backend and correct environment configuration.

### Android APK

The workflow at .github/workflows/build-android-apk.yml runs on main when configured frontend, public asset, Android, package/build or workflow files change. It builds the Vite frontend with a relative base path, copies dist into the Android WebView assets, runs Gradle assembleDebug, uploads an Actions artifact, and publishes a direct APK asset to the android-latest GitHub Release.

A successful build does not prove that every Firebase, OAuth, API, Gmail or device integration works. Test those functions on an actual Android device.

## Update behavior

- Website: a successful Pages deployment publishes the new website build.
- Installed PWA: refresh or reopen while online to load the newly published site.
- Android APK: the APK contains bundled frontend assets. A new APK must be built and installed to update it; it does not silently synchronize code changes from GitHub.

The current CI uses the default debug signing configuration. Depending on runner signing-key continuity, Android may require an older debug build to be uninstalled before installing a later build. Back up or cloud-sync local data before uninstalling.

## Security

- Never commit real API secrets, OAuth client secrets, private keys, or signing keystores.
- Keep server API credentials on a backend; Vite client-side variables and bundled JavaScript are visible to users.
- Enforce data access with Firebase Authentication and Firestore Security Rules.
- Verify OAuth domains/scopes and provider permissions before production use.
