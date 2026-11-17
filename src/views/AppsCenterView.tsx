import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Download,
  ExternalLink,
  Github,
  ShieldCheck,
  RefreshCw,
  Globe,
  Monitor,
  BookOpen,
  CheckCircle2,
  Copy,
  Package,
  ArrowUpRight,
  Wifi,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { CCDLogo } from '../components/CCDLogo';
import { useTheme } from '../context/ThemeContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

const REPOSITORY_URL = 'https://github.com/FazleRabbe121/ZENVIK-AGENT';
const ACTIONS_URL = `${REPOSITORY_URL}/actions/workflows/build-android-apk.yml`;
const DOCS_URL = `${REPOSITORY_URL}/tree/main/docs`;
const BENGALI_GUIDE_URL = `${REPOSITORY_URL}/blob/main/docs/INSTALLATION-BN.md`;
const APK_DOWNLOAD_URL = `${REPOSITORY_URL}/releases/download/android-latest/ZENVIK-AGENT-Android.apk`;
const PWA_URL = 'https://fazlerabbe121.github.io/ZENVIK-AGENT/';

export const AppsCenterView: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(standalone);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setIsInstalled(true);
      setInstallPrompt(null);
      return;
    }
    setShowInstallSteps(current => !current);
  };

  const copyRepository = async () => {
    try {
      await navigator.clipboard.writeText(REPOSITORY_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const panel = dark
    ? 'border-white/10 bg-[#191c24] text-zinc-100'
    : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-zinc-400' : 'text-slate-600';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-400/20 bg-gradient-to-br from-[#0b0d13] via-[#151b2a] to-[#102b2a] p-5 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> Apps & Installation Center
            </div>
            <div className="flex items-center gap-3">
              <CCDLogo size={58} mode="icon" forceDark />
              <div>
                <p className="text-2xl font-black tracking-tight sm:text-3xl">ZENVIK-AGENT</p>
                <p className="text-xs text-slate-300 sm:text-sm">AI Career & Employment Platform</p>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Install ZENVIK on Android or add the web app to your phone and desktop.
              Find the latest installer, setup steps, release information, and project documentation in one place.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={APK_DOWNLOAD_URL}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-500 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-900/20 transition hover:-translate-y-0.5 hover:brightness-105"
              >
                <Download className="h-4 w-4" /> Download Android APK
              </a>
              <button
                type="button"
                onClick={handlePwaInstall}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                {isInstalled ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Smartphone className="h-4 w-4" />}
                {isInstalled ? 'Web App Installed' : 'Install Web App'}
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Official project build</span>
              <span className="inline-flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5 text-sky-300" /> Internet required for cloud services</span>
              <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-amber-300" /> Build & release from GitHub</span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[230px]">
            <div className="rounded-[2.6rem] border-[7px] border-[#353a45] bg-[#05070b] p-2 shadow-[0_25px_70px_rgba(0,0,0,0.55)]">
              <div className="overflow-hidden rounded-[1.9rem] bg-[#0d111a]">
                <div className="flex h-6 items-center justify-between px-4 text-[8px] font-semibold text-slate-300">
                  <span>9:41</span><span>● ● ●  ▰</span>
                </div>
                <div className="flex flex-col items-center px-4 pb-5 pt-5">
                  <div className="mb-3 rounded-2xl border border-amber-300/25 bg-white p-2 shadow-lg shadow-amber-900/20">
                    <CCDLogo size={62} mode="icon" forceLight />
                  </div>
                  <p className="text-base font-black tracking-wide text-white">ZENVIK</p>
                  <p className="mt-1 text-center text-[8px] text-slate-400">AI Career & Employment Platform</p>
                  <div className="mt-5 w-full space-y-2">
                    <div className="h-12 rounded-xl border border-white/10 bg-white/[0.06] p-2">
                      <div className="h-1.5 w-1/2 rounded bg-amber-300/80" />
                      <div className="mt-2 h-1.5 w-4/5 rounded bg-white/15" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-14 rounded-xl border border-white/10 bg-emerald-400/10" />
                      <div className="h-14 rounded-xl border border-white/10 bg-sky-400/10" />
                    </div>
                    <div className="h-7 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500" />
                  </div>
                </div>
                <div className="mx-auto mb-2 h-1 w-16 rounded-full bg-slate-500/70" />
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] font-medium tracking-wide text-slate-400">MOBILE APP PREVIEW</p>
          </div>
        </div>
      </section>

      {showInstallSteps && (
        <section className={`rounded-2xl border p-4 sm:p-5 ${panel}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">Install on this device</h3>
            <button type="button" onClick={() => setShowInstallSteps(false)} className={`text-xs ${muted}`}>Close</button>
          </div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-500/5 p-3">
              <p className="font-semibold">Android · Chrome</p>
              <p className={`mt-1 text-xs leading-5 ${muted}`}>Open the live web app in Chrome, tap ⋮, then choose “Install app” or “Add to Home screen”. The wording can vary by browser.</p>
            </div>
            <div className="rounded-xl bg-slate-500/5 p-3">
              <p className="font-semibold">iPhone · Safari</p>
              <p className={`mt-1 text-xs leading-5 ${muted}`}>Open the web app in Safari, tap Share, choose “Add to Home Screen”, then confirm.</p>
            </div>
            <div className="rounded-xl bg-slate-500/5 p-3">
              <p className="font-semibold">Desktop · Chrome / Edge</p>
              <p className={`mt-1 text-xs leading-5 ${muted}`}>Open the web app and use the Install icon in the address bar, or browser menu → Install ZENVIK.</p>
            </div>
            <div className="rounded-xl bg-slate-500/5 p-3">
              <p className="font-semibold">Already installed?</p>
              <p className={`mt-1 text-xs leading-5 ${muted}`}>Close and reopen the installed web app after a website deployment to load the latest published version.</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <article className={`rounded-2xl border p-5 ${panel}`}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-500"><Smartphone className="h-5 w-5" /></div>
          <h3 className="font-bold">Android APK</h3>
          <p className={`mt-2 min-h-[60px] text-xs leading-5 ${muted}`}>Install the packaged Android application. Download the current APK and allow installation from your browser or file manager when Android asks.</p>
          <a href={APK_DOWNLOAD_URL} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-500 hover:underline">Download latest APK <ArrowUpRight className="h-3.5 w-3.5" /></a>
          <p className={`mt-2 text-[10px] ${muted}`}>Release file: ZENVIK-AGENT-Android.apk</p>
        </article>

        <article className={`rounded-2xl border p-5 ${panel}`}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-500"><Globe className="h-5 w-5" /></div>
          <h3 className="font-bold">Installable Web App</h3>
          <p className={`mt-2 min-h-[60px] text-xs leading-5 ${muted}`}>Add ZENVIK to the home screen. It opens in an app-like window and receives website updates after the next reload.</p>
          <a href={PWA_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-500 hover:underline">Open web app <ExternalLink className="h-3.5 w-3.5" /></a>
          <button type="button" onClick={handlePwaInstall} className="mt-2 block text-xs font-semibold text-emerald-500 hover:underline">{installPrompt ? 'Install now' : 'Show install steps'}</button>
        </article>

        <article className={`rounded-2xl border p-5 ${panel}`}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-500"><Monitor className="h-5 w-5" /></div>
          <h3 className="font-bold">Desktop Browser</h3>
          <p className={`mt-2 min-h-[60px] text-xs leading-5 ${muted}`}>Use ZENVIK in a desktop browser or install it from Chrome/Edge as a desktop web app.</p>
          <a href={PWA_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-sky-500 hover:underline">Open desktop version <ExternalLink className="h-3.5 w-3.5" /></a>
        </article>
      </section>

      <section className={`rounded-2xl border p-5 sm:p-6 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${muted}`}>Application information</p>
            <h3 className="mt-1 text-lg font-bold">Version & package details</h3>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-500">Android build pipeline enabled</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-500/5 p-3"><p className={`text-[10px] ${muted}`}>App version</p><p className="mt-1 font-mono text-sm font-bold">1.0.0</p></div>
          <div className="rounded-xl bg-slate-500/5 p-3"><p className={`text-[10px] ${muted}`}>Android package</p><p className="mt-1 break-all font-mono text-xs font-bold">com.ccd.abetteryou</p><p className={`mt-1 text-[10px] ${muted}`}>Debug APK uses .debug suffix</p></div>
          <div className="rounded-xl bg-slate-500/5 p-3"><p className={`text-[10px] ${muted}`}>Minimum Android</p><p className="mt-1 font-mono text-sm font-bold">Android 8.0 (API 26)</p></div>
        </div>
      </section>

      <section className={`rounded-2xl border p-5 sm:p-6 ${panel}`}>
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-emerald-500" /><h3 className="text-lg font-bold">How updates work</h3></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="font-semibold text-emerald-500">Web App / PWA</p>
            <p className={`mt-2 text-xs leading-5 ${muted}`}>A successful GitHub Pages deployment publishes the latest website files. Reopen or refresh the installed web app while online to receive the new website version.</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="font-semibold text-amber-500">Android APK</p>
            <p className={`mt-2 text-xs leading-5 ${muted}`}>The APK contains a bundled copy of the web files. After a code update, GitHub builds a new APK; download and install that APK to update the native app. It does not silently self-update.</p>
          </div>
        </div>
      </section>

      <section className={`rounded-2xl border p-5 sm:p-6 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-sky-500" /><h3 className="text-lg font-bold">Documentation & source</h3></div>
          <button type="button" onClick={copyRepository} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${dark ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}><Copy className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy repository URL'}</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a href={BENGALI_GUIDE_URL} target="_blank" rel="noreferrer" className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs font-bold hover:bg-sky-500/10">বাংলা ইনস্টলেশন গাইড <ExternalLink className="ml-1 inline h-3 w-3" /></a>
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs font-bold hover:bg-sky-500/10">All project documentation <ExternalLink className="ml-1 inline h-3 w-3" /></a>
          <a href={ACTIONS_URL} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs font-bold hover:bg-emerald-500/10">Build history & APK artifacts <ExternalLink className="ml-1 inline h-3 w-3" /></a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-3 text-xs font-bold hover:bg-slate-500/10">GitHub source repository <Github className="ml-1 inline h-3 w-3" /></a>
        </div>
        <p className={`mt-4 text-[11px] leading-5 ${muted}`}>The desktop installer is not a separate native Windows package at this time. Use the browser version or install it as a Chrome/Edge web app.</p>
      </section>

      <p className={`flex items-start gap-2 px-1 text-[11px] leading-5 ${muted}`}><Package className="mt-0.5 h-4 w-4 shrink-0" /> Internet access is required for Google sign-in, cloud data, hosted APIs, and other online services. A bundled APK does not include a separate hosted backend server.</p>
    </div>
  );
};
