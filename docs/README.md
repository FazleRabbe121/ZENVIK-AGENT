# ZENVIK-AGENT Documentation

ZENVIK-AGENT is a React + TypeScript application with an Android WebView package, Firebase web integration, and GitHub Actions workflows for web deployment and Android APK builds.

## Start here

| Document | Purpose |
|---|---|
| [বাংলা ব্যবহার ও ইনস্টলেশন গাইড](INSTALLATION-BN.md) | Install on Android/iPhone/desktop, update the app, and download APK |
| [Developer setup](DEVELOPMENT.md) | Local development, build commands, environment variables, and deployments |
| [Architecture overview](ARCHITECTURE.md) | Frontend, Firebase, backend, Android wrapper, and CI/CD |
| [Release and troubleshooting guide](RELEASES.md) | Find builds, download APKs, understand failures, and update installations |

## Main links

- Repository: https://github.com/FazleRabbe121/ZENVIK-AGENT
- GitHub Actions: https://github.com/FazleRabbe121/ZENVIK-AGENT/actions
- Android build workflow: https://github.com/FazleRabbe121/ZENVIK-AGENT/actions/workflows/build-android-apk.yml
- Latest Android APK: https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/download/android-latest/ZENVIK-AGENT-Android.apk
- Expected GitHub Pages project URL: https://fazlerabbe121.github.io/ZENVIK-AGENT/

The live Pages URL is controlled by the repository's Settings → Pages configuration. If a custom domain is configured, use that published URL instead.

## Application modules

The source currently contains views for Dashboard, Europe and Cyprus job markets, global sponsorship, AI job search, saved jobs, CV building/library, cover letters, professional documents, Gmail application workflow, bulk queue, application history, employer replies, interviews, certificates, finance, family money, recipes, reports, and progress statistics.

External services and provider credentials are required for some integrations. A visible module does not, by itself, mean its provider credentials, permissions, database rules, or backend deployment have been configured.
