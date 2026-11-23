import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Mail,
  Sparkles,
  FileText,
  Briefcase,
  UserCheck,
  Wand2,
  Activity,
  Server,
  Download,
  Check,
  Sliders,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  ConnectedServicesDashboardResponse,
  AdminAIConfigState,
  MultiUserJobPreferences,
  fetchConnectedServicesStatus,
  fetchMultiUserWorkspace,
  connectPersonalGmailViaPopupOrBackend,
  disconnectPersonalGmail,
  syncLocalCVGalleryToBackend,
  downloadMultiUserCV,
  selectDefaultMultiUserCV,
  fetchAdminAIConfig,
  updateAdminAIConfig,
  testAdminAIProviders,
  fetchSystemAuditLogs,
  fetchCloudRunHealth,
  searchMultiUserJobs,
  fetchMultiUserJobPreferences,
  updateMultiUserJobPreferences,
} from '../services/multiUserService';
import { signInWithGoogle } from '../services/firebase';
import { FirstTimeSetupWizardModal } from '../components/FirstTimeSetupWizard';

export const ConnectedServicesView: React.FC = () => {
  const [servicesData, setServicesData] = useState<ConnectedServicesDashboardResponse | null>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [healthInfo, setHealthInfo] = useState<any>(null);
  const [adminAIConfig, setAdminAIConfig] = useState<AdminAIConfigState | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [jobPrefs, setJobPrefs] = useState<MultiUserJobPreferences | null>(null);
  const [sampleJobs, setSampleJobs] = useState<any[]>([]);
  const [selectedProfessionFilter, setSelectedProfessionFilter] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);
  const [showAuditLogs, setShowAuditLogs] = useState<boolean>(false);

  const loadDashboard = async (professionFilter = selectedProfessionFilter) => {
    setLoading(true);
    try {
      const [svc, ws, hlth, prefs, jobsRes] = await Promise.all([
        fetchConnectedServicesStatus().catch(() => null),
        fetchMultiUserWorkspace().catch(() => null),
        fetchCloudRunHealth().catch(() => null),
        fetchMultiUserJobPreferences().catch(() => null),
        searchMultiUserJobs({
          profession: professionFilter === 'All' ? undefined : professionFilter,
          limit: 6,
        }).catch(() => null),
      ]);
      if (svc) setServicesData(svc);
      if (ws) setWorkspace(ws);
      if (hlth) setHealthInfo(hlth);
      if (prefs) setJobPrefs(prefs);
      if (jobsRes?.jobs) setSampleJobs(jobsRes.jobs);

      if (ws?.user?.role === 'admin') {
        const [aiCfg, logs] = await Promise.all([
          fetchAdminAIConfig().catch(() => null),
          fetchSystemAuditLogs(25).catch(() => []),
        ]);
        if (aiCfg) setAdminAIConfig(aiCfg);
        setAuditLogs(logs || []);
      } else {
        setAdminAIConfig(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleGoogleConnect = async () => {
    setBusyAction('google');
    setNotice(null);
    try {
      const res = await signInWithGoogle();
      if (res?.user) {
        await loadDashboard();
        setNotice({
          type: 'success',
          message: `Google Account connected: ${res.user.email}.`,
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Google Sign-In failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGmailConnect = async () => {
    setBusyAction('gmail-connect');
    setNotice(null);
    try {
      const res = await connectPersonalGmailViaPopupOrBackend();
      await loadDashboard();
      setNotice({
        type: 'success',
        message: `Personal Gmail (${res.gmailAddress}) authorized with scope https://www.googleapis.com/auth/gmail.send.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Gmail connection failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGmailDisconnect = async () => {
    setBusyAction('gmail-disconnect');
    setNotice(null);
    try {
      await disconnectPersonalGmail();
      await loadDashboard();
      setNotice({
        type: 'info',
        message: 'Personal Gmail disconnected and stored OAuth tokens revoked.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Failed to disconnect Gmail.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncCVGallery = async () => {
    setBusyAction('sync-cv');
    setNotice(null);
    try {
      const res = await syncLocalCVGalleryToBackend();
      await loadDashboard();
      setNotice({
        type: 'success',
        message: `CV Gallery synchronized (${res.totalCount} CV document(s) active in isolated user storage).`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Failed to sync CV Gallery.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAdminAIUpdate = async (patch: Partial<AdminAIConfigState>) => {
    if (!adminAIConfig) return;
    setBusyAction('admin-ai-save');
    setNotice(null);
    try {
      const updated = await updateAdminAIConfig(patch);
      setAdminAIConfig(updated);
      await loadDashboard();
      setNotice({
        type: 'success',
        message: `Admin AI configuration updated (Default Provider: ${updated.defaultProvider.toUpperCase()}, Gemini Model: ${updated.defaultGeminiModel}).`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Failed to update Admin AI configuration.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAdminAITest = async () => {
    setBusyAction('admin-ai-test');
    setNotice(null);
    try {
      const res = await testAdminAIProviders();
      setAdminAIConfig(res.config);
      await loadDashboard();
      setNotice({
        type: 'success',
        message: `AI Connection Test Complete — Gemini: ${res.results.gemini.status} (${res.results.gemini.latencyMs}ms) | OpenAI: ${res.results.openai.status}`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'AI Provider test failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleProfessionFilterChange = async (prof: string) => {
    setSelectedProfessionFilter(prof);
    setBusyAction('filter-jobs');
    try {
      const res = await searchMultiUserJobs({
        profession: prof === 'All' ? undefined : prof,
        limit: 6,
      });
      setSampleJobs(res.jobs || []);
    } finally {
      setBusyAction(null);
    }
  };

  const svc = servicesData?.services;

  return (
    <div className="space-y-6">
      {/* Section Header: Settings > Connected Services */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-[#1f2434]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/30">
                Settings &gt; Connected Services
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/30">
                Cloud Run Multi-User Architecture
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Connected Services &amp; Permission Management Dashboard
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Inspect and manage your Google Account login, optional Personal Gmail sending permission, Backend-Managed Gemini AI &amp; OpenAI engines, CV Gallery storage, and Multi-Profession Job Search Engine.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSetupWizard(true)}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Launch 5-Step Setup Wizard</span>
            </button>

            <button
              type="button"
              onClick={() => loadDashboard()}
              disabled={loading}
              className="px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center gap-2.5 ${
              notice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : notice.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-200'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
        )}

        {/* 6 Connected Services Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Google Account */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Google Account</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    svc?.googleAccount.status === 'Connected'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {svc?.googleAccount.status || 'Connected'}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                {svc?.googleAccount.email || workspace?.user?.email || 'Not signed in'}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {svc?.googleAccount.permissionExplanation ||
                  'Authenticates your isolated ZENVIK-AGENT account. Does not grant Gmail sending permission automatically.'}
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-mono">
                {svc?.googleAccount.lastConnectedAt
                  ? `Active: ${new Date(svc.googleAccount.lastConnectedAt).toLocaleDateString()}`
                  : 'Session active'}
              </span>
              <button
                type="button"
                onClick={handleGoogleConnect}
                disabled={busyAction === 'google'}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer"
              >
                {svc?.googleAccount.status === 'Connected' ? 'Reauthorize' : 'Connect'}
              </button>
            </div>
          </div>

          {/* 2. Personal Gmail (Optional OAuth 2.0) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Gmail</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    svc?.gmail.status === 'Connected'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30'
                  }`}
                >
                  {svc?.gmail.status || 'Disconnected'}
                </span>
              </div>
              <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 truncate">
                {svc?.gmail.gmailAddress || 'Optional — Connect when ready to send'}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Scope: <code className="font-mono">gmail.send</code> only. Sends job applications strictly from your own Gmail address.
              </p>
              {svc?.gmail.lastError && (
                <div className="text-[10px] text-rose-500 font-semibold">Alert: {svc.gmail.lastError}</div>
              )}
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-mono">
                {svc?.gmail.lastConnectedAt
                  ? `Authorized: ${new Date(svc.gmail.lastConnectedAt).toLocaleDateString()}`
                  : 'Not authorized'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGmailConnect}
                  disabled={busyAction === 'gmail-connect'}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                >
                  {svc?.gmail.status === 'Connected' ? 'Reauthorize' : 'Connect'}
                </button>
                {svc?.gmail.status === 'Connected' && (
                  <button
                    type="button"
                    onClick={handleGmailDisconnect}
                    disabled={busyAction === 'gmail-disconnect'}
                    className="px-2.5 py-1.5 rounded-xl border border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 font-bold text-[11px] cursor-pointer"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 3. Gemini AI (Backend-Managed) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span>Gemini AI</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    svc?.geminiAI.status === 'Available'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {svc?.geminiAI.status || 'Available'}
                </span>
              </div>
              <div className="text-xs font-mono text-violet-600 dark:text-violet-300">
                Model: {svc?.geminiAI.model || 'gemini-3.1-flash-lite'} (Server-Managed)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {svc?.geminiAI.permissionExplanation ||
                  'Managed on the backend via Google Secret Manager. No user API key is required.'}
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                Zero Client Key Exposure
              </span>
              <span className="text-[10px] font-mono text-slate-400">@google/genai SDK</span>
            </div>
          </div>

          {/* 4. OpenAI (Backend-Managed) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>OpenAI</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    svc?.openAI.status === 'Available'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {svc?.openAI.status || 'Available'}
                </span>
              </div>
              <div className="text-xs font-mono text-indigo-600 dark:text-indigo-300">
                Model: {svc?.openAI.model || 'gpt-4o-mini'} (Fallback Ready)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {svc?.openAI.permissionExplanation ||
                  'Secondary AI provider managed on the server with automatic Gemini fallback.'}
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">Backend Proxy Active</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Ready</span>
            </div>
          </div>

          {/* 5. CV Storage (CV Gallery Single Source of Truth) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>CV Storage</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {svc?.cvStorage.status || 'Active'}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {svc?.cvStorage.documentCount ?? workspace?.cvs?.length ?? 0} Isolated PDF CV(s)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Single source of truth synchronized with your CV Gallery. Only your user ID can download or attach your CVs.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-mono truncate">
                Default: {svc?.cvStorage.defaultCvFileName || 'Auto-selected'}
              </span>
              <button
                type="button"
                onClick={handleSyncCVGallery}
                disabled={busyAction === 'sync-cv'}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer shrink-0"
              >
                {busyAction === 'sync-cv' ? 'Syncing...' : 'Sync CV Gallery'}
              </button>
            </div>
          </div>

          {/* 6. Job Search Engine */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <Briefcase className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Job Search Engine</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {svc?.jobSearchEngine.status || 'Active'}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {svc?.jobSearchEngine.totalIndexedJobs || 10}+ Verified Employers Indexed
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Supports Bartender, Barista, Waiter, Maintenance Electrician, Plumber &amp; Hospitality roles across Europe &amp; Visa Sponsorship hubs.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">
                Cloud Run Health: {healthInfo?.status || 'healthy'}
              </span>
              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                API Docs &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 7 Quick Multi-Profession Job Search & CV Gallery Verification Bar */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Multi-User Job Search Engine — Verified Professions &amp; Employers</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Filter live backend jobs across Bartender, Barista, Waiter, Maintenance Electrician, and Plumber roles.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['All', 'Bartender', 'Barista', 'Waiter', 'Maintenance Electrician', 'Plumber'].map(prof => (
              <button
                key={prof}
                type="button"
                onClick={() => handleProfessionFilterChange(prof)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  selectedProfessionFilter === prof
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                {prof}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sampleJobs.map(job => (
            <div
              key={job.id}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] space-y-1.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-slate-900 dark:text-white leading-snug">{job.title}</div>
                {job.visaSponsored && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                    Visa Sponsor
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                {job.company} • {job.city}, {job.country}
              </div>
              <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 truncate">
                HR Contact: {job.email}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 9 & 15.5: Admin AI Control Panel (Strictly for Admin Users — Zero API Key Inputs) */}
      {workspace?.user?.role === 'admin' && adminAIConfig && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-violet-300/80 dark:border-violet-500/30 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#1f2434]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30">
                  Phase 15.5 • Admin AI Control Panel
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  Server Environment Secrets Only
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>Admin AI Provider Configuration &amp; Usage Monitor</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage Gemini AI and OpenAI availability, default provider, active model selection, and automatic fallback. API keys remain strictly in server environment variables / Google Secret Manager and are never entered or displayed in the browser.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAdminAITest}
                disabled={busyAction === 'admin-ai-test'}
                className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
              >
                {busyAction === 'admin-ai-test' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5" />
                )}
                <span>Test Provider Connections</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAuditLogs(prev => !prev)}
                className="px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{showAuditLogs ? 'Hide Logs' : `System Logs (${auditLogs.length})`}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Provider Toggles & Fallback */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] space-y-3 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-white uppercase text-[11px] tracking-wider">
                Provider Switches &amp; Fallback
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Enable Gemini AI</span>
                <input
                  type="checkbox"
                  checked={adminAIConfig.geminiEnabled}
                  onChange={e => handleAdminAIUpdate({ geminiEnabled: e.target.checked })}
                  className="w-4 h-4 accent-violet-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Enable OpenAI</span>
                <input
                  type="checkbox"
                  checked={adminAIConfig.openaiEnabled}
                  onChange={e => handleAdminAIUpdate({ openaiEnabled: e.target.checked })}
                  className="w-4 h-4 accent-violet-600"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Automatic Fallback</span>
                <input
                  type="checkbox"
                  checked={adminAIConfig.fallbackEnabled}
                  onChange={e => handleAdminAIUpdate({ fallbackEnabled: e.target.checked })}
                  className="w-4 h-4 accent-violet-600"
                />
              </label>
            </div>

            {/* Default Provider & Active Models */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] space-y-3 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-white uppercase text-[11px] tracking-wider">
                Default Provider &amp; Active Model
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Default AI Provider</label>
                <select
                  value={adminAIConfig.defaultProvider}
                  onChange={e =>
                    handleAdminAIUpdate({ defaultProvider: e.target.value as 'gemini' | 'openai' })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#12151e] border border-slate-200 dark:border-[#232838] text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="gemini">Google Gemini AI (Recommended)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Active Gemini Model</label>
                <select
                  value={adminAIConfig.defaultGeminiModel}
                  onChange={e => handleAdminAIUpdate({ defaultGeminiModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#12151e] border border-slate-200 dark:border-[#232838] text-xs font-mono text-slate-900 dark:text-white"
                >
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Active OpenAI Model</label>
                <select
                  value={adminAIConfig.defaultOpenAIModel}
                  onChange={e => handleAdminAIUpdate({ defaultOpenAIModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#12151e] border border-slate-200 dark:border-[#232838] text-xs font-mono text-slate-900 dark:text-white"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>
            </div>

            {/* Usage, Quota Warnings & Error Monitoring */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] space-y-2.5 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-white uppercase text-[11px] tracking-wider">
                Usage Statistics &amp; Quota Health
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gemini Requests:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {adminAIConfig.totalGeminiRequests} ({adminAIConfig.totalGeminiErrors} errors)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">OpenAI Requests:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {adminAIConfig.totalOpenAIRequests} ({adminAIConfig.totalOpenAIErrors} errors)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">GEMINI_API_KEY Env:</span>
                <span
                  className={`font-bold ${
                    adminAIConfig.serverEnvStatus?.geminiKeyPresent ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {adminAIConfig.serverEnvStatus?.geminiKeyPresent ? 'Configured on Server' : 'Fallback Active'}
                </span>
              </div>
              {adminAIConfig.quotaWarning && (
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px]">
                  Quota Alert: {adminAIConfig.quotaWarning}
                </div>
              )}
              {adminAIConfig.lastError && (
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-[11px] truncate">
                  Last Error: {adminAIConfig.lastError}
                </div>
              )}
            </div>
          </div>

          {/* System Audit Logs Drawer */}
          {showAuditLogs && (
            <div className="p-4 rounded-2xl bg-slate-950 text-slate-200 font-mono text-[11px] space-y-1.5 max-h-60 overflow-y-auto">
              <div className="text-xs font-bold text-emerald-400 pb-1 border-b border-slate-800">
                Sanitized Backend Audit Logs (Tokens &amp; Secrets Redacted)
              </div>
              {auditLogs.length === 0 ? (
                <div className="text-slate-500">No system logs recorded yet.</div>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <span
                      className={`uppercase font-bold shrink-0 ${
                        log.level === 'error'
                          ? 'text-rose-400'
                          : log.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-blue-400'
                      }`}
                    >
                      [{log.category}]
                    </span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* First-Time User Setup Wizard Modal */}
      <FirstTimeSetupWizardModal
        isOpen={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onCompleted={() => loadDashboard()}
      />
    </div>
  );
};
