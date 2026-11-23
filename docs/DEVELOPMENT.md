# ZENVIK-AGENT — Developer Guide (`DEVELOPMENT.md`)

This guide explains how to set up, develop, test, and build the **ZENVIK-AGENT** platform locally.

---

## 1. Repository Structure

```text
/
├── android/                  # Native Android Kotlin/Gradle wrapper project (SDK 26-35)
├── data/                     # Local JSON persistence fallbacks for Express server routes
├── docs/                     # Platform, architecture, release, and Bengali user documentation
├── jobhunter-agent/          # Standalone Python 3 CLI & Telegram job-hunting agent
├── migrations/               # SQL reference schema for agent engine
├── public/                   # Static assets, ZENVIK brand icons, PWA manifest.json, sw.js
├── src/
│   ├── components/           # Reusable UI components (Navbar, SidebarNav, BottomNav, Modals)
│   ├── content/              # Static portfolio/hospitality copy and recipe catalogs
│   ├── context/              # React contexts (AuthContext, AppContext, ThemeContext)
│   ├── modules/              # Modular feature packages (personal-ai, interview-center)
│   ├── services/             # Firebase, Gemini AI, Job Search, Gmail OAuth & Email Queue services
│   └── views/                # Full-screen application views (including AppsCenterView)
├── tests/                    # Automated Node.js test suites (personal-ai & zenvik-audit)
├── server.ts                 # Express + Vite full-stack server entry point (Port 3000)
└── vite.config.ts            # Vite bundler configuration
```

---

## 2. Environment Variables (`.env`)

Copy `.env.example` to `.env` before starting development:

```bash
cp .env.example .env
```

### Supported Variables

| Variable | Required | Scope | Description |
| :--- | :---: | :---: | :--- |
| `GEMINI_API_KEY` | Yes (for AI routes) | Server (`server.ts`) | Google Gemini API key used for CV tailoring, job discovery, interview simulation, and Personal AI |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Client (`src/`) | OAuth 2.0 Web Client ID for direct browser Gmail API access |
| `ADZUNA_APP_ID` / `ADZUNA_API_KEY` | Optional | Server | Live job feed enrichment from Adzuna |
| `JOOBLE_API_KEY` | Optional | Server | Live job feed enrichment from Jooble |
| `REED_API_KEY` | Optional | Server | Live UK/Europe job feed enrichment from Reed |
| `SERPAPI_API_KEY` | Optional | Server | Google Jobs aggregation via SerpApi |
| `FINDWORK_API_KEY` | Optional | Server | Tech & remote job feed via Findwork |

> **Security Note**: Never commit `.env` or hardcode API secrets into client code. `firebase-applet-config.json` contains standard public Firebase Web SDK identifiers secured via `firestore.rules`.

---

## 3. Running & Testing Locally

### Start Full-Stack Development Server
```bash
npm install
npm run dev
```
Runs `tsx server.ts` on `http://localhost:3000`, mounting both Express `/api/*` endpoints and Vite middleware.

### Run TypeScript Verification (`lint`)
```bash
npm run lint
```
Executes `tsc --noEmit` to validate all TypeScript types across `src/` and `server.ts`.

### Run Automated Node.js Tests
```bash
npm test
```
Executes:
- `tests/personal-ai/*.test.mjs` (30 tests covering intent routing, memory extraction, reminders, study plans, and chat orchestration)
- `tests/zenvik-audit.test.mjs` (6 comprehensive architectural, security, queue safety, Android `WebViewAssetLoader`, and documentation tests)

### Run Standalone Python Agent Tests
```bash
python3 -m unittest discover -s jobhunter-agent/tests
```

### Production Build
```bash
npm run build
```
Compiles the frontend SPA into `dist/`.

---

## 4. Building the Android APK Locally

1. Build the production web assets and copy them into the Android assets folder:
   ```bash
   npm run build
   rm -rf android/app/src/main/assets/dist
   mkdir -p android/app/src/main/assets/dist
   cp -r dist/* android/app/src/main/assets/dist/
   ```
2. Compile the Debug APK with Gradle (requires JDK 17 and Android SDK 35):
   ```bash
   cd android
   ./gradlew assembleDebug --no-daemon
   ```
   The resulting APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.
