import React, { useState, useEffect } from 'react';
import {
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  LogIn,
  UserPlus,
  Send,
  FileText,
  Trash2,
  Eye,
  Lock,
  Users,
  Activity,
  RotateCcw,
  KeyRound,
  Plus,
  Check,
  X,
  Upload,
  Download,
} from 'lucide-react';
import {
  MultiUserWorkspaceOverview,
  fetchMultiUserWorkspace,
  registerMultiUserAccount,
  loginMultiUserAccount,
  logoutMultiUserAccount,
  updateMultiUserSettings,
  uploadMultiUserCV,
  deleteMultiUserCV,
  selectDefaultMultiUserCV,
  downloadMultiUserCV,
  syncLocalCVGalleryToBackend,
  fetchGmailOAuthConfig,
  connectPersonalGmailViaPopupOrBackend,
  disconnectPersonalGmail,
  sendPersonalGmailEmails,
  sendPersonalGmailTestEmail,
  retryFailedPersonalGmail,
  deleteOwnMultiUserAccount,
  fetchMultiUserAdminOverview,
  updateMultiUserAccountStatus,
  adminDeleteMultiUserAccount,
} from '../services/multiUserService';
import { signInWithGoogle } from '../services/firebase';

interface GmailIntegrationViewProps {
  onBack?: () => void;
}

