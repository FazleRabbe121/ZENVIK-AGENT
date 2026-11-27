/**
 * Global runtime backend URL bridge for Android WebView (WebViewAssetLoader / Capacitor)
 * and static deployments (GitHub Pages).
 *
 * When the app is loaded directly from a live full-stack server (localhost:3000, *.run.app,
 * or custom Express host), relative `/api/*` requests stay same-origin with zero changes.
 *
 * When the app is loaded from bundled Android assets (`https://appassets.androidplatform.net`,
 * `capacitor://localhost`, `https://localhost`) or GitHub Pages (`*.github.io`), relative
 * `/api/*` and `/healthz` requests are transparently forwarded to the configured Cloud Run
 * backend URL so every backend feature (AI, English Tutor, Gmail, Job Discovery, Interview
 * Center, Multi-User SaaS) works identically to the live hosted app.
 */

const DEFAULT_HOSTED_BACKEND_URL =
  'https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app';

const STORAGE_OVERRIDE_KEY = 'zenvik_backend_url_override';

declare global {
  interface Window {
    __ZENVIK_API_BASE__?: string;
    __ZENVIK_FETCH_PATCHED__?: boolean;
  }
}

function normalizeBaseUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\/[^/\s]+/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function isBundledOrStaticHost(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const { protocol, hostname } = window.location;
  const host = hostname.toLowerCase();

  if (protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'file:') {
    return true;
  }
  if (host === 'appassets.androidplatform.net') {
    return true;
  }
  if (host.endsWith('.github.io')) {
    return true;
  }
  // Capacitor Android WebView with androidScheme: 'https' serves from https://localhost (no port)
  if (protocol === 'https:' && host === 'localhost' && !window.location.port) {
    return true;
  }
  return false;
}

export function getActiveBackendBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  // Same-origin full-stack host (e.g. Cloud Run *.run.app, localhost:3000, custom server)
  if (!isBundledOrStaticHost()) {
    return '';
  }

  // 1. Optional runtime override saved in localStorage
  try {
    const override = normalizeBaseUrl(localStorage.getItem(STORAGE_OVERRIDE_KEY));
    if (override) return override;
  } catch {
    // ignore storage access errors
  }

  // 2. Native Android MainActivity.kt injected backend URL
  const injected = normalizeBaseUrl(window.__ZENVIK_API_BASE__);
  if (injected) return injected;

  // 3. Vite build-time env var injected by GitHub Actions
  const envUrl = normalizeBaseUrl(
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_BACKEND_URL
  );
  if (envUrl) return envUrl;

  // 4. Default hosted Cloud Run backend URL
  return DEFAULT_HOSTED_BACKEND_URL;
}

export function setBackendBaseUrlOverride(url: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = normalizeBaseUrl(url);
    if (clean) {
      localStorage.setItem(STORAGE_OVERRIDE_KEY, clean);
    } else {
      localStorage.removeItem(STORAGE_OVERRIDE_KEY);
    }
  } catch {
    // ignore storage access errors
  }
}

export function resolveBackendUrl(inputUrl: string): string {
  if (!inputUrl.startsWith('/')) return inputUrl;
  const needsBackend =
    inputUrl === '/healthz' ||
    inputUrl.startsWith('/api/') ||
    inputUrl === '/api' ||
    inputUrl.startsWith('/auth/callback');
  if (!needsBackend) return inputUrl;

  const base = getActiveBackendBaseUrl();
  if (!base) return inputUrl;
  return `${base}${inputUrl}`;
}

export function installBackendFetchBridge(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__ZENVIK_FETCH_PATCHED__) return;

  // On live full-stack hosts (Cloud Run, localhost:3000, AI Studio preview), relative /api/*
  // calls already target the same origin — never touch window.fetch (which may be getter-only).
  if (!isBundledOrStaticHost()) {
    window.__ZENVIK_FETCH_PATCHED__ = true;
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  const patchedFetch: typeof window.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    try {
      if (typeof input === 'string') {
        const rewritten = resolveBackendUrl(input);
        if (rewritten !== input) {
          return nativeFetch(rewritten, init);
        }
      } else if (input instanceof URL) {
        if (input.origin === window.location.origin) {
          const rel = `${input.pathname}${input.search}${input.hash}`;
          const rewritten = resolveBackendUrl(rel);
          if (rewritten !== rel) {
            return nativeFetch(rewritten, init);
          }
        }
      } else if (typeof Request !== 'undefined' && input instanceof Request) {
        const parsed = new URL(input.url, window.location.href);
        if (parsed.origin === window.location.origin) {
          const rel = `${parsed.pathname}${parsed.search}${parsed.hash}`;
          const rewritten = resolveBackendUrl(rel);
          if (rewritten !== rel) {
            return nativeFetch(new Request(rewritten, input), init);
          }
        }
      }
    } catch {
      // Fall through to nativeFetch on any URL parsing edge case
    }
    return nativeFetch(input, init);
  };

  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (desc && !desc.writable && desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch,
        writable: true,
        configurable: true,
        enumerable: desc.enumerable ?? true,
      });
    } else if (!desc || desc.writable) {
      window.fetch = patchedFetch;
    } else {
      Object.defineProperty(globalThis, 'fetch', {
        value: patchedFetch,
        writable: true,
        configurable: true,
      });
    }
    window.__ZENVIK_FETCH_PATCHED__ = true;
  } catch {
    // Some locked-down environments make window.fetch non-configurable; fail gracefully without crashing
    window.__ZENVIK_FETCH_PATCHED__ = true;
  }
}

// Install immediately on module load
installBackendFetchBridge();
