import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Sparkles,
  FileText,
  Globe,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Upload,
  RefreshCw,
  LogIn,
  Lock,
  Check,
} from 'lucide-react';
import {
  fetchSetupWizardState,
  completeSetupWizard,
  connectPersonalGmailViaPopupOrBackend,
  disconnectPersonalGmail,
  uploadMultiUserCV,
  syncLocalCVGalleryToBackend,
} from '../services/multiUserService';
import { signInWithGoogle } from '../services/firebase';
import { loadCVLibrary } from '../services/cvStorage';

interface FirstTimeSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

const COUNTRY_OPTIONS = [
  'United Kingdom',
  'Cyprus',
  'Malta',
  'Croatia',
  'Switzerland',
  'Austria',
  'Italy',
  'France',
  'Germany',
  'Netherlands',
  'Ireland',
  'Greece',
  'Spain',
  'Sweden',
  'Denmark',
  'United Arab Emirates',
];

const CATEGORY_OPTIONS = [
  'Bartender',
  'Barista',
  'Waiter',
  'Maintenance Electrician',
  'Plumber',
  'Hospitality & F&B',
  'Chef & Culinary',
  'Hotel Front Office',
];

const EMPLOYMENT_TYPE_OPTIONS = ['Full-Time', 'Seasonal', 'Visa Sponsored', 'Contract / Relocation'];

