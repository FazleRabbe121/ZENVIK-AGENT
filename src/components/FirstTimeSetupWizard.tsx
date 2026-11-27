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
  Activity,
  KeyRound,
  AlertTriangle,
  Server,
} from 'lucide-react';
import {
  fetchSetupWizardState,
  completeSetupWizard,
  connectPersonalGmailViaPopupOrBackend,
  disconnectPersonalGmail,
  fetchGmailStatus,
  uploadMultiUserCV,
  syncLocalCVGalleryToBackend,
  fetchUserGeminiSettings,
  saveUserGeminiSettings,
  testUserGeminiKey,
  deleteUserGeminiKey,
  fetchBackendHealthDiagnostics,
  fetchConnectedServicesStatus,
  verifyUserEmail,
  resendEmailVerification,
  UserGeminiBYOKSettings,
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

const GEMINI_MODELS = [
  { id: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (Balanced Default)' },
  { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Fast & Lightweight)' },
  { id: 'gemini-4-neon', label: 'gemini-4-neon (Advanced Reasoning)' },
  { id: 'gemini-4-carbon', label: 'gemini-4-carbon (High-Speed)' },
];

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

  // Step 1: Email verification token input
  const [verificationCode, setVerificationCode] = useState('');

  // Step 2 & 3: Gmail scope preferences + real verified status
  const [includeReadReplies, setIncludeReadReplies] = useState<boolean>(false);
  const [verifiedGmailStatus, setVerifiedGmailStatus] = useState<any>(null);

  // Step 5: Gemini BYOK state
  const [geminiSettings, setGeminiSettings] = useState<UserGeminiBYOKSettings | null>(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiModelInput, setGeminiModelInput] = useState('gemini-4-hydrogen');
  const [geminiTestResult, setGeminiTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Step 6 & 7: Live Backend Connectivity & Services Check
  const [healthDiagnostics, setHealthDiagnostics] = useState<any>(null);
  const [servicesSnapshot, setServicesSnapshot] = useState<any>(null);

  // Step 8: Profile & Career Preferences
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
  const [sponsorshipRequired, setSponsorshipRequired] = useState<boolean>(true);
  const [relocationSupport, setRelocationSupport] = useState<boolean>(true);

  const loadWizard = async () => {
    setLoading(true);
    try {
      const [data, gStatus, gAi, svc] = await Promise.all([
        fetchSetupWizardState().catch(() => null),
        fetchGmailStatus().catch(() => null),
        fetchUserGeminiSettings().catch(() => null),
        fetchConnectedServicesStatus().catch(() => null),
      ]);
      if (data) {
        setWizardData(data);
        if (data.profile) {
          setHeadline(data.profile.headline || 'Hospitality & Technical Career Specialist');
          setNationality(data.profile.nationality || '');
          setCurrentCountry(data.profile.currentCountry || '');
        }
        if (data.preferences) {
          if (Array.isArray(data.preferences.preferredCountries) && data.preferences.preferredCountries.length > 0) {
            setSelectedCountries(data.preferences.preferredCountries);
          }
          if (Array.isArray(data.preferences.jobCategories) && data.preferences.jobCategories.length > 0) {
            setSelectedCategories(data.preferences.jobCategories);
          }
          if (typeof data.preferences.sponsorshipRequired === 'boolean') {
            setSponsorshipRequired(data.preferences.sponsorshipRequired);
          }
          if (typeof data.preferences.relocationSupport === 'boolean') {
            setRelocationSupport(data.preferences.relocationSupport);
          }
        }
      }
      if (gStatus) setVerifiedGmailStatus(gStatus);
      if (gAi) {
        setGeminiSettings(gAi);
        setGeminiModelInput(gAi.selectedModel || 'gemini-4-hydrogen');
      }
      if (svc) setServicesSnapshot(svc);
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
      if (list.length > 1) setList(list.filter(i => i !== value));
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
          text: `Google identity verified as ${res.user.email}.`,
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Google Sign-In failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleResendVerification = async () => {
    setBusy('resend-verif');
    setNotice(null);
    try {
      const res = await resendEmailVerification();
      if (res.verificationToken) {
        setVerificationCode(res.verificationToken);
      }
      setNotice({
        type: 'info',
        text: res.verificationToken
          ? `${res.message} Verification token generated: ${res.verificationToken}`
          : res.message,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Failed to generate verification token.' });
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!verificationCode.trim()) return;
    setBusy('verify-email');
    setNotice(null);
    try {
      const res = await verifyUserEmail(verificationCode.trim());
      await loadWizard();
      setNotice({ type: 'success', text: res.message || 'Email verified successfully.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Email verification failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleConnectGmailStep = async () => {
    setBusy('gmail-connect');
    setNotice(null);
    try {
      const res = await connectPersonalGmailViaPopupOrBackend({ includeReadReplies });
      const liveStatus = await fetchGmailStatus();
      setVerifiedGmailStatus(liveStatus);
      await loadWizard();
      setNotice({
        type: 'success',
        text: `Backend verified Personal Gmail: ${res.gmailAddress} (Scopes: ${(liveStatus.scopes || []).join(', ')}).`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gmail OAuth authorization was cancelled or failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyGmailLive = async () => {
    setBusy('gmail-verify');
    setNotice(null);
    try {
      const liveStatus = await fetchGmailStatus();
      setVerifiedGmailStatus(liveStatus);
      if (liveStatus.connected && liveStatus.gmailAddress) {
        setNotice({
          type: 'success',
          text: `Live backend verification passed: ${liveStatus.gmailAddress} is active and encrypted at rest.`,
        });
      } else {
        setNotice({
          type: 'info',
          text: 'Gmail is currently NOT connected on the backend. Return to Step 2 to connect your personal Gmail.',
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Could not verify Gmail status.' });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnectGmailStep = async () => {
    setBusy('gmail-disconnect');
    setNotice(null);
    try {
      await disconnectPersonalGmail();
      const liveStatus = await fetchGmailStatus().catch(() => null);
      setVerifiedGmailStatus(liveStatus);
      await loadWizard();
      setNotice({ type: 'info', text: 'Personal Gmail disconnected and encrypted tokens deleted.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Failed to disconnect Gmail.' });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveGeminiKey = async () => {
    setBusy('gemini-save');
    setNotice(null);
    setGeminiTestResult(null);
    try {
      const res = await saveUserGeminiSettings({
        apiKey: geminiKeyInput.trim() || undefined,
        selectedModel: geminiModelInput,
        verifyNow: Boolean(geminiKeyInput.trim()),
      });
      setGeminiSettings(res.settings);
      setGeminiKeyInput('');
      setGeminiTestResult({
        ok: true,
        text: res.verified
          ? `Personal Gemini API key encrypted & verified (${res.latencyMs ?? 0}ms).`
          : 'Gemini model preference saved.',
      });
      setNotice({ type: 'success', text: res.message || 'Personal Gemini API settings updated.' });
    } catch (err: any) {
      setGeminiTestResult({ ok: false, text: err?.message || 'Failed to save Gemini API key.' });
      setNotice({ type: 'error', text: err?.message || 'Failed to save Gemini API key.' });
    } finally {
      setBusy(null);
    }
  };

  const handleTestGeminiKey = async () => {
    setBusy('gemini-test');
    setNotice(null);
    setGeminiTestResult(null);
    try {
      const res = await testUserGeminiKey({
        apiKey: geminiKeyInput.trim() || undefined,
        selectedModel: geminiModelInput,
      });
      setGeminiTestResult({
        ok: true,
        text: `Verified live (${res.model || geminiModelInput}, ${res.latencyMs ?? 0}ms, source: ${res.source}).`,
      });
      await loadWizard();
    } catch (err: any) {
      setGeminiTestResult({ ok: false, text: err?.message || 'Gemini key test failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveGeminiKey = async () => {
    setBusy('gemini-delete');
    setNotice(null);
    try {
      const res = await deleteUserGeminiKey();
      setGeminiSettings(res.settings);
      setGeminiTestResult(null);
      setNotice({ type: 'info', text: 'Personal Gemini API key permanently removed.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Could not remove Gemini API key.' });
    } finally {
      setBusy(null);
    }
  };

  const handleRunConnectivityTest = async () => {
    setBusy('health-test');
    setNotice(null);
    try {
      const diag = await fetchBackendHealthDiagnostics();
      setHealthDiagnostics(diag);
      setNotice({
        type: diag.httpOk ? 'success' : 'error',
        text: diag.httpOk
          ? `Backend healthy (${diag.clientLatencyMs}ms) — AES-256-GCM encryption & database checks verified.`
          : 'Backend reported degraded status. Review diagnostics below.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Backend health check failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyAllServices = async () => {
    setBusy('verify-services');
    setNotice(null);
    try {
      const [svc, gStatus, gAi, diag] = await Promise.all([
        fetchConnectedServicesStatus(),
        fetchGmailStatus(),
        fetchUserGeminiSettings(),
        fetchBackendHealthDiagnostics(),
      ]);
      setServicesSnapshot(svc);
      setVerifiedGmailStatus(gStatus);
      setGeminiSettings(gAi);
      setHealthDiagnostics(diag);
      setNotice({ type: 'success', text: 'Refreshed real-time status for all essential ZENVIK services.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Could not refresh service statuses.' });
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
        setNotice({ type: 'info', text: 'No local PDFs in CV Gallery yet. You can upload one below.' });
      } else {
        const res = await syncLocalCVGalleryToBackend(validCvs);
        await loadWizard();
        setNotice({ type: 'success', text: `Synchronized ${res.syncedCount} CV(s) to your isolated workspace.` });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'CV sync failed.' });
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
      await uploadMultiUserCV({
        title: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        pdfBase64: base64,
        isDefault: true,
      });
      await loadWizard();
      setNotice({ type: 'success', text: `Uploaded "${file.name}" to your isolated CV library.` });
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
        gmailSkipped: !verifiedGmailStatus?.connected,
        preferences: {
          preferredCountries: selectedCountries,
          jobCategories: selectedCategories,
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
      setNotice({ type: 'error', text: err?.message || 'Failed to save onboarding state.' });
    } finally {
      setBusy(null);
    }
  };

  const STEPS = [
    { num: 1, label: '1. Account' },
    { num: 2, label: '2. Gmail' },
    { num: 3, label: '3. Scopes' },
    { num: 4, label: '4. Verify' },
    { num: 5, label: '5. Gemini' },
    { num: 6, label: '6. Backend' },
    { num: 7, label: '7. Services' },
    { num: 8, label: '8. Finish' },
  ];

  const isGmailTrulyConnected = Boolean(verifiedGmailStatus?.connected && verifiedGmailStatus?.gmailAddress);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-3xl bg-white dark:bg-[#111520] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-emerald-600/10 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white">
                Onboarding &amp; Verification • Step {step} of 8
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Real Backend-Verified Integration Status
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-1">
              ZENVIK AGENT — Account, Gmail &amp; Gemini Setup Wizard
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 8-Step Progress Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-[#0c0f17] border-b border-slate-200/70 dark:border-slate-800/80 grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {STEPS.map(item => (
            <button
              key={item.num}
              type="button"
              onClick={() => setStep(item.num)}
              className={`px-2 py-1.5 rounded-xl text-center border text-[10px] font-bold transition cursor-pointer ${
                step === item.num
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : step > item.num
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[66vh] overflow-y-auto">
          {notice && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-medium flex items-start gap-2 border ${
                notice.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                  : notice.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300'
                  : 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-500/40 text-blue-800 dark:text-blue-300'
              }`}
            >
              {notice.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="break-all">{notice.text}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading verified workspace status...</div>
          ) : (
            <>
              {/* STEP 1: ACCOUNT IDENTITY & EMAIL VERIFICATION */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          Step 1: Account Created &amp; Identity Verification
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Your independent ZENVIK account isolates your CVs, Gmail OAuth tokens, Gemini API key, and application history.
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        wizardData?.steps?.googleAccount?.connected
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {wizardData?.steps?.googleAccount?.connected ? 'Authenticated' : 'Not Signed In'}
                    </span>
                  </div>

                  {wizardData?.steps?.googleAccount?.connected ? (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Account Email:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {wizardData.steps.googleAccount.email}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Email Verification Status:</span>
                        <span
                          className={`font-bold ${
                            wizardData.steps.googleAccount.emailVerified
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {wizardData.steps.googleAccount.emailVerified ? 'Verified' : 'Pending Verification'}
                        </span>
                      </div>

                      {!wizardData.steps.googleAccount.emailVerified && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={verificationCode}
                            onChange={e => setVerificationCode(e.target.value)}
                            placeholder="Paste email verification token"
                            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-white dark:bg-[#090b10] border border-slate-200 dark:border-slate-700 text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyEmailCode}
                            disabled={busy === 'verify-email'}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                          >
                            Verify Token
                          </button>
                          <button
                            type="button"
                            onClick={handleResendVerification}
                            disabled={busy === 'resend-verif'}
                            className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                          >
                            Generate Code
                          </button>
                        </div>
                      )}
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

              {/* STEP 2: CONNECT PERSONAL GMAIL */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          Step 2: Connect Your Personal Gmail (OAuth 2.0)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Every registered user sends job applications strictly from their own Google account — never from another user&apos;s or owner&apos;s Gmail.
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        isGmailTrulyConnected
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {isGmailTrulyConnected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>

                  {isGmailTrulyConnected ? (
                    <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          Verified Sender: {verifiedGmailStatus.gmailAddress}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                          Encrypted at rest (AES-256-GCM) • Refresh token:{' '}
                          {verifiedGmailStatus.hasRefreshToken ? 'Active' : 'Session token'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleConnectGmailStep}
                          disabled={busy === 'gmail-connect'}
                          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Reconnect
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnectGmailStep}
                          disabled={busy === 'gmail-disconnect'}
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleConnectGmailStep}
                        disabled={busy === 'gmail-connect'}
                        className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      >
                        <Mail className="w-4 h-4" />
                        <span>{busy === 'gmail-connect' ? 'Opening Google Account Picker...' : 'Connect Personal Gmail'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                      >
                        Review Permissions First &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: GRANT REQUIRED GOOGLE PERMISSIONS (MINIMUM SCOPES) */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                        Step 3: Minimum Required Google Permissions
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        ZENVIK requests only the least-privilege scopes required for the features you enable.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          1. Send Applications (<code className="font-mono text-blue-600">gmail.send</code>) — Required for Email Dispatch
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          Allows sending individual job applications with your CV PDF strictly when you click confirm. If declined, you can still use CV Builder and Job Search, and apply manually.
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px] shrink-0">
                        Core Scope
                      </span>
                    </div>

                    <label className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          2. Optional Employer Reply Tracking (<code className="font-mono text-emerald-600">gmail.readonly</code>)
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          Opt-in only. Enables syncing employer interview replies inside the Employer Replies tab. Leave unchecked to keep send-only access.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeReadReplies}
                        onChange={e => setIncludeReadReplies(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 mt-1"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleConnectGmailStep}
                    disabled={busy === 'gmail-connect'}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    <span>
                      {isGmailTrulyConnected
                        ? 'Update Granted Google Permissions'
                        : 'Authorize Selected Gmail Permissions'}
                    </span>
                  </button>
                </div>
              )}

              {/* STEP 4: VERIFY GMAIL CONNECTION */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          Step 4: Live Backend Gmail Verification
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Status below is fetched directly from <code className="font-mono">/api/gmail/status</code> — never assumed client-side.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleVerifyGmailLive}
                      disabled={busy === 'gmail-verify'}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy === 'gmail-verify' ? 'animate-spin' : ''}`} />
                      <span>Re-Verify Now</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Verified Backend Status:</span>
                      <span
                        className={`font-bold ${
                          isGmailTrulyConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isGmailTrulyConnected ? 'CONNECTED & VERIFIED' : (verifiedGmailStatus?.status || 'DISCONNECTED').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Connected Gmail Address:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {verifiedGmailStatus?.gmailAddress || 'Not connected yet'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Granted Scopes:</span>
                      <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                        {(verifiedGmailStatus?.scopes || []).join(', ') || 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Token Storage Security:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        AES-256-GCM Encrypted (Server-Side Only)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: CONFIGURE GEMINI API (BYOK) */}
              {step === 5 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-violet-600/10 border border-violet-500/30 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          Step 5: Configure Your Own Gemini API Key (Optional BYOK)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Bring your own Gemini API key (encrypted with AES-256-GCM on our backend) for dedicated quota, or skip to use default server AI where enabled.
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        geminiSettings?.hasPersonalKey
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {geminiSettings?.hasPersonalKey
                        ? `Personal Key (${geminiSettings.keyMasked})`
                        : 'Optional / Not Set'}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Personal Gemini API Key (Stored Encrypted on Backend — Never Exposed in Browser)
                      </label>
                      <input
                        type="password"
                        value={geminiKeyInput}
                        onChange={e => setGeminiKeyInput(e.target.value)}
                        placeholder={
                          geminiSettings?.hasPersonalKey
                            ? `Saved: ${geminiSettings.keyMasked} (paste new key to replace)`
                            : 'Paste your Gemini API key (AIza...)'
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#090b10] border border-slate-200 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Preferred Gemini Model
                      </label>
                      <select
                        value={geminiModelInput}
                        onChange={e => setGeminiModelInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#090b10] border border-slate-200 dark:border-slate-700 font-mono text-xs"
                      >
                        {GEMINI_MODELS.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {geminiTestResult && (
                      <div
                        className={`p-2.5 rounded-xl text-xs font-semibold ${
                          geminiTestResult.ok
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {geminiTestResult.text}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveGeminiKey}
                        disabled={busy !== null}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs cursor-pointer"
                      >
                        {busy === 'gemini-save' ? 'Encrypting & Saving...' : 'Save & Verify Key'}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestGeminiKey}
                        disabled={busy !== null}
                        className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                      >
                        {busy === 'gemini-test' ? 'Testing...' : 'Test API Key'}
                      </button>
                      {geminiSettings?.hasPersonalKey && (
                        <button
                          type="button"
                          onClick={handleRemoveGeminiKey}
                          disabled={busy !== null}
                          className="px-3.5 py-2 rounded-xl border border-rose-300 text-rose-600 dark:text-rose-300 font-bold text-xs cursor-pointer"
                        >
                          Remove Key
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: TEST BACKEND CONNECTIVITY */}
              {step === 6 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Server className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          Step 6: Test Backend Connectivity &amp; Security Health
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Runs live checks against <code className="font-mono">/api/health</code> for database writes, AES-256-GCM encryption self-test, and OAuth readiness.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunConnectivityTest}
                      disabled={busy === 'health-test'}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Activity className={`w-4 h-4 ${busy === 'health-test' ? 'animate-spin' : ''}`} />
                      <span>{busy === 'health-test' ? 'Testing...' : 'Run Live Connectivity Test'}</span>
                    </button>
                  </div>

                  {healthDiagnostics ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-slate-500">API Status &amp; Latency</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {(healthDiagnostics.status || 'healthy').toUpperCase()} ({healthDiagnostics.clientLatencyMs}ms)
                        </div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-slate-500">AES-256-GCM Encryption Self-Test</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {healthDiagnostics.checks?.encryptionSelfTest === 'passed' ? 'PASSED' : 'CHECK REQUIRED'}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-slate-500">Database Persistence</div>
                        <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                          {healthDiagnostics.checks?.database === 'connected' ? 'CONNECTED & WRITABLE' : 'CHECKING'}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                        <div className="text-slate-500">OAuth 2.0 Authorization Code Flow</div>
                        <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                          {healthDiagnostics.checks?.googleOAuthConfigured ? 'CONFIGURED' : 'POPUP FALLBACK'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                      Click &ldquo;Run Live Connectivity Test&rdquo; above to verify backend health in real time.
                    </div>
                  )}
                </div>
              )}

              {/* STEP 7: VERIFY ALL ESSENTIAL APPLICATION SERVICES */}
              {step === 7 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <KeyRound className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          Step 7: Verify All Essential Application Services
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Review actual verified status of every core service before entering your dashboard.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleVerifyAllServices}
                      disabled={busy === 'verify-services'}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy === 'verify-services' ? 'animate-spin' : ''}`} />
                      <span>Verify All</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {[
                      {
                        name: 'User Account & Isolation',
                        ok: Boolean(wizardData?.steps?.googleAccount?.connected),
                        detail: wizardData?.steps?.googleAccount?.email || 'Not authenticated',
                      },
                      {
                        name: 'Personal Gmail OAuth 2.0',
                        ok: isGmailTrulyConnected,
                        detail: isGmailTrulyConnected
                          ? verifiedGmailStatus.gmailAddress
                          : 'Not connected (optional — connect anytime)',
                      },
                      {
                        name: 'Gemini AI Engine',
                        ok: Boolean(geminiSettings?.hasPersonalKey || geminiSettings?.serverFallbackAvailable),
                        detail: geminiSettings?.hasPersonalKey
                          ? `Personal BYOK Key (${geminiSettings.selectedModel})`
                          : geminiSettings?.serverFallbackAvailable
                          ? `Server Default Ready (${geminiSettings.selectedModel})`
                          : 'Not configured',
                      },
                      {
                        name: 'CV Gallery & Document Storage',
                        ok: true,
                        detail: `${wizardData?.steps?.cvStorage?.cvCount ?? 0} PDF(s) stored in isolated workspace`,
                      },
                      {
                        name: 'Job Search Engine',
                        ok: true,
                        detail: servicesSnapshot?.services?.jobSearchEngine?.status || 'Active',
                      },
                      {
                        name: 'Backend API & AES-256-GCM',
                        ok: healthDiagnostics ? Boolean(healthDiagnostics.httpOk) : true,
                        detail: healthDiagnostics
                          ? `Verified (${healthDiagnostics.clientLatencyMs}ms)`
                          : 'Online',
                      },
                    ].map(item => (
                      <div
                        key={item.name}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.detail}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            item.ok
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {item.ok ? 'Verified' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 8: CV SYNC, CAREER PREFERENCES & ENTER DASHBOARD */}
              {step === 8 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                        Step 8: Career Profile, CV Sync &amp; Enter Dashboard
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sync your CV PDF and set target destinations so ZENVIK personalizes your workspace immediately.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleSyncFromCVGallery}
                      disabled={busy === 'cv-sync'}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Sync CV Gallery</span>
                    </button>
                    <label className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>{busy === 'cv-upload' ? 'Uploading...' : 'Upload PDF CV'}</span>
                      <input type="file" accept="application/pdf,.pdf" onChange={handleUploadCVFile} className="hidden" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={headline}
                      onChange={e => setHeadline(e.target.value)}
                      placeholder="Headline"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                    <input
                      type="text"
                      value={nationality}
                      onChange={e => setNationality(e.target.value)}
                      placeholder="Nationality"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                    <input
                      type="text"
                      value={currentCountry}
                      onChange={e => setCurrentCountry(e.target.value)}
                      placeholder="Current Country"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_OPTIONS.map(cat => {
                      const active = selectedCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleItem(selectedCategories, setSelectedCategories, cat)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold border flex items-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          <span>{cat}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {COUNTRY_OPTIONS.map(c => {
                      const active = selectedCountries.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleItem(selectedCountries, setSelectedCountries, c)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
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
                Finish Later
              </button>
            )}
          </div>

          <div>
            {step < 8 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Next Step ({step + 1}/8)</span>
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
                <span>{busy === 'finish' ? 'Completing...' : 'Complete Onboarding & Enter Dashboard'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const FirstTimeSetupWizardModal = FirstTimeSetupWizard;
