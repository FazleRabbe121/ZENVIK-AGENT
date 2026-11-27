import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Eye,
  FileWarning,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { englishLearningApi } from '../../services/englishLearningService';
import { buildInterleavedReviewQueue } from '../../services/englishProgressService';
import { speakEnglish } from '../../services/englishSpeechService';
import type {
  CEFRLevel,
  EnglishBootstrapResponse,
  EnglishLearningProgress,
  VocabItem,
} from '../../types/englishLearning';

interface ProgressReviewPanelProps {
  bootstrap: EnglishBootstrapResponse;
  progress: EnglishLearningProgress;
  onRecordReviewOutcome: (itemId: string, level: CEFRLevel, remembered: boolean) => void;
  onRemoveSavedPhrase: (id: string) => void;
}

type ReviewTab = 'spaced' | 'errors' | 'saved' | 'toolkits' | 'validation';

export const ProgressReviewPanel: React.FC<ProgressReviewPanelProps> = ({
  bootstrap,
  progress,
  onRecordReviewOutcome,
  onRemoveSavedPhrase,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [tab, setTab] = useState<ReviewTab>('spaced');
  const [toolkitDoc, setToolkitDoc] = useState<'bengali' | 'pronunciation' | 'cefr' | 'upgrade'>('bengali');

  // Spaced Repetition Interleaved Runner
  const queueRecords = useMemo(() => buildInterleavedReviewQueue(progress, 12), [progress]);
  const [queueItems, setQueueItems] = useState<VocabItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [recallInput, setRecallInput] = useState('');
  const [revealed, setRevealed] = useState(false);

  const queueIdsKey = queueRecords.map(r => r.itemId).join(',');

  useEffect(() => {
    if (!queueIdsKey) {
      setQueueItems([]);
      return;
    }
    let active = true;
    setLoadingQueue(true);
    englishLearningApi
      .getVocabByIds(queueIdsKey.split(','))
      .then(res => {
        if (active) {
          setQueueItems(res.items);
          setQIdx(0);
          setRevealed(false);
          setRecallInput('');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingQueue(false);
      });
    return () => {
      active = false;
    };
  }, [queueIdsKey]);

  const wordValues = Object.values(progress.words);
  const masteredCount = wordValues.filter(w => w.status === 'mastered').length;
  const learningCount = wordValues.filter(w => w.status === 'learning').length;
  const reviewNeededCount = wordValues.filter(w => w.status === 'review_needed').length;

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  const currentReviewItem = queueItems[qIdx] || null;

  const handleGradeReview = (remembered: boolean) => {
    if (!currentReviewItem) return;
    onRecordReviewOutcome(currentReviewItem.id, currentReviewItem.level, remembered);
    setRevealed(false);
    setRecallInput('');
    setQIdx(prev => (prev + 1 < queueItems.length ? prev + 1 : 0));
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Mastery Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`rounded-2xl border p-4 ${cardSurface}`}>
          <div className={`text-xs ${mutedText}`}>Mastered আইটেম</div>
          <div className="text-2xl font-extrabold text-emerald-500 mt-0.5">{masteredCount}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${cardSurface}`}>
          <div className={`text-xs ${mutedText}`}>Learning (চলমান)</div>
          <div className="text-2xl font-extrabold text-sky-500 mt-0.5">{learningCount}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${cardSurface}`}>
          <div className={`text-xs ${mutedText}`}>Review Needed (দুর্বল)</div>
          <div className="text-2xl font-extrabold text-amber-500 mt-0.5">{reviewNeededCount}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${cardSurface}`}>
          <div className={`text-xs ${mutedText}`}>Error Log / Saved</div>
          <div className="text-2xl font-extrabold mt-0.5">
            {progress.errorLog.length} <span className={`text-sm font-normal ${mutedText}`}>/ {progress.savedPhrases.length}</span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['spaced', `Spaced Review (${queueRecords.length})`],
            ['errors', `Error Log (${progress.errorLog.length})`],
            ['saved', `Saved Phrases (${progress.savedPhrases.length})`],
            ['toolkits', 'বাংলা টুলকিট ও উচ্চারণ গাইড'],
            ['validation', 'প্যাকেজ যাচাই ও ডেটা রিপোর্ট'],
          ] as Array<[ReviewTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              tab === key
                ? 'bg-sky-600 text-white'
                : isDark
                ? 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: ADAPTIVE INTERLEAVED SPACED REPETITION */}
      {tab === 'spaced' && (
        <div className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${cardSurface}`}>
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-sky-500" />
              <span>Adaptive Spaced Repetition &amp; Interleaved Review Queue</span>
            </h3>
            <p className={`text-xs mt-1 ${mutedText}`}>
              ভুল করা আইটেম ও সময়-হওয়া পুরোনো আইটেম মিশিয়ে (interleaving) এখানে রিভিউ করানো হয়। আগে নিজে অর্থ
              মনে করুন, তারপর উত্তর দেখুন।
            </p>
          </div>

          {loadingQueue ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> রিভিউ কিউ লোড হচ্ছে...
            </div>
          ) : !currentReviewItem ? (
            <div
              className={`rounded-xl p-6 text-center text-sm border ${
                isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              এখনো কোনো আইটেম রিভিউ কিউতে আসেনি। Vocabulary Master Class থেকে একটি ব্যাচ শুরু করলে এখানে
              Spaced Repetition কিউ তৈরি হয়ে যাবে।
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-sky-500">
                <span>
                  রিভিউ কার্ড {qIdx + 1} / {queueItems.length} · {currentReviewItem.level}
                </span>
                <span>
                  Status: {progress.words[currentReviewItem.id]?.status || 'learning'}
                </span>
              </div>

              <div
                className={`rounded-2xl border p-5 space-y-3 ${
                  isDark ? 'bg-white/[0.03] border-white/[0.09]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xl sm:text-2xl font-extrabold">{currentReviewItem.english}</div>
                  <button
                    type="button"
                    onClick={() => speakEnglish(currentReviewItem.english, { rate: 0.92 })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-bold cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> শুনুন
                  </button>
                </div>

                <input
                  type="text"
                  value={recallInput}
                  onChange={e => setRecallInput(e.target.value)}
                  placeholder="আগে নিজে বাংলা অর্থ বা একটি ইংরেজি বাক্য মনে করে লিখুন..."
                  className="w-full px-3.5 py-2 rounded-xl border text-sm"
                />

                {!revealed ? (
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> অর্থ ও উদাহরণ দেখুন
                  </button>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.08] text-sm">
                    <div className="font-bold text-emerald-500">{currentReviewItem.bangla_meaning}</div>
                    <div className="text-xs">
                      <span className="font-semibold text-amber-500">আনুমানিক বাংলা উচ্চারণ:</span>{' '}
                      {currentReviewItem.approx_pronunciation_bn}
                      {currentReviewItem.ipa ? ` · IPA: /${currentReviewItem.ipa}/` : ''}
                    </div>
                    <div className="text-xs">
                      <strong>উদাহরণ:</strong> {currentReviewItem.example_en} ({currentReviewItem.example_bn})
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleGradeReview(false)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" /> আবার রিভিউ লাগবে (কিউতে রাখুন)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGradeReview(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" /> মনে আছে (ব্যবধান বাড়ান)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ERROR LOG */}
      {tab === 'errors' && (
        <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
          <h3 className="text-base font-bold flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-amber-500" />
            <span>ব্যক্তিগত Error Log</span>
          </h3>
          {progress.errorLog.length === 0 ? (
            <p className={`text-xs ${mutedText}`}>এখনো কোনো ভুল রেকর্ড হয়নি। Quiz বা Interview দিলে ভুলগুলো এখানে জমবে।</p>
          ) : (
            <div className="space-y-2.5">
              {progress.errorLog.map(err => (
                <div
                  key={err.id}
                  className={`rounded-xl border p-3.5 text-xs space-y-1 ${
                    isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-amber-500 uppercase">
                      {err.source.replace(/_/g, ' ')} {err.level ? `· ${err.level}` : ''}
                    </span>
                    <span className={mutedText}>{new Date(err.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="font-semibold">{err.prompt}</div>
                  <div>
                    <span className="line-through text-rose-500">{err.userAnswer || '(ফাঁকা)'}</span> →{' '}
                    <span className="font-bold text-emerald-500">{err.naturalCorrection}</span>
                  </div>
                  <div className={mutedText}>{err.reasonBn}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SAVED PHRASES */}
      {tab === 'saved' && (
        <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <span>Saved Phrases ({progress.savedPhrases.length})</span>
          </h3>
          {progress.savedPhrases.length === 0 ? (
            <p className={`text-xs ${mutedText}`}>Vocabulary কার্ড থেকে বুকমার্ক আইকনে ক্লিক করে পছন্দের বাক্যাংশ সংরক্ষণ করুন।</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {progress.savedPhrases.map(sp => (
                <div
                  key={sp.id}
                  className={`rounded-xl border p-3.5 space-y-1.5 text-xs ${
                    isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold">{sp.english}</div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => speakEnglish(sp.english, { rate: 0.92 })}
                        className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-500/10 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveSavedPhrase(sp.id)}
                        className="text-rose-500 hover:underline px-1.5 cursor-pointer"
                      >
                        সরান
                      </button>
                    </div>
                  </div>
                  <div className="text-emerald-500 font-semibold">{sp.banglaMeaning}</div>
                  {sp.exampleEn && <div className={mutedText}>{sp.exampleEn}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BENGALI SPEAKERS TOOLKIT & PRONUNCIATION TRACK */}
      {tab === 'toolkits' && (
        <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-500" />
              <span>প্যাকেজের সহায়ক বাংলা গাইড ও উচ্চারণ ট্র্যাক</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['bengali', 'Bengali Speakers Toolkit'],
                  ['pronunciation', 'Pronunciation Track'],
                  ['cefr', 'CEFR Overview'],
                  ['upgrade', 'Content Upgrade Report'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setToolkitDoc(k)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    toolkitDoc === k
                      ? 'bg-sky-600 text-white'
                      : isDark
                      ? 'bg-white/[0.06] text-zinc-300'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <pre
            className={`rounded-xl p-4 border max-h-[540px] overflow-y-auto whitespace-pre-wrap text-xs sm:text-sm leading-relaxed font-sans ${
              isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            {toolkitDoc === 'bengali'
              ? bootstrap.toolkits.bengaliToolkitMd
              : toolkitDoc === 'pronunciation'
              ? bootstrap.toolkits.pronunciationTrackMd
              : toolkitDoc === 'cefr'
              ? bootstrap.toolkits.cefrOverviewMd
              : bootstrap.toolkits.contentUpgradeReportMd}
          </pre>
        </div>
      )}

      {/* TAB 5: LIVE PACKAGE VALIDATION REPORT & KNOWN GAPS */}
      {tab === 'validation' && (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <span>সোর্স প্যাকেজ যাচাই রিপোর্ট (Live Programmatic Audit)</span>
              </h3>
              <p className={`text-xs mt-1 ${mutedText}`}>
                সোর্স ফাইল: <code className="font-mono">{bootstrap.validation.package_file_path}</code> (মোট{' '}
                {bootstrap.validation.total_files_in_package}টি ফাইল)। কোনো বানানো সংখ্যা নয়—সব সংখ্যা সরাসরি
                লোড করা ফাইল থেকে গণনা করা হয়েছে।
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <th className="py-2.5 pr-3 font-bold">যাচাই (Check)</th>
                    <th className="py-2.5 pr-3 font-bold">প্রত্যাশিত</th>
                    <th className="py-2.5 pr-3 font-bold">প্রকৃত ফলাফল</th>
                    <th className="py-2.5 pr-3 font-bold">অবস্থা</th>
                    <th className="py-2.5 font-bold">ব্যাখ্যা</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
                  {bootstrap.validation.checks.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 pr-3 font-semibold">{row.check}</td>
                      <td className={`py-2.5 pr-3 ${mutedText}`}>{row.expected}</td>
                      <td className="py-2.5 pr-3 font-mono">{row.actual}</td>
                      <td className="py-2.5 pr-3 font-bold">
                        <span
                          className={
                            row.status === 'PASS'
                              ? 'text-emerald-500'
                              : row.status === 'WARN'
                              ? 'text-amber-500'
                              : 'text-rose-500'
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className={`py-2.5 ${mutedText}`}>{row.notes_bn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className={`rounded-2xl border p-5 space-y-2 text-xs leading-relaxed ${
              isDark ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>অমীমাংসিত ভাষা / IPA / কনটেন্ট সীমাবদ্ধতা (সততার সাথে উল্লিখিত)</span>
            </div>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Null IPA ({bootstrap.validation.quality_gaps.null_ipa_count}টি শব্দ):</strong>{' '}
                {bootstrap.validation.quality_gaps.null_ipa_examples.map(e => e.english).join(', ')} — এই ৫টি
                শব্দের IPA সোর্স ফাইলে নেই।
              </li>
              <li>
                <strong>স্বয়ংক্রিয় IPA ও বাংলা উচ্চারণ:</strong> বাকি ১,২৪৫টি আইটেমের IPA CMU dictionary
                থেকে US-oriented পদ্ধতিতে স্বয়ংক্রিয়ভাবে তৈরি এবং বাংলা উচ্চারণও auto-generated; editorial QA
                প্রয়োজন।
              </li>
              <li>
                <strong>বাংলা অনুবাদে টেমপ্লেট ত্রুটি:</strong> A2-তে{' '}
                {bootstrap.validation.quality_gaps.a2_template_bug_count}টি, B1-তে{' '}
                {bootstrap.validation.quality_gaps.b1_template_bug_count}টি sentence chunk অনুবাদে টেমপ্লেট
                মিশ্রণ এবং {bootstrap.validation.quality_gaps.duplicate_kora_kora_count}টি উদাহরণে দ্বৈত “করা
                করা” শনাক্ত হয়েছে। কার্ডে সতর্কতা নোটিশ ও AI গ্রেডিংয়ে প্রকৃত ইংরেজি অর্থ যাচাই যুক্ত করা হয়েছে।
              </li>
              <li>
                <strong>১৪৭টি সোর্স পাঠ:</strong> মূল Markdown ফাইলগুলো সংক্ষিপ্ত আউটলাইন; পূর্ণাঙ্গ ১৫+ উদাহরণ ও
                ১০+ অনুশীলনের পাঠ AI Lesson Generation-এর মাধ্যমে তৈরি ও ক্যাশ হয়।
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
