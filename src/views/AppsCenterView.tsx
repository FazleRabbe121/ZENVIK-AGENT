import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  Terminal,
  FileArchive,
  Mail,
  AlertTriangle,
  Zap,
  Monitor,
  Apple,
  Globe,
  BookOpen,
  FileText,
  Layers,
  Info,
  Check,
  Cpu,
  Code2,
  GitBranch,
  X,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { CCDLogo } from '../components/CCDLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface AppsCenterViewProps {
  onOpenLegacyModal?: () => void;
}

type PlatformTab = 'android' | 'ios' | 'windows' | 'macos' | 'usb-builder' | 'gmail-oauth';

interface DocItem {
  id: string;
  title: string;
  path: string;
  githubUrl: string;
  badge: string;
  summary: string;
  contentPreview: string;
}

const GITHUB_REPO_URL = 'https://github.com/FazleRabbe121/ZENVIK-AGENT';
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
const GITHUB_LATEST_APK_URL = `${GITHUB_REPO_URL}/releases/latest/download/ZENVIK-AGENT-debug.apk`;
const GITHUB_ACTIONS_APK_URL = `${GITHUB_REPO_URL}/actions/workflows/build-android-apk.yml`;
const GITHUB_PAGES_WORKFLOW_URL = `${GITHUB_REPO_URL}/actions/workflows/deploy.yml`;
const SHARED_APP_URL = 'https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app';

