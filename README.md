# ZENVIK-AGENT — AI Career & Employment Platform

**ZENVIK-AGENT** (`com.ccd.abetteryou`) is a full-stack AI Career, Employment, Visa Sponsorship Discovery, Automated Gmail Outreach, Interview Preparation, and Personal Growth Platform built for web, PWA, and native Android (`WebViewAssetLoader` hybrid container).

---

## Live Links & Downloads

- **GitHub Repository**: [https://github.com/FazleRabbe121/ZENVIK-AGENT](https://github.com/FazleRabbe121/ZENVIK-AGENT)
- **Latest Android Debug APK**: [Download ZENVIK-AGENT-debug.apk](https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/latest/download/ZENVIK-AGENT-debug.apk)
- **Production / Shared Web App (Cloud Run)**: [https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app](https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app)
- **Development Web App**: [https://ais-dev-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app](https://ais-dev-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app)

---

## Key Platform Modules

1. **Dashboard & Daily Routine Engine**: Daily task tracking, streak analytics, hydration, sleep, mood, and reflection logs synced with Firebase Firestore.
2. **Personal AI Assistant**: Context-aware AI assistant with persistent conversation history, memory extraction, reminders, and study plans (`/api/personal-ai/*`).
3. **Global & Regional Job Markets**:
   - **Europe Job Market**, **Cyprus Job Market**, **Visa Sponsorship Jobs**, and **AI Flexible Job Search**.
   - Multi-source aggregation (Remotive, Arbeitnow, Jobicy, Findwork, EURES, Adzuna, Jooble, Careerjet, Reed, SerpApi Google Jobs, and Gemini Search Grounding) with multi-key deduplication.
4. **CV Library, Cover Letter Manager & Photo/Document Vault**:
   - Tailored CV management, AI cover letter generation, certificate generator, and passport/document storage.
5. **Gmail Application Center & Safe Delivery Queue**:
   - Client-side Google Workspace OAuth 2.0 (`gmail.send`, `gmail.readonly`, `gmail.compose`).
   - Built-in rate limiting (`40 emails/day` cap, `45–90s` randomized human delay between sends, duplicate recipient blocking, and automatic startup crash recovery).
   - Employer Replies & Interview Detection (`checkGmailReplies`), Application History, and Rejected / Reapply Later tracking.
6. **AI Interview Center & Dedicated Interview Portal**:
   - Isolated candidate preparation workspace (`?portal=interview`) with mock interviews, company dossier generation, and rubric feedback.
7. **Hospitality Recipe Book, Finance & Family Money, Habit & Recovery, Reports & Statistics**.
8. **Apps & Installation Center**:
   - Unified download and installation hub for Android APK, PWA installation (Android, iOS, Windows, macOS), 1-Click Windows USB APK builder scripts, and in-app bilingual documentation.

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js**: v20+ and `npm`
- **Python**: v3.11+ (optional, for the standalone `jobhunter-agent` CLI/Telegram daemon)
- **Java JDK 17 & Android SDK 35**: Required only if compiling the Android APK locally.

### 1. Install & Run Full-Stack Server
```bash
npm install
cp .env.example .env
# Add GEMINI_API_KEY in .env for server-side AI routes
npm run dev
```
The Express + Vite full-stack server starts on `http://localhost:3000`.

### 2. Typecheck, Test & Build
```bash
npm run lint     # TypeScript strict verification (tsc --noEmit)
npm test         # Node test runner (Personal AI + ZENVIK Audit tests)
npm run build    # Production Vite build -> dist/
```

---

## Documentation Index

- **[README-BN.txt](./README-BN.txt)** — বাংলায় সম্পূর্ণ ইনস্টলেশন ও ব্যবহার নির্দেশিকা (Bengali Quick Guide)
- **[docs/README.md](./docs/README.md)** — Documentation overview & module directory
- **[docs/INSTALLATION-BN.md](./docs/INSTALLATION-BN.md)** — Android, iOS, Windows ও macOS-এ ইনস্টল করার বিস্তারিত বাংলা গাইড
- **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)** — Local development, environment variables, testing, and debugging
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — System architecture, Firebase security model, Express API, and Android `WebViewAssetLoader` design
- **[docs/RELEASES.md](./docs/RELEASES.md)** — Release workflow, GitHub Actions CI/CD, and Android APK signing/publishing