export const FirstTimeSetupWizard: React.FC<FirstTimeSetupWizardProps> = ({
  isOpen,
  onClose,
  onCompleted,
}) => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [wizardData, setWizardData] = useState<any>(null);

  // Step E form state
  const [headline, setHeadline] = useState('Hospitality & Technical Career Specialist');
  const [nationality, setNationality] = useState('');
  const [currentCountry, setCurrentCountry] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([
    'United Kingdom',
    'Cyprus',
    'Malta',
    'Croatia',
  ]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Bartender',
    'Barista',
    'Waiter',
  ]);
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useState<string[]>([
    'Full-Time',
    'Seasonal',
    'Visa Sponsored',
  ]);
  const [sponsorshipRequired, setSponsorshipRequired] = useState<boolean>(true);
  const [relocationSupport, setRelocationSupport] = useState<boolean>(true);

  const loadWizard = async () => {
    setLoading(true);
    try {
      const data = await fetchSetupWizardState();
      setWizardData(data);
      if (data?.profile) {
        setHeadline(data.profile.headline || 'Hospitality & Technical Career Specialist');
        setNationality(data.profile.nationality || '');
        setCurrentCountry(data.profile.currentCountry || '');
      }
      if (data?.preferences) {
        if (Array.isArray(data.preferences.preferredCountries) && data.preferences.preferredCountries.length > 0) {
          setSelectedCountries(data.preferences.preferredCountries);
        }
        if (Array.isArray(data.preferences.jobCategories) && data.preferences.jobCategories.length > 0) {
          setSelectedCategories(data.preferences.jobCategories);
        }
        if (Array.isArray(data.preferences.employmentTypes) && data.preferences.employmentTypes.length > 0) {
          setSelectedEmploymentTypes(data.preferences.employmentTypes);
        }
        if (typeof data.preferences.sponsorshipRequired === 'boolean') {
          setSponsorshipRequired(data.preferences.sponsorshipRequired);
        }
        if (typeof data.preferences.relocationSupport === 'boolean') {
          setRelocationSupport(data.preferences.relocationSupport);
        }
      }
    } catch {
      // Guest / not signed in yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWizard();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleItem = (list: string[], setList: (next: string[]) => void, value: string) => {
    if (list.includes(value)) {
      if (list.length > 1) {
        setList(list.filter(i => i !== value));
      }
    } else {
      setList([...list, value]);
    }
  };

  const handleGoogleSignInStep = async () => {
    setBusy('google');
    setNotice(null);
    try {
      const res = await signInWithGoogle();
      if (res?.user) {
        await loadWizard();
        setNotice({
          type: 'success',
          text: `Google identity verified as ${res.user.email}. Note: Gmail sending permission remains separate and optional.`,
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Google Sign-In failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleConnectGmailStep = async () => {
    setBusy('gmail-connect');
    setNotice(null);
    try {
      const res = await connectPersonalGmailViaPopupOrBackend();
      await loadWizard();
      setNotice({
        type: 'success',
        text: `Personal Gmail connected (${res.gmailAddress}) with minimum send-only scope (gmail.send).`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gmail connection was cancelled or failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnectGmailStep = async () => {
    setBusy('gmail-disconnect');
    setNotice(null);
    try {
      await disconnectPersonalGmail();
      await loadWizard();
      setNotice({ type: 'info', text: 'Personal Gmail disconnected and OAuth tokens revoked.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Failed to disconnect Gmail.' });
    } finally {
      setBusy(null);
    }
  };

  const handleSyncFromCVGallery = async () => {
    setBusy('cv-sync');
    setNotice(null);
    try {
      const library = loadCVLibrary() as any;
      const rawList: any[] = Array.isArray(library) ? library : library?.cvs || [];
      const defaultId = !Array.isArray(library) ? library?.defaultCvId : undefined;
      const validCvs = rawList
        .filter((c: any) => Boolean(c.pdfDataUrl || c.base64Data))
        .map((c: any, idx: number) => ({
          id: c.id,
          title: c.name || c.title || 'Professional CV',
          targetRole: c.targetRole || 'Hospitality',
          fileName: c.fileName || `${(c.name || 'CV').replace(/\s+/g, '_')}.pdf`,
          pdfBase64: c.pdfDataUrl || c.base64Data,
          isDefault: Boolean(c.isDefault) || (defaultId ? c.id === defaultId : idx === 0),
        }));

      if (validCvs.length === 0) {
        setNotice({
          type: 'info',
          text: 'No local PDFs found in CV Gallery yet. Use the Upload PDF CV button below to add your CV.',
        });
      } else {
        const res = await syncLocalCVGalleryToBackend(validCvs);
        await loadWizard();
        setNotice({
          type: 'success',
          text: `Synchronized ${res.syncedCount} CV(s) from CV Gallery single source of truth into your isolated workspace.`,
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'CV Gallery sync failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleUploadCVFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('cv-upload');
    setNotice(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read PDF file'));
        reader.readAsDataURL(file);
      });
      const title = file.name.replace(/\.pdf$/i, '');
      await uploadMultiUserCV({
        title,
        fileName: file.name,
        pdfBase64: base64,
        isDefault: true,
      });
      await loadWizard();
      setNotice({
        type: 'success',
        text: `Uploaded "${file.name}" to your isolated CV Gallery store.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'CV upload failed.' });
    } finally {
      setBusy(null);
      e.target.value = '';
    }
  };

  const handleFinishWizard = async () => {
    setBusy('finish');
    setNotice(null);
    try {
      await completeSetupWizard({
        headline,
        nationality,
        currentCountry,
        preferences: {
          preferredCountries: selectedCountries,
          jobCategories: selectedCategories,
          employmentTypes: selectedEmploymentTypes,
          sponsorshipRequired,
          relocationSupport,
        },
      });
      try {
        localStorage.setItem('zenvik_first_time_setup_completed_v1', 'true');
      } catch {}
      if (onCompleted) onCompleted();
      onClose();
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Failed to save setup wizard preferences.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-[#111520] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-emerald-600/10 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white">
                Guided Onboarding • Step {step} of 5
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Least-Privilege Permission Architecture
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-1">
              ZENVIK AGENT — First-Time User Setup Wizard
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Close Setup Wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-[#0c0f17] border-b border-slate-200/70 dark:border-slate-800/80 grid grid-cols-5 gap-2">
          {[
            { num: 1, label: 'A. Google Sign-In', badge: 'Required' },
            { num: 2, label: 'B. Personal Gmail', badge: 'Optional' },
            { num: 3, label: 'C. AI Services', badge: 'Backend' },
            { num: 4, label: 'D. CV Storage', badge: 'Feature' },
            { num: 5, label: 'E. Job Search', badge: 'Required' },
          ].map(item => (
            <button
              key={item.num}
              type="button"
              onClick={() => setStep(item.num)}
              className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                step === item.num
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300'
                  : step > item.num
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              <div className="text-[10px] font-bold truncate">{item.label}</div>
              <div className="text-[9px] uppercase tracking-wider opacity-75">{item.badge}</div>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[68vh] overflow-y-auto">
          {notice && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border ${
                notice.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                  : notice.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300'
                  : 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-500/40 text-blue-800 dark:text-blue-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice.text}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading setup wizard diagnostics...</div>
          ) : (
            <>
              {/* STEP 1: GOOGLE ACCOUNT SIGN-IN */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                          Required Permission • Identity Only
                        </span>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                          A. Google Account Sign-In &amp; Isolated Profile
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        wizardData?.steps?.googleAccount?.connected
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {wizardData?.steps?.googleAccount?.connected ? 'Connected' : 'Sign-In Available'}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Why this permission is requested:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Verifies your identity and creates an isolated user workspace (`userId`).</li>
                      <li>Protects your CVs, saved jobs, and application history so no other user can see them.</li>
                      <li>
                        <strong>Strict Separation Rule:</strong> Signing into ZENVIK AGENT does{' '}
                        <span className="underline">not</span> grant access to your Gmail inbox or send emails automatically.
                      </li>
                    </ul>
                  </div>

                  {wizardData?.steps?.googleAccount?.connected ? (
                    <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          Authenticated Identity Active
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                          {wizardData.steps.googleAccount.displayName} ({wizardData.steps.googleAccount.email})
                        </div>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGoogleSignInStep}
                      disabled={busy === 'google'}
                      className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>{busy === 'google' ? 'Signing in...' : 'Sign In with Google'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* STEP 2: PERSONAL GMAIL CONNECTION */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          Optional Permission • Feature-Specific (gmail.send)
                        </span>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                          B. Connect Personal Gmail for Direct Job Applications
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        wizardData?.steps?.gmailConnection?.connected
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {wizardData?.steps?.gmailConnection?.connected ? 'Gmail Connected' : 'Optional / Disconnected'}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Minimum OAuth Scope &amp; Security Guarantees:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>
                        Requests only <code className="font-mono text-blue-600 dark:text-blue-400">https://www.googleapis.com/auth/gmail.send</code>.
                      </li>
                      <li>Allows sending job applications with your selected PDF CV directly from your own Gmail address.</li>
                      <li>Never reads your private inbox, never collects your Gmail password, and encrypts OAuth tokens at rest with AES-256-GCM.</li>
                      <li>You can skip this step now and connect or disconnect Gmail anytime in Settings &rarr; Connected Services.</li>
                    </ul>
                  </div>

                  {wizardData?.steps?.gmailConnection?.connected ? (
                    <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          Connected Personal Sender: {wizardData.steps.gmailConnection.gmailAddress}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Scope: https://www.googleapis.com/auth/gmail.send
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDisconnectGmailStep}
                        disabled={busy === 'gmail-disconnect'}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        {busy === 'gmail-disconnect' ? 'Disconnecting...' : 'Disconnect Gmail'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleConnectGmailStep}
                        disabled={busy === 'gmail-connect'}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      >
                        <Mail className="w-4 h-4" />
                        <span>{busy === 'gmail-connect' ? 'Authorizing...' : 'Connect My Personal Gmail'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                      >
                        Skip Optional Gmail Step &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: AI SERVICES (BACKEND MANAGED) */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-violet-600/10 border border-violet-500/30 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                          Centrally Managed on Backend • Zero User Key Required
                        </span>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                          C. Google Gemini AI &amp; Multi-Provider Career Intelligence
                        </h3>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                      Backend Managed
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Google Gemini AI</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            wizardData?.steps?.aiServices?.geminiAvailable
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {wizardData?.steps?.aiServices?.geminiAvailable ? 'Available' : 'Standby / Fallback Active'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Active Model: <code className="font-mono">{wizardData?.steps?.aiServices?.model || 'gemini-4-hydrogen'}</code>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        Powers cover letter tailoring, CV optimization, AI interview assessment, and vacancy analysis via official server-side <code className="font-mono">@google/genai</code> SDK.
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Security &amp; Key Protection</span>
                        <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        AI API keys are managed centrally on the server via Google Cloud Secret Manager. Individual users never need to provide or enter a private Gemini API key.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: CV & DOCUMENT STORAGE */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-amber-600/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                          Feature-Specific Permission • CV Gallery Single Source of Truth
                        </span>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                          D. CV Gallery &amp; Isolated Document Storage
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        wizardData?.steps?.cvStorage?.active
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {wizardData?.steps?.cvStorage?.active
                        ? `Active (${wizardData.steps.cvStorage.cvCount} CV)`
                        : 'No CV Uploaded Yet'}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      How CV &amp; Document Storage works:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Your existing <strong>CV Gallery</strong> remains the single source of truth across all job application workflows.</li>
                      <li>ZENVIK never requests unrestricted device storage permissions; files are only accessed when you explicitly select a PDF through the upload interface.</li>
                      <li>Each user's CVs are strictly isolated by <code className="font-mono">userId</code>.</li>
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSyncFromCVGallery}
                      disabled={busy === 'cv-sync'}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${busy === 'cv-sync' ? 'animate-spin' : ''}`} />
                      <span>Sync Existing CV Gallery</span>
                    </button>

                    <label className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs flex items-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4 text-blue-600" />
                      <span>{busy === 'cv-upload' ? 'Uploading PDF...' : 'Upload PDF CV from Device'}</span>
                      <input type="file" accept="application/pdf,.pdf" onChange={handleUploadCVFile} className="hidden" />
                    </label>
                  </div>
                </div>
              )}

              {/* STEP 5: JOB SEARCH SETUP */}
              {step === 5 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        Career Preferences • Personalized Discovery
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                        E. Job Search &amp; Visa Sponsorship Preferences
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Professional Headline
                      </label>
                      <input
                        type="text"
                        value={headline}
                        onChange={e => setHeadline(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Nationality / Passport
                      </label>
                      <input
                        type="text"
                        value={nationality}
                        onChange={e => setNationality(e.target.value)}
                        placeholder="e.g. Bangladesh"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Current Location
                      </label>
                      <input
                        type="text"
                        value={currentCountry}
                        onChange={e => setCurrentCountry(e.target.value)}
                        placeholder="e.g. Cyprus"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                      Preferred Job Categories &amp; Professions
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_OPTIONS.map(cat => {
                        const active = selectedCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleItem(selectedCategories, setSelectedCategories, cat)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                              active
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {active && <Check className="w-3.5 h-3.5" />}
                            <span>{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                      Preferred Destination Countries
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COUNTRY_OPTIONS.map(c => {
                        const active = selectedCountries.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleItem(selectedCountries, setSelectedCountries, c)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                              active
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Prioritize Visa Sponsorship &amp; Work Permit Jobs
                      </span>
                      <input
                        type="checkbox"
                        checked={sponsorshipRequired}
                        onChange={e => setSponsorshipRequired(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </label>
                    <label className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Include Relocation / Staff Accommodation Roles
                      </span>
                      <input
                        type="checkbox"
                        checked={relocationSupport}
                        onChange={e => setRelocationSupport(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-[#0c0f17] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Remind Me Later
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Next Step</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinishWizard}
                disabled={busy === 'finish'}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busy === 'finish' ? 'Saving Preferences...' : 'Complete Setup & Save Preferences'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const FirstTimeSetupWizardModal = FirstTimeSetupWizard;

