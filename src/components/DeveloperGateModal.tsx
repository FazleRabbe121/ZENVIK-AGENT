import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  AlertCircle,
  FileText,
  ShieldCheck,
  KeyRound,
  Mic,
  Mail,
  RefreshCw,
  UserPlus,
  LogIn,
  Clock,
  CheckCircle2,
  Sparkles,
  Lock,
} from 'lucide-react';
import { CCDLogo } from './CCDLogo';
import {
  checkParticipantEmailAuthMode,
  enterInterviewWithEmail,
} from '../services/interviewCenterService';
import {
  registerMultiUserAccount,
  loginMultiUserAccount,
  signInWithGoogleUnified,
  requestPasswordReset,
  confirmPasswordReset,
  startGuestSession,
  GuestSessionStatus,
} from '../services/multiUserService';
import { signInWithGoogle } from '../services/firebase';

export type AppAccessLevel = 'full' | 'cv-only' | 'interview-only' | 'guest';

interface DeveloperGateModalProps {
  onAuthorize: (
    level: AppAccessLevel,
    meta?: { isNewRegistration?: boolean; guestSession?: GuestSessionStatus }
  ) => void;
  guestExpiredReason?: string | null;
}

export const FULL_ACCESS_PASSCODE = '89056';
export const CV_ONLY_PASSCODE = '00000';

type AuthHubTab = 'login' | 'signup' | 'forgot' | 'passcode';