const DOCUMENTATION_ITEMS: DocItem[] = [
  {
    id: 'readme-en',
    title: 'Project Overview (README.md)',
    path: '/README.md',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/README.md`,
    badge: 'English',
    summary: 'Complete overview of ZENVIK-AGENT features, architecture, local setup, and Android APK build system.',
    contentPreview: `# ZENVIK-AGENT — AI Career & Employment Platform

ZENVIK-AGENT is a full-stack AI Career, Hospitality Employment, Visa Sponsorship Discovery, CV & Cover Letter Engineering, AI Interview Assessment, and Personal Finance/Habit Mastery platform.

## Core Modules
- Europe, Cyprus & Global Visa Sponsorship Job Discovery
- Multi-CV Library, Builder & Document Vault
- Gmail OAuth Application Center & Persistent Outbox Queue (40/day cap, duplicate prevention)
- Isolated AI Interview & English Assessment Center (CEFR A1–C2 + Role Levels 1–3)
- Belvoriné Certificate Generator & QR Verification
- Personal AI Career Agent, Recipe Vault, Finance & Family Money Tracker, Habit Recovery

## Quick Start
1. Install dependencies: npm install
2. Start full-stack dev server (port 3000): npm run dev
3. Type-check: npm run lint
4. Run automated unit tests: npm test
5. Build production bundle: npm run build`,
  },
  {
    id: 'readme-bn',
    title: 'বাংলা নির্দেশিকা (README-BN.txt)',
    path: '/README-BN.txt',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/README-BN.txt`,
    badge: 'বাংলা',
    summary: 'ZENVIK-AGENT অ্যাপ ব্যবহার, মোবাইল ইনস্টলেশন, জিমেইল সংযোগ এবং ওয়ান-ক্লিক USB APK তৈরির সম্পূর্ণ বাংলা গাইড।',
    contentPreview: `======================================================================
ZENVIK-AGENT — এআই ক্যারিয়ার এবং এমপ্লয়মেন্ট প্ল্যাটফর্ম (বাংলা নির্দেশিকা)
======================================================================

১. মোবাইলে সরাসরি ইনস্টল (PWA পদ্ধতি):
   - আপনার ফোনের Google Chrome ব্রাউজারে অ্যাপ লিংকটি খুলুন।
   - ডানপাশের উপরের তিনটি ডট (⋮) মেনুতে ট্যাপ করুন।
   - "Install app" বা "Add to Home screen" নির্বাচন করুন।

২. Android APK ডাউনলোড (GitHub Releases / Actions):
   - GitHub Releases থেকে ZENVIK-AGENT-debug.apk সরাসরি ডাউনলোড করুন।
   - ফোনে ইনস্টল করার সময় "Install unknown apps" অনুমতি দিন।

৩. Windows ল্যাপটপ + USB কেবল (১-ক্লিক অটোমেটিক বিল্ড ও ইনস্টল):
   - ফোনে Developer Options > USB Debugging চালু করুন।
   - BUILD_AND_INSTALL.bat ফাইলে ডাবল-ক্লিক করুন।`,
  },
  {
    id: 'docs-index',
    title: 'Documentation Hub (docs/README.md)',
    path: '/docs/README.md',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/docs/README.md`,
    badge: 'Index',
    summary: 'Central index for architecture, installation, development workflows, security model, and release engineering.',
    contentPreview: `# ZENVIK-AGENT Documentation Index

- docs/INSTALLATION-BN.md — Step-by-step Bengali & English installation guide for Android, iOS, Windows, and macOS
- docs/DEVELOPMENT.md — Local development, environment variables, Express backend routes, and testing commands
- docs/ARCHITECTURE.md — System architecture, Firestore data isolation, WebViewAssetLoader, and security boundaries
- docs/RELEASES.md — CI/CD pipelines, Android APK debug vs release signing, and GitHub Pages static deployment notes`,
  },
  {
    id: 'docs-install-bn',
    title: 'ইনস্টলেশন গাইড (docs/INSTALLATION-BN.md)',
    path: '/docs/INSTALLATION-BN.md',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/docs/INSTALLATION-BN.md`,
    badge: 'Install Guide',
    summary: 'বিস্তারিত Android APK, iOS Safari, Windows ও macOS ইনস্টলেশন এবং Gmail OAuth সমস্যা সমাধানের নির্দেশিকা।',
    contentPreview: `# ZENVIK-AGENT ইনস্টলেশন ও সেটআপ গাইড (Android, iOS, Windows, macOS)

## Android (APK এবং PWA)
- GitHub Release থেকে সর্বশেষ ZENVIK-AGENT-debug.apk ডাউনলোড করে ইনস্টল করুন।
- অথবা Chrome ব্রাউজার থেকে "Install app" চাপুন।

## iOS (iPhone / iPad)
- Safari ব্রাউজারে অ্যাপটি খুলুন -> Share বাটনে ট্যাপ করুন -> "Add to Home Screen" চাপুন।

## Windows & macOS
- Chrome বা Edge ব্রাউজারের অ্যাড্রেস বারের ডানপাশে থাকা Install আইকনে ক্লিক করে ডেস্কটপ অ্যাপ হিসেবে ইনস্টল করুন।`,
  },
  {
    id: 'docs-dev',
    title: 'Developer Guide (docs/DEVELOPMENT.md)',
    path: '/docs/DEVELOPMENT.md',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/docs/DEVELOPMENT.md`,
    badge: 'Engineering',
    summary: 'Environment variables, Express server vs static hosting, test suites, and Android Gradle commands.',
    contentPreview: `# ZENVIK-AGENT Development & Environment Guide

## Prerequisites
- Node.js 20+ and npm
- Python 3.10+ (optional, for jobhunter-agent CLI tests)
- JDK 17 + Android SDK 35 (for local Android APK compilation)

## Environment Variables (.env)
- GEMINI_API_KEY — Server-side Google Gemini API key (never exposed to browser bundle)
- OPENAI_API_KEY / GROK_API_KEY — Optional server-side cooperative verification keys
- APP_PORT — Express server port (default: 3000)

## Important Backend Note
GitHub Pages hosts static frontend assets only. Features requiring /api/* routes (Gemini AI chat/reports, server-side job discovery, Interview Center server DB) require the Node.js Express server (npm start / Cloud Run) to be running.`,
  },
  {
    id: 'docs-arch',
    title: 'System Architecture (docs/ARCHITECTURE.md)',
    path: '/docs/ARCHITECTURE.md',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/docs/ARCHITECTURE.md`,
    badge: 'Architecture',
    summary: 'Multi-tier access gate, Firebase UID isolation, 500KB chunked CV storage, and Android WebViewAssetLoader design.',
    contentPreview: `# ZENVIK-AGENT Architecture & Security Specification

## 1. Access Tiers
- Full Workspace (Passcode 89056 + Firebase Google Auth)
- CV-Only Workspace (Passcode 00000 — strictly isolated to CV Builder/Library)
- Participant Interview Portal (Approved Gmail allowlist + optional PIN — isolated to InterviewPortalView)

## 2. Cloud Firestore Data Model
- /users/{userId} and subcollections (/workspace/main, /cvLibrary/main, /cvDocuments/{cvId}, /finance, /relapses, /familyMoney, /recipes, /reports) enforced by request.auth.uid == userId.
- Heavy CV binaries are split into 500KB chunks under /users/{userId}/cvDocuments/{cvId}.

## 3. Android WebView Architecture
- Uses AndroidX WebViewAssetLoader serving bundled dist/ assets over https://appassets.androidplatform.net/index.html (no file:// CORS issues).`,
  },
  {
    id: 'docs-releases',
    title: 'Release & CI/CD Guide (docs/RELEASES.md)',
    path: '/docs/RELEASES.md',
    githubUrl: `${GITHUB_REPO_URL}/blob/main/docs/RELEASES.md`,
    badge: 'CI/CD',
    summary: 'GitHub Actions workflows for Android Debug APK publishing, artifact retention, and GitHub Pages deployment.',
    contentPreview: `# ZENVIK-AGENT Release & CI/CD Automation

## Automated Workflows
1. .github/workflows/build-android-apk.yml
   - Runs npm install, npm run lint (tsc --noEmit), unit tests, and npm run build
   - Copies dist/* into android/app/src/main/assets/dist/
   - Compiles Debug APK with Java 17 & Gradle 8.10.2 (./gradlew assembleDebug)
   - Uploads artifact ZENVIK-AGENT-Android-Debug-APK and publishes ZENVIK-AGENT-debug.apk to GitHub Releases on main branch pushes.

2. .github/workflows/deploy.yml
   - Validates TypeScript & unit tests, builds static SPA with Vite, creates 404.html SPA fallback, and deploys to GitHub Pages.

## Debug vs Signed Production APK
The automated workflow produces a Debug APK (applicationId: com.ccd.abetteryou.debug) for direct device testing. Production Play Store releases require a private signing keystore.`,
  },
];

export const AppsCenterView: React.FC<AppsCenterViewProps> = ({ onOpenLegacyModal }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [activePlatform, setActivePlatform] = useState<PlatformTab>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandaloneInstalled, setIsStandaloneInstalled] = useState<boolean>(false);
  const [pwaStatusNotice, setPwaStatusNotice] = useState<{
    type: 'info' | 'success' | 'warning';
    message: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<DocItem | null>(null);

  useEffect(() => {
    const checkStandalone = () => {
      try {
        const isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true;
        setIsStandaloneInstalled(isStandalone);
      } catch {
        setIsStandaloneInstalled(false);
      }
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandaloneInstalled(true);
      setDeferredPrompt(null);
      setPwaStatusNotice({
        type: 'success',
        message: 'ZENVIK Agent was confirmed installed by your browser.',
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleTriggerPwaInstall = async () => {
    if (isStandaloneInstalled) {
      setPwaStatusNotice({
        type: 'info',
        message: 'You are already running ZENVIK Agent in standalone installed mode.',
      });
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredPrompt(null);
          setPwaStatusNotice({
            type: 'success',
            message: 'Browser installation prompt accepted. ZENVIK Agent is being added to your device.',
          });
        } else {
          setPwaStatusNotice({
            type: 'warning',
            message: 'Installation prompt was dismissed. You can install anytime using the button or browser menu.',
          });
        }
      } catch (err: any) {
        setPwaStatusNotice({
          type: 'warning',
          message: err?.message || 'Browser could not complete the install prompt. Use your browser menu below.',
        });
      }
      return;
    }

    // Honest guidance when beforeinstallprompt is unavailable (e.g. iOS Safari, Firefox, or embedded preview)
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    if (/iphone|ipad|ipod/.test(ua)) {
      setActivePlatform('ios');
      setPwaStatusNotice({
        type: 'info',
        message:
          'iOS Safari does not support automatic install prompts. Follow the 3-step Safari "Add to Home Screen" guide shown below.',
      });
    } else {
      setPwaStatusNotice({
        type: 'info',
        message:
          'Direct browser install prompt is not active in this window/tab. Open the live app URL in Google Chrome or Microsoft Edge and select Menu (⋮) → "Install app" or "Add to Home screen".',
      });
    }
  };

  const gitCommands = `git remote add origin https://github.com/FazleRabbe121/ZENVIK-AGENT.git
git branch -M main
git push -u origin main`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Hero Banner */}
      <div
        className={`rounded-3xl p-6 sm:p-8 border transition-all ${
          isDark
            ? 'bg-gradient-to-br from-[#161922] via-[#12151e] to-[#181c28] border-white/[0.08] shadow-2xl'
            : 'bg-white border-slate-200/90 shadow-lg shadow-slate-900/[0.03]'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <CCDLogo size={36} mode="icon" />
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                  isDark
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                Apps &amp; Installation Center
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border ${
                  isDark
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                v1.0.0 (Code 1)
              </span>
            </div>

            <h1
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-['Montserrat'] ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              ZENVIK Official App Downloads &amp; Device Setup
            </h1>

            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Install <strong>ZENVIK Agent</strong> across Android (native WebView APK or Chrome PWA), iOS (Safari Home Screen), Windows, and macOS, or build and deploy directly over USB with 1-Click automation.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <a
              href={GITHUB_LATEST_APK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Download Latest Debug APK</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>

            <button
              type="button"
              onClick={handleTriggerPwaInstall}
              className={`px-5 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider border flex items-center justify-center gap-2 transition cursor-pointer ${
                isStandaloneInstalled
                  ? isDark
                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : deferredPrompt
                  ? isDark
                    ? 'bg-white text-slate-950 hover:bg-zinc-200 border-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900'
                  : isDark
                  ? 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.12] text-white'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>
                {isStandaloneInstalled
                  ? 'Running as Installed PWA'
                  : deferredPrompt
                  ? 'Install Web App (PWA) Now'
                  : 'PWA Install Instructions'}
              </span>
            </button>
          </div>
        </div>

        {/* Truthful PWA Install Status Notice */}
        {pwaStatusNotice && (
          <div
            className={`mt-4 p-3.5 rounded-2xl border text-xs flex items-start justify-between gap-3 ${
              pwaStatusNotice.type === 'success'
                ? isDark
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : pwaStatusNotice.type === 'warning'
                ? isDark
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
                : isDark
                ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{pwaStatusNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setPwaStatusNotice(null)}
              className="opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
              title="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Package & Build Specifications Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#151821] border-white/[0.07]' : 'bg-white border-slate-200/80 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Android Package ID
            </span>
            <button
              type="button"
              onClick={() => handleCopy('com.ccd.abetteryou', 'pkg')}
              className={`p-1 rounded-lg text-xs transition cursor-pointer ${
                isDark ? 'hover:bg-white/10 text-zinc-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500'
              }`}
              title="Copy Package Name"
            >
              {copiedKey === 'pkg' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className={`text-sm font-mono font-bold truncate ${isDark ? 'text-amber-300' : 'text-slate-900'}`}>
            com.ccd.abetteryou
          </div>
          <div className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Debug suffix: <code className="font-mono">.debug</code>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#151821] border-white/[0.07]' : 'bg-white border-slate-200/80 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              App Version &amp; SDK
            </span>
            <Cpu className="w-4 h-4 text-emerald-500" />
          </div>
          <div className={`text-sm font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            v1.0.0 (versionCode 1)
          </div>
          <div className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Min SDK 26 (Android 8.0) • Target SDK 35
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#151821] border-white/[0.07]' : 'bg-white border-slate-200/80 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              PWA Status
            </span>
            <Globe className="w-4 h-4 text-blue-500" />
          </div>
          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {isStandaloneInstalled
              ? 'Installed (Standalone)'
              : deferredPrompt
              ? 'Install Prompt Ready'
              : 'Browser Mode Active'}
          </div>
          <div className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Manifest: <code className="font-mono">/manifest.json</code>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#151821] border-white/[0.07]' : 'bg-white border-slate-200/80 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Asset Loader &amp; OAuth
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            WebViewAssetLoader
          </div>
          <div className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            HTTPS asset host + OAuth popup dialog
          </div>
        </div>
      </div>

      {/* Direct Downloads & Repository Links Card */}
      <div
        className={`rounded-3xl p-5 sm:p-6 border ${
          isDark ? 'bg-[#151821] border-white/[0.08]' : 'bg-white border-slate-200/90 shadow-xs'
        }`}
      >
        <h2 className={`text-base font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <Download className="w-4 h-4 text-emerald-500" />
          <span>Official Builds, Releases &amp; Source Bundles</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Latest Debug APK Release */}
          <div
            className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
              isDark ? 'bg-[#10131b] border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Android Debug APK
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                  Direct APK
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Automated debug build (<code className="font-mono">com.ccd.abetteryou.debug</code>) compiled from the <code className="font-mono">main</code> branch via GitHub Actions. Not a Play Store signed release.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={GITHUB_LATEST_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Latest APK</span>
              </a>
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                  isDark
                    ? 'border-white/15 text-zinc-200 hover:bg-white/10'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>Releases</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Card 2: GitHub Actions CI Artifacts */}
          <div
            className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
              isDark ? 'bg-[#10131b] border-blue-500/30' : 'bg-blue-50/50 border-blue-200'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  GitHub Actions CI/CD
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-600 dark:text-blue-300">
                  Workflow Runs
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Inspect live Android Gradle builds, download workflow run artifacts (<code className="font-mono">ZENVIK-AGENT-Android-Debug-APK</code>), or trigger a fresh build.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={GITHUB_ACTIONS_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold text-center flex items-center justify-center gap-1.5 transition"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>APK Workflow</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={GITHUB_PAGES_WORKFLOW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                  isDark
                    ? 'border-white/15 text-zinc-200 hover:bg-white/10'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>Pages CI</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Card 3: Full Project Source ZIP */}
          <div
            className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
              isDark ? 'bg-[#10131b] border-amber-500/30' : 'bg-amber-50/50 border-amber-200'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Full Project Bundle (.ZIP)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  Offline Archive
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Complete project archive including Android Gradle wrapper, Windows 1-Click USB batch scripts, and web source code.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="/ccd-hospitality-full-project.zip"
                download="ccd-hospitality-full-project.zip"
                className="flex-1 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold text-center flex items-center justify-center gap-1.5 transition"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>Download .ZIP</span>
              </a>
              {onOpenLegacyModal && (
                <button
                  type="button"
                  onClick={onOpenLegacyModal}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isDark
                      ? 'border-white/15 text-zinc-200 hover:bg-white/10'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Quick Modal
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Platform Installation Instructions (Android, iOS, Windows, macOS, USB Builder, Gmail OAuth) */}
      <div
        className={`rounded-3xl p-5 sm:p-6 border ${
          isDark ? 'bg-[#151821] border-white/[0.08]' : 'bg-white border-slate-200/90 shadow-xs'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-white/[0.08]">
          <div>
            <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Platform Installation Guides (Android, iOS, Windows &amp; macOS)
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Select your operating system below for verified step-by-step installation instructions.
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'android' as PlatformTab, label: 'Android', icon: Smartphone },
              { id: 'ios' as PlatformTab, label: 'iOS (iPhone/iPad)', icon: Apple },
              { id: 'windows' as PlatformTab, label: 'Windows', icon: Monitor },
              { id: 'macos' as PlatformTab, label: 'macOS', icon: Layers },
              { id: 'usb-builder' as PlatformTab, label: '1-Click USB Builder', icon: Zap },
              { id: 'gmail-oauth' as PlatformTab, label: 'Gmail OAuth Fix', icon: Mail },
            ].map(tab => {
              const Icon = tab.icon;
              const active = activePlatform === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePlatform(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer ${
                    active
                      ? isDark
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'bg-slate-900 text-white shadow-sm'
                      : isDark
                      ? 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ANDROID GUIDE */}
        {activePlatform === 'android' && (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Method A: Native Android APK Installation
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-bold">
                  Android 8.0+ (API 26+)
                </span>
              </div>
              <ol className={`list-decimal list-inside text-xs space-y-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  Tap <strong>Download Latest Debug APK</strong> above (or open{' '}
                  <a href={GITHUB_RELEASES_URL} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                    GitHub Releases
                  </a>
                  ) to download <code className="font-mono">ZENVIK-AGENT-debug.apk</code>.
                </li>
                <li>
                  Open the downloaded <code className="font-mono">.apk</code> file on your Android phone.
                </li>
                <li>
                  If prompted by Android security, enable <strong>Allow from this source</strong> (Install unknown apps) for your browser or file manager.
                </li>
                <li>
                  Tap <strong>Install</strong> and then <strong>Open</strong>. The app uses <code className="font-mono">WebViewAssetLoader</code> for fast offline-ready asset loading and supports file picking for CV PDF/DOCX uploads.
                </li>
              </ol>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                  Method B: Android Chrome PWA Installation
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-500 font-bold">
                  Full Gmail OAuth
                </span>
              </div>
              <ol className={`list-decimal list-inside text-xs space-y-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  Open ZENVIK Agent in <strong>Google Chrome</strong> on your Android phone.
                </li>
                <li>
                  Tap the <strong>Install Web App (PWA) Now</strong> button above, or tap the Chrome menu <strong>(⋮)</strong> in the top-right corner.
                </li>
                <li>
                  Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>
                  Launch <strong>ZENVIK</strong> from your home screen in standalone full-screen mode with native Google Sign-In and Gmail API support.
                </li>
              </ol>
              <div className="pt-1 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/20 dark:bg-black/40 border border-slate-300/60 dark:border-white/10">
                <code className="text-[11px] font-mono truncate text-blue-600 dark:text-blue-300">{SHARED_APP_URL}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(SHARED_APP_URL, 'app-url')}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  {copiedKey === 'app-url' ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* iOS GUIDE */}
        {activePlatform === 'ios' && (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  iPhone &amp; iPad Installation (iOS / iPadOS Safari)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-500 font-bold">
                  iOS 16.4+ Recommended
                </span>
              </div>
              <ol className={`list-decimal list-inside text-xs space-y-2.5 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  Open <code className="font-mono">{SHARED_APP_URL}</code> in <strong>Safari</strong> on your iPhone or iPad. (Note: Apple requires Safari or Add-to-Home-Screen-compatible browsers on iOS; Android <code className="font-mono">.apk</code> files cannot run on iOS.)
                </li>
                <li>
                  Tap the <strong>Share</strong> button (square with an upward arrow <code className="font-mono">⎋</code>) at the bottom of Safari.
                </li>
                <li>
                  Scroll down the Share sheet and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Confirm the name <strong>ZENVIK</strong> and tap <strong>Add</strong> in the top-right corner. The official ZENVIK icon will appear on your iOS Home Screen and launch in standalone mode.
                </li>
              </ol>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <h3 className={`text-sm font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                iOS Safari Notes &amp; Capabilities
              </h3>
              <ul className={`list-disc list-inside text-xs space-y-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  <strong>Apple Touch Icon</strong>: Configured with a high-resolution PNG icon (<code className="font-mono">rel="apple-touch-icon"</code>) in <code className="font-mono">index.html</code> so iOS renders the crisp ZENVIK emblem.
                </li>
                <li>
                  <strong>CV &amp; Photo Uploads</strong>: Supports selecting PDF/DOCX CVs from iCloud Drive / Files app and photos from the iOS Photo Library.
                </li>
                <li>
                  <strong>Google Sign-In</strong>: Uses Firebase Google OAuth popup/redirect authentication compatible with iOS Safari.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* WINDOWS GUIDE */}
        {activePlatform === 'windows' && (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <h3 className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                Windows 10 / 11 Desktop App (Chrome &amp; Edge PWA)
              </h3>
              <ol className={`list-decimal list-inside text-xs space-y-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  Open ZENVIK Agent in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> on Windows.
                </li>
                <li>
                  Click the <strong>Install ZENVIK Agent</strong> icon on the right side of the address bar (or open Menu <code className="font-mono">⋮</code> → <strong>Cast, save, and share</strong> → <strong>Install page as app...</strong>).
                </li>
                <li>
                  Click <strong>Install</strong>. Windows will create a desktop shortcut, Start Menu entry, and taskbar-pinnable window.
                </li>
              </ol>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <h3 className={`text-sm font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                Windows Local Full-Stack Development
              </h3>
              <ol className={`list-decimal list-inside text-xs space-y-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  Install <strong>Node.js 20 LTS</strong> from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">nodejs.org</a>.
                </li>
                <li>
                  Extract the project ZIP or clone <code className="font-mono">{GITHUB_REPO_URL}</code>.
                </li>
                <li>
                  Run <code className="font-mono">npm install</code> and <code className="font-mono">npm run dev</code> to start the Vite + Express server at <code className="font-mono">http://localhost:3000</code>.
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* MACOS GUIDE */}
        {activePlatform === 'macos' && (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                macOS Desktop App (Safari Add to Dock / Chrome PWA)
              </h3>
              <ol className={`list-decimal list-inside text-xs space-y-2 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <li>
                  <strong>macOS Safari (Sonoma 14+ / Sequoia)</strong>: Open ZENVIK Agent in Safari, then click <strong>File → Add to Dock...</strong> in the macOS menu bar and click <strong>Add</strong>.
                </li>
                <li>
                  <strong>macOS Google Chrome / Brave / Edge</strong>: Click the <strong>Install</strong> icon in the right side of the address bar and confirm <strong>Install</strong> to add ZENVIK Agent to <code className="font-mono">~/Applications/Chrome Apps</code> and your Dock.
                </li>
              </ol>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <h3 className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                macOS Terminal &amp; Android Studio Build
              </h3>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                On macOS with Node 20 and JDK 17 installed, build the web bundle and compile the Android APK from Terminal:
              </p>
              <pre className="text-[11px] font-mono bg-slate-950 text-emerald-400 p-3 rounded-xl overflow-x-auto">
{`npm install && npm run build
mkdir -p android/app/src/main/assets/dist
cp -R dist/* android/app/src/main/assets/dist/
cd android && ./gradlew assembleDebug`}
              </pre>
            </div>
          </div>
        )}

        {/* 1-CLICK USB BUILDER GUIDE */}
        {activePlatform === 'usb-builder' && (
          <div className="mt-5 space-y-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border ${
                isDark ? 'bg-amber-950/20 border-amber-500/40' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300 font-extrabold text-sm">
                <Zap className="w-4 h-4" />
                <span>Windows Laptop + USB Cable + Android Phone (1-Click Build &amp; Install)</span>
              </div>
              <p className={`text-xs mt-1.5 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                Enable <strong>USB Debugging</strong> in your phone&apos;s Developer Options, connect via USB, and double-click <code className="font-mono font-bold">BUILD_AND_INSTALL.bat</code> in the project root. It compiles the web app, bundles assets into <code className="font-mono">android/app/src/main/assets/dist/</code>, runs <code className="font-mono">gradlew.bat assembleDebug</code>, installs via <code className="font-mono">adb install -r -d</code>, and launches <code className="font-mono">com.ccd.abetteryou.debug</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                {
                  script: 'BUILD_AND_INSTALL.bat',
                  desc: 'Builds web + Debug APK, installs over USB via ADB, and launches app on phone.',
                },
                {
                  script: 'SETUP_ANDROID_ENVIRONMENT.bat',
                  desc: 'Verifies Node.js, JDK 17, Android SDK, and ADB environment paths on Windows.',
                },
                {
                  script: 'CHECK_ANDROID_DEVICE.bat',
                  desc: 'Checks if your Android phone is connected and authorized via ADB.',
                },
                {
                  script: 'BUILD_RELEASE.bat',
                  desc: 'Compiles web assets and runs gradlew.bat assembleRelease.',
                },
              ].map(item => (
                <div
                  key={item.script}
                  className={`p-3.5 rounded-2xl border ${
                    isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="font-mono font-bold text-amber-600 dark:text-amber-400">{item.script}</div>
                  <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GMAIL OAUTH FIX & GITHUB UPLOAD */}
        {activePlatform === 'gmail-oauth' && (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-2.5 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Why Generic WebView Converters Fail vs. ZENVIK Native Host</span>
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                Third-party URL-to-APK converters fail Google Sign-In with <code className="font-mono text-rose-500">403: disallowed_useragent</code> and drop OAuth popups. ZENVIK&apos;s Android project (<code className="font-mono">MainActivity.kt</code>) normalizes the WebView User-Agent, implements <code className="font-mono">onCreateWindow</code> fullscreen OAuth dialogs, and serves bundled assets over <code className="font-mono">https://appassets.androidplatform.net</code> via <code className="font-mono">WebViewAssetLoader</code>.
              </p>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border space-y-2.5 ${
                isDark ? 'bg-[#10131b] border-white/[0.07]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Push to GitHub Repository</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(gitCommands, 'git-cmd')}
                  className="text-[11px] font-bold text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedKey === 'git-cmd' ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="text-[11px] font-mono bg-slate-950 text-emerald-400 p-3 rounded-xl overflow-x-auto">
                {gitCommands}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Official Documentation Center */}
      <div
        className={`rounded-3xl p-5 sm:p-6 border ${
          isDark ? 'bg-[#151821] border-white/[0.08]' : 'bg-white border-slate-200/90 shadow-xs'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Project Documentation &amp; Architecture Guides
            </h2>
          </div>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-blue-500 hover:underline flex items-center gap-1"
          >
            <span>Open GitHub Repo</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {DOCUMENTATION_ITEMS.map(doc => (
            <div
              key={doc.id}
              className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition ${
                isDark
                  ? 'bg-[#10131b] border-white/[0.07] hover:border-white/[0.15]'
                  : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">{doc.title}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      isDark ? 'bg-white/[0.07] text-zinc-300' : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {doc.badge}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-blue-500">{doc.path}</div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  {doc.summary}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveDocModal(doc)}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isDark
                      ? 'bg-white/[0.08] hover:bg-white/[0.15] text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  Read Guide
                </button>
                <a
                  href={doc.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
                    isDark
                      ? 'border-white/15 text-zinc-300 hover:bg-white/10'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Open on GitHub"
                >
                  <span>GitHub</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* In-App Documentation Reader Modal */}
      {activeDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div
            className={`w-full max-w-2xl rounded-3xl border p-6 shadow-2xl max-h-[85vh] flex flex-col ${
              isDark ? 'bg-[#141822] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
              <div>
                <h3 className="text-base font-bold">{activeDocModal.title}</h3>
                <p className="text-xs font-mono text-blue-500 mt-0.5">{activeDocModal.path}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDocModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 flex-1 overflow-y-auto">
              <pre
                className={`text-xs font-mono whitespace-pre-wrap leading-relaxed p-4 rounded-2xl border ${
                  isDark
                    ? 'bg-[#0b0d13] border-white/10 text-zinc-200'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                {activeDocModal.contentPreview}
              </pre>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
              <a
                href={activeDocModal.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1.5"
              >
                <span>View Full File on GitHub ({activeDocModal.path})</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setActiveDocModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
