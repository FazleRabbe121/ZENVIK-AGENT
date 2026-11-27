import React, { useState } from 'react';
import {
  Inbox,
  RefreshCw,
  Sparkles,
  Mail,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  isGuestSessionActive,
  fetchGmailReplies,
  connectPersonalGmailViaPopupOrBackend,
} from '../services/multiUserService';

interface EmployerReplyItem {
  id: string;
  company: string;
  position: string;
  date: string;
  category: 'interview' | 'inforequest' | 'acknowledgement';
  subject: string;
  snippet: string;
  senderEmail: string;
}

function classifyReplyCategory(subject: string, snippet: string): 'interview' | 'inforequest' | 'acknowledgement' {
  const combined = `${subject} ${snippet}`.toLowerCase();
  if (/interview|schedule|meeting|video call|teams|zoom|availability|invite/.test(combined)) {
    return 'interview';
  }
  if (/question|confirm|document|visa|passport|details|info|clarify|right to work/.test(combined)) {
    return 'inforequest';
  }
  return 'acknowledgement';
}

export const EmployerRepliesView: React.FC = () => {
  const { theme } = useTheme();
  const isGuestMode = isGuestSessionActive();

  const [replies, setReplies] = useState<EmployerReplyItem[]>([]);
  const [filterCategory, setFilterCategory] = useState<'all' | 'interview' | 'inforequest' | 'acknowledgement'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [needsReadonlyScope, setNeedsReadonlyScope] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSyncGmail = async () => {
    if (isGuestMode) {
      setErrorBanner('Guest Preview sessions cannot read private Gmail inboxes. Sign Up to connect your own Gmail account.');
      return;
    }
    setIsRefreshing(true);
    setErrorBanner(null);
    setNeedsReadonlyScope(false);
    try {
      const res = await fetchGmailReplies(20);
      const mapped: EmployerReplyItem[] = (res.replies || []).map(item => {
        const senderMatch = item.from.match(/<([^>]+)>/);
        const senderEmail = senderMatch ? senderMatch[1] : item.from;
        const companyName = item.from.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || senderEmail;
        return {
          id: item.id,
          company: companyName,
          position: 'Employer Reply',
          date: item.date || 'Recent',
          category: classifyReplyCategory(item.subject || '', item.snippet || ''),
          subject: item.subject || '(No Subject)',
          snippet: item.snippet || '',
          senderEmail,
        };
      });
      setReplies(mapped);
      showToast(
        mapped.length > 0
          ? `Synchronized ${mapped.length} live message(s) from ${res.gmailAddress || 'your personal Gmail'}.`
          : `Connected to ${res.gmailAddress || 'your Gmail'} — no recent employer replies found.`
      );
    } catch (err: any) {
      const msg = err?.message || 'Could not sync Gmail replies.';
      setErrorBanner(msg);
      if (msg.toLowerCase().includes('readonly') || msg.toLowerCase().includes('scope') || msg.toLowerCase().includes('permission')) {
        setNeedsReadonlyScope(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGrantReadonlyScope = async () => {
    setIsRefreshing(true);
    setErrorBanner(null);
    try {
      await connectPersonalGmailViaPopupOrBackend({ includeReadReplies: true });
      setNeedsReadonlyScope(false);
      await handleSyncGmail();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Could not authorize gmail.readonly scope.');
      setIsRefreshing(false);
    }
  };

  const filtered = replies.filter(r => (filterCategory === 'all' ? true : r.category === filterCategory));

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-blue-500/50 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-500 flex items-center justify-center font-bold">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Employer Replies &amp; Live Inbox</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Private per-user Gmail synchronization · Requires optional <code className="font-mono">gmail.readonly</code> scope
              </p>
            </div>
          </div>

          {!isGuestMode && (
            <button
              type="button"
              onClick={handleSyncGmail}
              disabled={isRefreshing}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Syncing Personal Gmail...' : 'Sync Gmail Replies'}</span>
            </button>
          )}
        </div>

        {/* Category Filters */}
        {!isGuestMode && (
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1 no-scrollbar border-t border-slate-200/80 dark:border-slate-800/60 pt-4">
            {[
              { id: 'all' as const, label: `All Responses (${replies.length})` },
              { id: 'interview' as const, label: 'Interview Invitations' },
              { id: 'inforequest' as const, label: 'Information Requests' },
              { id: 'acknowledgement' as const, label: 'Confirmations & Receipts' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterCategory(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                  filterCategory === tab.id
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-100 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Guest Privacy Guard */}
      {isGuestMode ? (
        <div className="p-8 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
            Private Inbox Access Blocked in Guest Mode
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
            For strict security and privacy, Guest Preview sessions can never access the platform owner&apos;s Gmail inbox or any registered user&apos;s replies. Sign up for your own independent account to connect your personal Gmail.
          </p>
        </div>
      ) : (
        <>
          {errorBanner && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>{errorBanner}</span>
              </div>
              {needsReadonlyScope && (
                <button
                  type="button"
                  onClick={handleGrantReadonlyScope}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 cursor-pointer"
                >
                  Enable Reply Tracking (gmail.readonly)
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div
              className={`p-8 rounded-3xl border text-center space-y-2 ${
                theme === 'dark' ? 'bg-[#101625] border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              <Mail className="w-8 h-8 mx-auto opacity-50" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">No Synced Replies Yet</div>
              <p className="text-xs max-w-md mx-auto">
                Click &ldquo;Sync Gmail Replies&rdquo; above to fetch real employer messages from your own connected Gmail account (requires optional <code className="font-mono">gmail.readonly</code> permission).
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(rep => (
                <div
                  key={rep.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    theme === 'dark' ? 'bg-[#101625] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{rep.company}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                        {rep.category === 'interview'
                          ? 'Interview Invitation'
                          : rep.category === 'inforequest'
                          ? 'Information Request'
                          : 'Confirmation / Reply'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{rep.date}</span>
                  </div>
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1">{rep.subject}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{rep.snippet}</p>
                  <div className="text-[11px] text-slate-400 font-mono mt-2">From: {rep.senderEmail}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