export const DeveloperGateModal: React.FC<DeveloperGateModalProps> = ({
  onAuthorize,
  guestExpiredReason,
}) => {
  const [activeTab, setActiveTab] = useState<AuthHubTab>(guestExpiredReason ? 'signup' : 'login');

  // Multi-user Auth State
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState('');

  // Legacy Passcode & Interview Portal State (strictly preserved)
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gmailInput, setGmailInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [requiresPin, setRequiresPin] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isSubmittingGmail, setIsSubmittingGmail] = useState(false);

  useEffect(() => {
    const cleanEmail = gmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setRequiresPin(false);
      setPinInput('');
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingEmail(true);
      try {
        const status = await checkParticipantEmailAuthMode(cleanEmail);
        if (status.approved && status.requireAccessCode) {
          setRequiresPin(true);
        } else if (!status.requireAccessCode) {
          setRequiresPin(false);
          setPinInput('');
        }
      } finally {
        setIsCheckingEmail(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [gmailInput]);

  const clearFeedback = () => {
    setError(false);
    setErrorMessage('');
    setInfoMessage('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusyAction('login');
    try {
      await loginMultiUserAccount({ email: email.trim(), password });
      localStorage.setItem('app_access_level_auth', 'full');
      onAuthorize('full', { isNewRegistration: false });
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || 'Invalid email or password.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (password.length < 8) {
      setError(true);
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setError(true);
      setErrorMessage('Passwords do not match.');
      return;
    }
    setBusyAction('signup');
    try {
      await registerMultiUserAccount({
        email: email.trim(),
        password,
        displayName: displayName.trim() || email.trim().split('@')[0],
      });
      localStorage.setItem('app_access_level_auth', 'full');
      try {
        localStorage.removeItem('zenvik_first_time_setup_completed_v1');
      } catch {}
      onAuthorize('full', { isNewRegistration: true });
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || 'Could not create account.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    clearFeedback();
    setBusyAction('google');
    try {
      const fbRes = await signInWithGoogle();
      if (!fbRes?.user?.email) {
        throw new Error('Google Sign-In was cancelled or did not return an email address.');
      }
      const idToken = await fbRes.user.getIdToken();
      const unified = await signInWithGoogleUnified({
        idToken,
        email: fbRes.user.email,
        displayName: fbRes.user.displayName || undefined,
        uid: fbRes.user.uid,
      });
      localStorage.setItem('app_access_level_auth', 'full');
      onAuthorize('full', { isNewRegistration: Boolean(unified.isNewUser) });
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusyAction('forgot');
    try {
      if (resetStep === 'request') {
        const res = await requestPasswordReset(email.trim());
        setInfoMessage(
          res.resetToken
            ? `${res.message} Verification Reset Code: ${res.resetToken}`
            : res.message
        );
        if (res.resetToken) {
          setResetToken(res.resetToken);
        }
        setResetStep('confirm');
      } else {
        if (resetNewPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long.');
        }
        const res = await confirmPasswordReset({
          token: resetToken.trim(),
          newPassword: resetNewPassword,
        });
        setInfoMessage(res.message || 'Password updated. You may now sign in with your new password.');
        setResetStep('request');
        setResetToken('');
        setResetNewPassword('');
        setActiveTab('login');
      }
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || 'Password reset failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartGuestPreview = async () => {
    clearFeedback();
    setBusyAction('guest');
    try {
      const guestSession = await startGuestSession();
      onAuthorize('guest', { guestSession });
    } catch (err: any) {
      setError(true);
      setErrorMessage(
        err?.message ||
          'Guest Preview is currently unavailable or cooldown is active. Please Sign Up for a free independent account.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = passcode.trim();

    if (clean === FULL_ACCESS_PASSCODE) {
      localStorage.setItem('app_access_level_auth', 'full');
      localStorage.setItem('app_dev_authorized_89056', 'true');
      setError(false);
      onAuthorize('full');
    } else if (clean === CV_ONLY_PASSCODE) {
      localStorage.setItem('app_access_level_auth', 'cv-only');
      setError(false);
      onAuthorize('cv-only');
    } else {
      setError(true);
      setErrorMessage('Invalid Passcode. Please enter a valid access passcode.');
      setPasscode('');
    }
  };

  const handleGmailInterviewLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = gmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(true);
      setErrorMessage('Please enter a valid approved Gmail address.');
      return;
    }

    setError(false);
    setIsSubmittingGmail(true);
    try {
      const res = await enterInterviewWithEmail(cleanEmail, requiresPin ? pinInput : undefined);
      if (!res.authorized) {
        if (res.requireAccessCode) {
          setRequiresPin(true);
        }
        setError(true);
        setErrorMessage(
          res.error ||
            'Access denied. Only Gmail addresses approved by the Admin can access the Interview Section.'
        );
        return;
      }

      localStorage.setItem('app_access_level_auth', 'interview-only');
      onAuthorize('interview-only');
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || 'Unable to verify Gmail access. Please try again.');
    } finally {
      setIsSubmittingGmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-[#f4f7fb] via-white to-[#eef2ff] dark:from-[#090b10] dark:via-[#0d1017] dark:to-[#111522] animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#131724] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_-15px_rgba(37,99,235,0.14)] text-slate-900 dark:text-slate-100 my-auto">
        {/* Brand Crest & Header */}
        <div className="flex flex-col items-center text-center pb-4">
          <div className="mb-2.5 flex flex-col items-center gap-2">
            <CCDLogo size={48} mode="icon" />
            <CCDLogo size={30} mode="lockup" />
          </div>

          <h2 className="font-['Montserrat'] font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight leading-snug">
            ZENVIK AGENT Workspace
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-['Inter'] max-w-sm">
            Create your own independent account to connect your personal Gmail and optional Gemini API key, or preview as a Guest.
          </p>
        </div>

        {/* Guest Expired Alert Banner */}
        {guestExpiredReason && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
            <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <div className="font-bold">Guest Preview Session Expired</div>
              <p className="mt-0.5 leading-relaxed">{guestExpiredReason}</p>
            </div>
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-[#090b10] border border-slate-200/80 dark:border-slate-800 mb-5">
          {[
            { id: 'login' as const, label: 'Log In', icon: LogIn },
            { id: 'signup' as const, label: 'Sign Up', icon: UserPlus },
            { id: 'forgot' as const, label: 'Reset', icon: KeyRound },
            { id: 'passcode' as const, label: 'Access', icon: Lock },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  clearFeedback();
                }}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#1a2033] text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Info & Error Banners */}
        {infoMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
            <span className="break-all">{infoMessage}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-500/50 text-rose-700 dark:text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: LOG IN */}
        {activeTab === 'login' && (
          <div className="space-y-4">
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busyAction === 'login' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>{busyAction === 'login' ? 'Signing In...' : 'Log In to My Workspace'}</span>
              </button>
            </form>

            <div className="relative flex items-center justify-center my-1">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white dark:bg-[#131724] whitespace-nowrap">
                Or continue with
              </span>
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busyAction !== null}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-50 dark:bg-[#090b10] hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {busyAction === 'google' ? (
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              ) : (
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              )}
              <span>Sign In with Google Account</span>
            </button>
          </div>
        )}

        {/* TAB 2: SIGN UP */}
        {activeTab === 'signup' && (
          <div className="space-y-4">
            <form onSubmit={handleSignupSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busyAction === 'signup' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                <span>{busyAction === 'signup' ? 'Creating Account...' : 'Create Independent Account'}</span>
              </button>
            </form>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busyAction !== null}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-50 dark:bg-[#090b10] hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Sign Up Quickly with Google</span>
            </button>
          </div>
        )}

        {/* TAB 3: FORGOT / RESET PASSWORD */}
        {activeTab === 'forgot' && (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
            {resetStep === 'request' ? (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter your account email to generate a time-limited password reset code.
                </p>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Account email address"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  {busyAction === 'forgot' ? 'Sending Reset Token...' : 'Request Password Reset'}
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  placeholder="New password (min 8 characters)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  {busyAction === 'forgot' ? 'Updating Password...' : 'Confirm New Password'}
                </button>
              </>
            )}
          </form>
        )}

        {/* TAB 4: ADMIN PASSCODE, CV-ONLY (00000) & INTERVIEW PORTAL */}
        {activeTab === 'passcode' && (
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#090b10]/80 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Full Application Suite:</span>
                </span>
                <span className="font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/20 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                  Master Passcode
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 pt-1.5 border-t border-slate-200/70 dark:border-slate-800/60">
                <span className="flex items-center gap-1.5 font-semibold">
                  <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>CV-Only Workspace:</span>
                </span>
                <span className="font-mono text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-md text-[11px] font-bold">
                  Passcode: 00000
                </span>
              </div>
            </div>

            <form onSubmit={handlePasscodeSubmit} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                required
                value={passcode}
                onChange={e => {
                  setPasscode(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="• • • • •"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-2xl text-lg font-mono tracking-[0.4em] text-blue-600 dark:text-blue-400 text-center"
              />
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-blue-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Unlock with Passcode</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <form
              onSubmit={handleGmailInterviewLogin}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090b10]/90 border border-slate-200/80 dark:border-slate-800 space-y-2.5 text-left"
            >
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  <Mic className="w-3.5 h-3.5" />
                  <span>Interview Section — Approved Gmail Login</span>
                </label>
                {isCheckingEmail && <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />}
              </div>

              <input
                type="email"
                required
                autoComplete="email"
                value={gmailInput}
                onChange={e => {
                  setGmailInput(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="Enter approved Gmail address..."
                className="w-full px-3.5 py-2.5 bg-white dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />

              {requiresPin && (
                <input
                  type="password"
                  required
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  placeholder="Enter assigned PIN"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-[#07090e] border border-amber-400/60 rounded-xl text-xs font-mono tracking-widest text-slate-900 dark:text-amber-300"
                />
              )}

              <button
                type="submit"
                disabled={isSubmittingGmail}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600/10 hover:bg-blue-600 hover:text-white border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isSubmittingGmail ? 'Verifying...' : 'Enter Interview Section'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* Controlled Server-Enforced Guest Preview Option */}
        <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
          <button
            type="button"
            onClick={handleStartGuestPreview}
            disabled={busyAction !== null}
            className="w-full py-2.5 px-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 border border-amber-300/80 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {busyAction === 'guest' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
            <span>Continue as Guest (3-Minute Server-Enforced Preview)</span>
          </button>
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
            Guest Preview runs on a server-enforced timer using the platform owner&apos;s backend AI &amp; Gmail relay (with send confirmation). No private user data or inbox access is ever exposed.
          </p>
        </div>
      </div>
    </div>
  );
};
