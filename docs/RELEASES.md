# Releases and Troubleshooting

## Android build workflow

Open [Build ZENVIK Android APK](https://github.com/FazleRabbe121/ZENVIK-AGENT/actions/workflows/build-android-apk.yml).

A run is successful when:
- The workflow run shows **Success**.
- The Android job's **Build debug APK** step succeeds.
- The summary shows one uploaded artifact.
- The workflow completes its direct-release upload step.

## Download locations

- [Latest direct APK file](https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/download/android-latest/ZENVIK-AGENT-Android.apk)
- [Latest release page](https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/tag/android-latest)
- [Workflow run history](https://github.com/FazleRabbe121/ZENVIK-AGENT/actions)

The Actions artifact is a ZIP archive containing the APK. The android-latest Release provides the APK as a direct download asset for the Apps Center.

## What “Not published” means

The Gradle Build Scan field can say **Not published** even when the APK build succeeds. It means no Gradle Build Scan report was published. Check the workflow build outcome and APK artifact/release instead.

## Web release

The Pages workflow is separate from the Android build. It publishes the static web frontend. It does not run the Express backend in server.ts.

## Updating an installed app

- PWA: refresh/reopen while online after the Pages workflow has deployed.
- Android APK: download and install the newest APK. Android may refuse an in-place update when the signing certificate differs. The current CI build is debug-signed; if that happens, back up/sync data and uninstall the previous debug APK before installing the new one.
- A GitHub push does not silently update a bundled APK already installed on a phone.

## Common failures

| Symptom | What to inspect |
|---|---|
| Build failed before Gradle | Node dependency installation and Vite build logs |
| Unresolved reference in Kotlin | Native Android imports vs dependencies in android/app/build.gradle.kts |
| Missing Android resource | Manifest references vs android/app/src/main/res/ files |
| App opens to blank screen | WebView asset origin, WebViewAssetLoader, relative asset paths, and browser console/runtime errors |
| Google sign-in fails | Firebase Auth provider, authorized domains, OAuth client setup, WebView/browser restrictions |
| Cloud records missing | Firebase project, Auth UID, Firestore rules, network, and read/write logs |
| AI/Gmail/server feature fails | Backend deployment, API credentials, provider authorization, and required OAuth scopes |

Do not treat a successful APK compilation as proof of runtime integrations. Verify on a physical Android device using the actual user account and test data.