export const GmailIntegrationView: React.FC<GmailIntegrationViewProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'gmail' | 'send' | 'cvs' | 'history' | 'settings' | 'admin'>('gmail');
  const [workspace, setWorkspace] = useState<MultiUserWorkspaceOverview | null>(null);
  const [oauthConfig, setOauthConfig] = useState<{
    isBackendOAuthConfigured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    redirectUri: string;
    requiredScope: string;
    requiredEnvVars: string[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [includeReadReplies, setIncludeReadReplies] = useState<boolean>(false);

  // Auth Form State (Register / Login as separate user)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Compose & Send Email State
  const [recipientsText, setRecipientsText] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [positionInput, setPositionInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [coverLetterInput, setCoverLetterInput] = useState('');
  const [selectedCvId, setSelectedCvId] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ total: number; sent: number; failed: number } | null>(null);

  // Test Email Recipient State
  const [testRecipientInput, setTestRecipientInput] = useState('');

  // CV Upload State
  const [newCvTitle, setNewCvTitle] = useState('');

  // Admin Overview State
  const [adminData, setAdminData] = useState<{
    systemHealth: any;
    users: any[];
  } | null>(null);

  // Explicit Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, ws] = await Promise.all([
        fetchGmailOAuthConfig().catch(() => null),
        fetchMultiUserWorkspace().catch(() => null),
      ]);
      if (cfg) setOauthConfig(cfg);
      if (ws) {
        setWorkspace(ws);
        setSubjectInput(prev => prev || ws.user.defaultEmailSubject || '');
        setCoverLetterInput(prev => prev || ws.user.defaultCoverLetter || '');
        const defaultCv = ws.cvs.find(c => c.isDefault) || ws.cvs[0];
        if (defaultCv && !selectedCvId) {
          setSelectedCvId(defaultCv.id);
        }
        setTestRecipientInput(prev => prev || ws.gmailConnection.gmailAddress || ws.user.email || '');
        if (ws.user.role === 'admin') {
          fetchMultiUserAdminOverview()
            .then(setAdminData)
            .catch(() => {});
        } else {
          setAdminData(null);
        }
      } else {
        setWorkspace(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const onGmailUpdated = () => {
      loadData();
    };
    window.addEventListener('gmail_connection_updated', onGmailUpdated);
    return () => {
      window.removeEventListener('gmail_connection_updated', onGmailUpdated);
    };
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('auth');
    setNotice(null);
    try {
      if (authMode === 'register') {
        const res = await registerMultiUserAccount({
          email: authEmail,
          password: authPassword,
          displayName: authName || authEmail.split('@')[0],
        });
        setNotice({
          type: 'success',
          message: `Account registered and isolated workspace created for ${res.user.email} (ID: ${res.user.userId}).`,
        });
      } else {
        const res = await loginMultiUserAccount({
          email: authEmail,
          password: authPassword,
        });
        setNotice({
          type: 'success',
          message: `Logged in as ${res.user.email} (ID: ${res.user.userId}).`,
        });
      }
      setAuthPassword('');
      setShowAuthModal(false);
      await loadData();
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Authentication failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGoogleAppLogin = async () => {
    setBusyAction('google-login');
    setNotice(null);
    try {
      const res = await signInWithGoogle();
      if (res?.user) {
        setShowAuthModal(false);
        await loadData();
        setNotice({
          type: 'success',
          message: `Signed in to ZENVIK-AGENT as ${res.user.email}. You can now optionally connect your personal Gmail for sending.`,
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Google Sign-In failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConnectGmail = async () => {
    setBusyAction('connect-gmail');
    setNotice(null);
    try {
      const res = await connectPersonalGmailViaPopupOrBackend({ includeReadReplies });
      await loadData();
      setNotice({
        type: 'success',
        message: `Personal Gmail Connected: ${res.gmailAddress} (Scopes: ${(res.scopes || ['https://www.googleapis.com/auth/gmail.send']).join(', ')}).`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err?.message || 'Gmail OAuth authorization failed or was cancelled.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnectGmailRequest = () => {
    if (!workspace?.gmailConnection.gmailAddress) return;
    setConfirmDialog({
      title: 'Disconnect Personal Gmail & Revoke Token?',
      description: `This will revoke ZENVIK-AGENT's send permission for ${workspace.gmailConnection.gmailAddress} with Google and permanently delete your encrypted OAuth tokens from the server.`,
      confirmLabel: 'Disconnect & Revoke Token',
      isDanger: true,
      onConfirm: async () => {
        setBusyAction('disconnect-gmail');
        try {
          await disconnectPersonalGmail();
          await loadData();
          setNotice({
            type: 'info',
            message: 'Personal Gmail disconnected and stored OAuth tokens permanently deleted.',
          });
        } catch (err: any) {
          setNotice({ type: 'error', message: err?.message || 'Failed to disconnect Gmail.' });
        } finally {
          setBusyAction(null);
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleSendTestEmail = async () => {
    if (!workspace?.gmailConnection.connected) {
      setNotice({ type: 'error', message: 'Please connect your personal Gmail account first.' });
      return;
    }
    const targetRecipient = (testRecipientInput || workspace.gmailConnection.gmailAddress || '').trim();
    setConfirmDialog({
      title: 'Confirm Sending Test Email',
      description: `Send a test verification email from your connected Gmail (${workspace.gmailConnection.gmailAddress}) to ${targetRecipient}?`,
      confirmLabel: 'Confirm & Send Test Email',
      onConfirm: async () => {
        setBusyAction('send-test');
        setConfirmDialog(null);
        setNotice(null);
        try {
          const res = await sendPersonalGmailTestEmail({
            recipientEmail: targetRecipient,
            cvId: selectedCvId || undefined,
          });
          await loadData();
          setNotice({
            type: 'success',
            message: `Test email sent from ${res.record.senderGmail} to ${res.record.recipientEmail} (Gmail Message ID: ${res.record.gmailMessageId}).`,
          });
        } catch (err: any) {
          await loadData();
          setNotice({ type: 'error', message: err?.message || 'Test email failed to send.' });
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const parsedRecipientList = recipientsText
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const handleSendApplications = () => {
    if (!workspace?.gmailConnection.connected) {
      setNotice({
        type: 'error',
        message: 'You must connect your personal Gmail account before sending job applications.',
      });
      return;
    }
    if (parsedRecipientList.length === 0) {
      setNotice({ type: 'error', message: 'Please enter at least one recipient email address.' });
      return;
    }
    const selectedCv = workspace.cvs.find(c => c.id === selectedCvId) || workspace.cvs[0] || null;
    const cvLabel = selectedCv ? selectedCv.fileName : 'Default Active CV from Central CV Library';

    setConfirmDialog({
      title: `Confirm Sending ${parsedRecipientList.length} Individual Application Email(s)`,
      description: `Each of the ${parsedRecipientList.length} recipient(s) will receive a separate, individual email sent directly from your Gmail (${workspace.gmailConnection.gmailAddress}) with your CV "${cvLabel}" attached.`,
      confirmLabel: `Send ${parsedRecipientList.length} Email(s) Now`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setBusyAction('send-batch');
        setSendProgress({ total: parsedRecipientList.length, sent: 0, failed: 0 });
        setNotice(null);
        try {
          const res = await sendPersonalGmailEmails({
            recipients: parsedRecipientList.map(email => ({
              recipientEmail: email,
              company: companyInput || undefined,
              position: positionInput || undefined,
            })),
            subject: subjectInput,
            coverLetter: coverLetterInput,
            cvId: selectedCv?.id,
          });
          setSendProgress({
            total: parsedRecipientList.length,
            sent: res.sentCount || 0,
            failed: res.failedCount || 0,
          });
          await loadData();
          if (res.failedCount === 0) {
            setNotice({
              type: 'success',
              message: `Successfully sent ${res.sentCount} individual email(s) from ${workspace.gmailConnection.gmailAddress}.`,
            });
            setRecipientsText('');
          } else {
            setNotice({
              type: 'error',
              message: `Completed with ${res.sentCount} sent and ${res.failedCount} failed. Check Email History to retry failed deliveries.`,
            });
          }
        } catch (err: any) {
          await loadData();
          setNotice({ type: 'error', message: err?.message || 'Failed to send emails.' });
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const handleRetryEmail = async (historyId: string) => {
    setBusyAction(`retry-${historyId}`);
    setNotice(null);
    try {
      const res = await retryFailedPersonalGmail(historyId);
      await loadData();
      setNotice({
        type: 'success',
        message: `Retry succeeded! Sent to ${res.record.recipientEmail} (Message ID: ${res.record.gmailMessageId}).`,
      });
    } catch (err: any) {
      await loadData();
      setNotice({ type: 'error', message: err?.message || 'Retry failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyAction('upload-cv');
    setNotice(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadMultiUserCV({
        title: newCvTitle.trim() || file.name.replace(/\.pdf$/i, ''),
        fileName: file.name.endsWith('.pdf') ? file.name : `${file.name}.pdf`,
        pdfBase64: base64,
        isDefault: (workspace?.cvs.length || 0) === 0,
      });
      setNewCvTitle('');
      setSelectedCvId(uploaded.id);
      await loadData();
      setNotice({
        type: 'success',
        message: `Uploaded "${uploaded.fileName}" to your isolated CV Gallery.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'CV upload failed.' });
    } finally {
      setBusyAction(null);
      e.target.value = '';
    }
  };

  const failedEmails = (workspace?.emailHistory || []).filter(h => h.status === 'failed');

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Active Multi-User Identity Banner */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-widest text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/30">
              Multi-User SaaS &amp; Personal Gmail OAuth 2.0
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
              AES-256-GCM Encrypted Tokens
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Personal Gmail Integration &amp; Isolated User Workspace
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each user logs into their own account, manages their own CV Gallery, and sends applications strictly from their own authorized Gmail address.
          </p>
        </div>

        {/* Authenticated User Identity & Switch Account Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {workspace ? (
            <div className="px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{workspace.user.displayName}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-mono bg-blue-500/15 text-blue-600 dark:text-blue-300">
                  {workspace.user.role}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {workspace.user.email} • ID: {workspace.user.userId}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="px-3.5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{workspace ? 'Switch / Register User' : 'Register / Log In'}</span>
          </button>

          {workspace && (
            <button
              type="button"
              onClick={async () => {
                await logoutMultiUserAccount();
                setWorkspace(null);
                setNotice({ type: 'info', message: 'Logged out and revoked server session token.' });
              }}
              className="px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Notice Banner */}
      {notice && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
              : notice.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'gmail' as const, label: '1. Gmail Connection', icon: Mail },
          { id: 'cvs' as const, label: `2. My CV Gallery (${workspace?.cvs.length || 0})`, icon: FileText },
          { id: 'send' as const, label: '3. Send Application', icon: Send },
          {
            id: 'history' as const,
            label: `4. Email History & Retry (${workspace?.emailHistory.length || 0})`,
            icon: Activity,
          },
          { id: 'settings' as const, label: '5. Account & Quotas', icon: Lock },
          ...(workspace?.user.role === 'admin'
            ? [{ id: 'admin' as const, label: '6. SaaS Admin Panel', icon: Users }]
            : []),
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                active
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-[#12151e] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#232838] hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PERSONAL GMAIL CONNECTION */}
      {activeTab === 'gmail' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span>Personal Gmail OAuth 2.0 Connection</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Application login is separate from Gmail sending authorization. Connect your personal Gmail account to send job applications from your own email address.
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  workspace?.gmailConnection.connected
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : workspace?.gmailConnection.status === 'revoked' ||
                      workspace?.gmailConnection.status === 'expired'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'
                }`}
              >
                {workspace?.gmailConnection.connected
                  ? 'Gmail Connected'
                  : workspace?.gmailConnection.status === 'revoked'
                  ? 'Authorization Revoked'
                  : workspace?.gmailConnection.status === 'expired'
                  ? 'Token Expired'
                  : 'Not Connected'}
              </span>
            </div>

            {/* Connection Details Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#232838] space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">ZENVIK Account User:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {workspace ? `${workspace.user.email} (${workspace.user.userId})` : 'Not logged in'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Connected Sender Gmail:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {workspace?.gmailConnection.gmailAddress || 'None — Click "Connect My Gmail" below'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Granted Google Scopes:</span>
                <code className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-300 font-mono text-[11px]">
                  {(workspace?.gmailConnection.scopes || ['https://www.googleapis.com/auth/gmail.send']).join(', ')}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Daily Sending Quota Usage:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {workspace?.gmailConnection.sentTodayCount || 0} / {workspace?.gmailConnection.dailyLimit || 40} emails today
                </span>
              </div>
              {workspace?.gmailConnection.lastError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-[11px]">
                  <strong>Last Authorization / Delivery Alert:</strong> {workspace.gmailConnection.lastError}
                </div>
              )}
            </div>

            {/* Permission Explanation Box */}
            <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Least-Privilege Gmail Security Guarantee</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                By default, ZENVIK-AGENT requests <strong>only</strong> <code>gmail.send</code> to send job applications that you explicitly initiate. Your OAuth access &amp; refresh tokens are encrypted at rest with AES-256-GCM on our backend and are never stored in browser storage.
              </p>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-800 dark:text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={includeReadReplies}
                  onChange={e => setIncludeReadReplies(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-600"
                />
                <span>Also request optional <code>gmail.readonly</code> to sync employer interview replies</span>
              </label>
            </div>

            {/* Connect / Disconnect Action Buttons */}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button
                type="button"
                disabled={!workspace || busyAction === 'connect-gmail'}
                onClick={handleConnectGmail}
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                {busyAction === 'connect-gmail' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span>
                  {workspace?.gmailConnection.connected ? 'Reconnect / Change My Gmail' : 'Connect My Gmail'}
                </span>
              </button>

              {workspace?.gmailConnection.connected && (
                <button
                  type="button"
                  disabled={busyAction === 'disconnect-gmail'}
                  onClick={handleDisconnectGmailRequest}
                  className="px-4 py-3 rounded-2xl border border-rose-300 dark:border-rose-500/40 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 dark:text-rose-300 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Disconnect Gmail</span>
                </button>
              )}
            </div>
          </div>

          {/* Send Test Email & OAuth Redirect Configuration Card */}
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-500" />
                <span>Send Test Email</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify that emails are sent from your own connected Gmail address (
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {workspace?.gmailConnection.gmailAddress || 'Not connected'}
                </span>
                ).
              </p>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Test Recipient Email
                </label>
                <input
                  type="email"
                  value={testRecipientInput}
                  onChange={e => setTestRecipientInput(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                disabled={!workspace?.gmailConnection.connected || busyAction === 'send-test'}
                onClick={handleSendTestEmail}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {busyAction === 'send-test' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send Test Email Now</span>
              </button>
            </div>

            {/* Cloud Run / Secret Manager OAuth Callback Info */}
            <div className="p-5 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-2.5 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-500" />
                <span>OAuth 2.0 Callback Configuration</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Backend Authorization Code Flow status:{' '}
                <strong className={oauthConfig?.isBackendOAuthConfigured ? 'text-emerald-500' : 'text-amber-500'}>
                  {oauthConfig?.isBackendOAuthConfigured
                    ? 'GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET Active'
                    : 'Using Client Popup + Server Encrypted Token Binding'}
                </strong>
              </p>
              <div className="text-[10px] font-mono bg-slate-50 dark:bg-[#0b0d13] p-2.5 rounded-xl border border-slate-200 dark:border-[#232838] break-all space-y-1">
                <div>Dev Callback: https://ais-dev-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app/api/gmail/oauth/callback</div>
                <div>Prod Callback: https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app/api/gmail/oauth/callback</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ISOLATED USER CV GALLERY */}
      {activeTab === 'cvs' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Isolated CV Gallery ({workspace?.user.displayName || 'Current User'})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Single source of truth synchronized with your main CV Gallery. CVs belong strictly to your user ID (<code>{workspace?.user.userId}</code>).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={busyAction === 'sync-gallery'}
                onClick={async () => {
                  setBusyAction('sync-gallery');
                  try {
                    const res = await syncLocalCVGalleryToBackend();
                    await loadData();
                    setNotice({
                      type: 'success',
                      message: `Synchronized ${res.syncedCount} CV(s) from your main CV Gallery (${res.totalCount} total in backend storage).`,
                    });
                  } catch (err: any) {
                    setNotice({ type: 'error', message: err?.message || 'CV Gallery sync failed.' });
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl border border-blue-300 dark:border-blue-500/40 text-blue-600 dark:text-blue-300 font-bold text-xs flex items-center gap-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'sync-gallery' ? 'animate-spin' : ''}`} />
                <span>Sync from CV Gallery</span>
              </button>
              <input
                type="text"
                value={newCvTitle}
                onChange={e => setNewCvTitle(e.target.value)}
                placeholder="Optional CV Title..."
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white"
              />
              <label className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload PDF CV</span>
                <input type="file" accept="application/pdf,.pdf" onChange={handleCvFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {!workspace?.cvs.length ? (
            <div className="p-8 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-dashed border-slate-300 dark:border-slate-800 text-center text-xs text-slate-500">
              No CVs in your personal gallery yet. Click &ldquo;Sync from CV Gallery&rdquo; or upload a PDF CV above to attach it to your Gmail applications.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspace.cvs.map(cv => (
                <div
                  key={cv.id}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    selectedCvId === cv.id
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-400 dark:border-blue-500/50'
                      : 'bg-slate-50 dark:bg-[#0b0d13] border-slate-200 dark:border-[#232838]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span>{cv.title}</span>
                      {cv.isDefault && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      {cv.fileName} • {Math.round(cv.fileSizeBytes / 1024)} KB
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        setSelectedCvId(cv.id);
                        await selectDefaultMultiUserCV(cv.id).catch(() => {});
                        await loadData();
                      }}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer ${
                        selectedCvId === cv.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {selectedCvId === cv.id ? 'Selected' : 'Select'}
                    </button>
                    <button
                      type="button"
                      title="Download PDF CV"
                      onClick={() => downloadMultiUserCV(cv.id, cv.fileName)}
                      className="p-1.5 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete CV"
                      onClick={async () => {
                        await deleteMultiUserCV(cv.id);
                        await loadData();
                      }}
                      className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PERSONAL GMAIL SENDING ENGINE */}
      {activeTab === 'send' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Send Individual Job Applications From Your Gmail
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sender:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                  {workspace?.gmailConnection.gmailAddress || 'Connect Gmail First'}
                </strong>{' '}
                • Each recipient receives an individual email with your selected PDF CV attached (never CC/BCC).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Before Sending</span>
            </button>
          </div>

          {sendProgress && (
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-500/30 text-xs flex items-center justify-between">
              <span className="font-bold text-blue-800 dark:text-blue-200">
                Batch Progress: {sendProgress.sent} sent, {sendProgress.failed} failed out of {sendProgress.total}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Recipient Email(s) (One per line or comma-separated — sent individually)
              </label>
              <textarea
                rows={3}
                value={recipientsText}
                onChange={e => setRecipientsText(e.target.value)}
                placeholder="hr@hotel-example.com&#10;careers@resort-example.com"
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Select CV from Your Personal CV Gallery
                </label>
                <select
                  value={selectedCvId}
                  onChange={e => setSelectedCvId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white"
                >
                  <option value="">-- Select your PDF CV --</option>
                  {(workspace?.cvs || []).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.fileName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={companyInput}
                  onChange={e => setCompanyInput(e.target.value)}
                  placeholder="Company Name (optional)"
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={positionInput}
                  onChange={e => setPositionInput(e.target.value)}
                  placeholder="Position Title (optional)"
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Subject</label>
            <input
              type="text"
              value={subjectInput}
              onChange={e => setSubjectInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Cover Letter Body</label>
            <textarea
              rows={7}
              value={coverLetterInput}
              onChange={e => setCoverLetterInput(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-xs text-slate-900 dark:text-white leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={busyAction === 'send-batch'}
              onClick={handleSendApplications}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {busyAction === 'send-batch' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Send Individual Email(s) ({parsedRecipientList.length || 0})</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: EMAIL SENDING HISTORY & FAILED RETRY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {failedEmails.length > 0 && (
            <div className="p-5 rounded-3xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/30 space-y-3">
              <h3 className="text-sm font-extrabold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Failed Emails Requiring Retry ({failedEmails.length})</span>
              </h3>
              <div className="space-y-2">
                {failedEmails.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-[#12151e] border border-rose-200 dark:border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        To: {item.recipientEmail} • Subject: {item.subject}
                      </div>
                      <div className="text-[11px] text-rose-600 dark:text-rose-400">
                        Error: {item.errorReason || 'Delivery failed'} • CV: {item.cvFilename}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === `retry-${item.id}`}
                      onClick={() => handleRetryEmail(item.id)}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Without Duplicate</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Your Isolated Email Sending History ({workspace?.emailHistory.length || 0})
            </h2>
            {!workspace?.emailHistory.length ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No emails sent from your account yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 uppercase">
                      <th className="py-2.5 pr-3">Timestamp</th>
                      <th className="py-2.5 px-3">From (Your Gmail)</th>
                      <th className="py-2.5 px-3">To (Recipient)</th>
                      <th className="py-2.5 px-3">Attached CV</th>
                      <th className="py-2.5 px-3">Gmail Message ID</th>
                      <th className="py-2.5 pl-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    {workspace.emailHistory.map(rec => (
                      <tr key={rec.id}>
                        <td className="py-3 pr-3 font-mono text-[11px] text-slate-500">
                          {new Date(rec.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {rec.senderGmail}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {rec.recipientEmail}
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{rec.cvFilename}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                          {rec.gmailMessageId || '—'}
                        </td>
                        <td className="py-3 pl-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              rec.status === 'sent'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ACCOUNT SETTINGS & SELF-SERVICE DELETION */}
      {activeTab === 'settings' && workspace && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-5">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            Personal Account Settings &amp; Rate Limiting
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Default Email Subject
              </label>
              <input
                type="text"
                value={subjectInput}
                onChange={e => setSubjectInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Daily Sending Limit (Max 40 recommended for Gmail safety)
              </label>
              <input
                type="number"
                value={workspace.user.dailySendLimit}
                onChange={e =>
                  setWorkspace({
                    ...workspace,
                    user: { ...workspace.user, dailySendLimit: Number(e.target.value || 40) },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={async () => {
                await updateMultiUserSettings({
                  defaultEmailSubject: subjectInput,
                  defaultCoverLetter: coverLetterInput,
                  dailySendLimit: workspace.user.dailySendLimit,
                });
                setNotice({ type: 'success', message: 'Personal settings saved.' });
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
            >
              Save Personal Settings
            </button>

            <button
              type="button"
              onClick={() =>
                setConfirmDialog({
                  title: 'Delete Your ZENVIK-AGENT Account Permanently?',
                  description:
                    'This will revoke and delete your encrypted Gmail OAuth tokens, remove your CV Gallery and application history, and deactivate your account.',
                  confirmLabel: 'Permanently Delete My Account',
                  isDanger: true,
                  onConfirm: async () => {
                    await deleteOwnMultiUserAccount();
                    setConfirmDialog(null);
                    setWorkspace(null);
                    setNotice({ type: 'info', message: 'Your account and stored tokens have been deleted.' });
                  },
                })
              }
              className="px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold text-xs cursor-pointer"
            >
              Delete My Account
            </button>
          </div>
        </div>
      )}

      {/* TAB 6: PRIVACY-PRESERVING SAAS ADMIN PANEL */}
      {activeTab === 'admin' && workspace?.user.role === 'admin' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>Multi-User SaaS Admin Panel</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Privacy-preserving administration: Monitor registered users, account status, and delivery metrics. Private Gmail OAuth tokens, inbox messages, and private CV files are strictly isolated and never exposed to administrators.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchMultiUserAdminOverview().then(setAdminData)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Metrics</span>
            </button>
          </div>

          {adminData && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838]">
                  <div className="text-slate-500">Active Users</div>
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                    {adminData.systemHealth.activeUsersCount}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838]">
                  <div className="text-slate-500">Connected Gmails</div>
                  <div className="text-xl font-extrabold text-emerald-600">
                    {adminData.systemHealth.connectedGmailCount}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838]">
                  <div className="text-slate-500">Total Emails Sent</div>
                  <div className="text-xl font-extrabold text-blue-600">
                    {adminData.systemHealth.totalEmailsSent}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838]">
                  <div className="text-slate-500">Failed / Auth Errors</div>
                  <div className="text-xl font-extrabold text-rose-600">
                    {adminData.systemHealth.totalEmailsFailed} / {adminData.systemHealth.totalAuthErrors}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 uppercase">
                      <th className="py-2.5 pr-3">User / Email</th>
                      <th className="py-2.5 px-3">Registered</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Gmail Status</th>
                      <th className="py-2.5 px-3">Sent / Failed</th>
                      <th className="py-2.5 pl-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    {adminData.users.map(u => (
                      <tr key={u.userId}>
                        <td className="py-3 pr-3">
                          <div className="font-bold text-slate-900 dark:text-white">{u.displayName}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {u.email} ({u.userId})
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              u.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : 'bg-rose-500/15 text-rose-600'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {u.gmailConnected ? (
                            <span className="text-emerald-600 font-semibold">Connected</span>
                          ) : (
                            <span className="text-slate-400">Disconnected</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {u.emailsSentCount} sent / {u.emailsFailedCount} failed
                        </td>
                        <td className="py-3 pl-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const next = u.status === 'active' ? 'suspended' : 'active';
                              await updateMultiUserAccountStatus(u.userId, { status: next });
                              const refreshed = await fetchMultiUserAdminOverview();
                              setAdminData(refreshed);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-bold cursor-pointer"
                          >
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await adminDeleteMultiUserAccount(u.userId);
                              const refreshed = await fetchMultiUserAdminOverview();
                              setAdminData(refreshed);
                            }}
                            className="px-2.5 py-1 rounded-lg text-rose-500 hover:bg-rose-500/10 text-[11px] font-bold cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Email Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Application Email Preview</h3>
              <button type="button" onClick={() => setShowPreviewModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div>
                <strong>From:</strong> {workspace?.gmailConnection.gmailAddress || 'Not connected'}
              </div>
              <div>
                <strong>To (Separate Individual Emails):</strong> {parsedRecipientList.join(', ') || 'None entered'}
              </div>
              <div>
                <strong>Subject:</strong> {subjectInput}
              </div>
              <div>
                <strong>Attached PDF CV:</strong>{' '}
                {workspace?.cvs.find(c => c.id === selectedCvId)?.fileName || 'No CV selected'}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-slate-800 whitespace-pre-wrap max-h-60 overflow-y-auto">
              {coverLetterInput}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register / Login Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {authMode === 'register' ? 'Create Isolated User Account' : 'Log In to Your ZENVIK Account'}
              </h3>
              <button type="button" onClick={() => setShowAuthModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-[#0b0d13]">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`py-2 rounded-lg text-xs font-bold ${
                  authMode === 'login' ? 'bg-white dark:bg-[#1e2436] shadow-xs' : 'text-slate-500'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`py-2 rounded-lg text-xs font-bold ${
                  authMode === 'register' ? 'bg-white dark:bg-[#1e2436] shadow-xs' : 'text-slate-500'
                }`}
              >
                Register New User
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
              {authMode === 'register' && (
                <div>
                  <label className="block font-bold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-slate-800"
                  />
                </div>
              )}
              <div>
                <label className="block font-bold mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-slate-800"
                />
              </div>
              <button
                type="submit"
                disabled={busyAction === 'auth'}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {authMode === 'register' ? 'Register & Create Workspace' : 'Log In'}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleGoogleAppLogin}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in with Google Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit User Confirmation Dialog for Mutating / Sending / Destructive Operations */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#141824] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{confirmDialog.title}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{confirmDialog.description}</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold ${
                  confirmDialog.isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
