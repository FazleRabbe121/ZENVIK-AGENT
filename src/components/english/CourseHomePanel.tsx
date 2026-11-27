import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  GraduationCap,
  Layers,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import type {
  CEFRLevel,
  EnglishBootstrapResponse,
  EnglishLearningProgress,
  EnglishSubView,
} from '../../types/englishLearning';
import { buildInterleavedReviewQueue } from '../../services/englishProgressService';

interface CourseHomePanelProps {
  bootstrap: EnglishBootstrapResponse;
  progress: EnglishLearningProgress;
  onNavigate: (subView: EnglishSubView, opts?: { level?: CEFRLevel; lessonId?: string; batchId?: string }) => void;
  onSelectLevel: (level: CEFRLevel) => void;
}

const LEVEL_DESCRIPTIONS_BN: Record<CEFRLevel, string> = {
  'Pre-A1': 'শূন্য থেকে ভিত্তি: ২৬টি অক্ষর, ধ্বনি, phonics, সংখ্যা, তারিখ ও প্রাথমিক শব্দ।',
  A1: 'দৈনন্দিন পরিচয়, সরল বাক্য, কাজ ও প্রয়োজনীয় কথোপকথন।',
  A2: 'অতীত-ভবিষ্যৎ বর্ণনা, কর্মক্ষেত্র, ভ্রমণ ও সাধারণ পরিস্থিতি সামলানো।',
  B1: 'স্বাধীনভাবে মতামত প্রকাশ, অভিজ্ঞতা বর্ণনা ও ইন্টারভিউ প্রস্তুতি।',
  B2: 'সাবলীল যুক্তি, পেশাদার আলোচনা, প্রতিবেদন ও জটিল বোঝাপড়া।',
  C1: 'সূক্ষ্ম অর্থ, আনুষ্ঠানিক ও অনানুষ্ঠানিক register, একাডেমিক ও পেশাদার দক্ষতা।',
  C2: 'উচ্চতর নিখুঁততা, বিশ্লেষণ, কৌশলগত যোগাযোগ ও সূক্ষ্ম প্রকাশভঙ্গি।',
};

export const CourseHomePanel: React.FC<CourseHomePanelProps> = ({
  bootstrap,
  progress,
  onNavigate,
  onSelectLevel,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const wordValues = Object.values(progress.words);
  const masteredWords = wordValues.filter(w => w.status === 'mastered').length;
  const reviewQueueCount = buildInterleavedReviewQueue(progress, 30).filter(
    r => r.status === 'review_needed' || new Date(r.nextReviewAt).getTime() <= Date.now()
  ).length;
  const masteredLessonsTotal = Object.values(progress.lessons).filter(l => l.mastered).length;
  const completedBatchesTotal = Object.values(progress.batches).filter(
    b => b.quizPassed && b.interviewPassed
  ).length;

  const handleContinueLearning = () => {
    if (progress.lastSession) {
      onNavigate(progress.lastSession.subView, {
        level: progress.lastSession.level || progress.currentLevel,
        lessonId: progress.lastSession.lessonId,
        batchId: progress.lastSession.batchId,
      });
      return;
    }
    onNavigate('lessons', { level: progress.currentLevel });
  };

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200/90 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  return (
    <div className="space-y-6" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Hero Banner — Clear Continue Learning + Placement CTA */}
      <section
        className={`rounded-2xl border p-6 sm:p-8 ${
          isDark
            ? 'bg-gradient-to-br from-[#1d2230] via-[#181b22] to-[#15181f] border-white/[0.09]'
            : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-sky-400">
              <GraduationCap className="w-4 h-4" />
              <span>English Zero-to-C2 Mastery Curriculum (Bengali + English)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              শূন্য থেকে C2 — ধাপে ধাপে বাস্তব ইংরেজি শিখুন
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              বাংলা ব্যাখ্যা, {bootstrap.validation.lesson_source_count}টি পাঠ,{' '}
              {bootstrap.validation.vocab_count}টি Vocabulary Master Class আইটেম (
              {bootstrap.validation.batch_count}টি ব্যাচ), {bootstrap.validation.review_test_count}টি লেভেল
              টেস্ট এবং {bootstrap.validation.interview_pack_count}টি রোল-ভিত্তিক AI ইন্টারভিউ অনুশীলন।
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleContinueLearning}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition cursor-pointer"
              >
                <span>
                  {progress.lastSession
                    ? `Continue Learning: ${progress.lastSession.labelBn}`
                    : `শেখা শুরু করুন (${progress.currentLevel})`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('placement')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 font-semibold text-sm transition cursor-pointer"
              >
                <Compass className="w-4 h-4 text-sky-300" />
                <span>{progress.placement ? 'Placement Test পুনরায় দিন' : 'Placement Test দিয়ে স্তর যাচাই করুন'}</span>
              </button>
            </div>
          </div>

          {/* Focused Summary Metrics (No pill clutter) */}
          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3.5">
              <div className="text-xs text-slate-400">বর্তমান স্তর</div>
              <div className="text-xl font-bold text-white mt-0.5">{progress.currentLevel}</div>
              <div className="text-[11px] text-sky-300 mt-0.5">
                {progress.placement ? `সুপারিশ: ${progress.placement.recommendedLevel}` : 'Pre-A1 থেকে শুরু'}
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3.5">
              <div className="text-xs text-slate-400">মাস্টার্ড শব্দ/বাক্যাংশ</div>
              <div className="text-xl font-bold text-white mt-0.5">
                {masteredWords} <span className="text-xs font-normal text-slate-400">/ {bootstrap.validation.vocab_count}</span>
              </div>
              <div className="text-[11px] text-emerald-300 mt-0.5">{completedBatchesTotal} ব্যাচ সম্পন্ন</div>
            </div>
            <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3.5">
              <div className="text-xs text-slate-400">সম্পন্ন পাঠ</div>
              <div className="text-xl font-bold text-white mt-0.5">
                {masteredLessonsTotal} <span className="text-xs font-normal text-slate-400">/ {bootstrap.validation.lesson_source_count}</span>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3.5">
              <div className="text-xs text-slate-400">রিভিউ কিউ</div>
              <div className="text-xl font-bold text-white mt-0.5">{reviewQueueCount}</div>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="text-[11px] text-amber-300 hover:underline mt-0.5 cursor-pointer"
              >
                Spaced Review খুলুন →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Study Modes */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => onNavigate('vocabulary', { level: progress.currentLevel })}
          className={`text-left rounded-2xl border p-4 transition hover:border-sky-500/50 cursor-pointer ${cardSurface}`}
        >
          <div className="flex items-center justify-between mb-2">
            <Layers className="w-5 h-5 text-sky-500" />
            <span className={`text-xs font-mono ${mutedText}`}>{bootstrap.validation.batch_count} ব্যাচ</span>
          </div>
          <div className="font-bold text-sm">Vocabulary Master Class</div>
          <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
            প্রতি ব্যাচে ৫টি আইটেম → ৫ প্রশ্নের Quiz (৮০%) → AI Interview (৮০%) → পরের ব্যাচ Unlock।
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('lessons', { level: progress.currentLevel })}
          className={`text-left rounded-2xl border p-4 transition hover:border-emerald-500/50 cursor-pointer ${cardSurface}`}
        >
          <div className="flex items-center justify-between mb-2">
            <BookOpen className="w-5 h-5 text-emerald-500" />
            <span className={`text-xs font-mono ${mutedText}`}>{bootstrap.validation.lesson_source_count} পাঠ</span>
          </div>
          <div className="font-bold text-sm">AI পূর্ণাঙ্গ বাংলা-ইংরেজি পাঠ</div>
          <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
            বাংলা ব্যাখ্যা, ১৫+ উদাহরণ, সংলাপ, ১০+ অনুশীলন, Listening TTS, Reading ও Speaking/Writing।
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('interview', { level: progress.currentLevel })}
          className={`text-left rounded-2xl border p-4 transition hover:border-violet-500/50 cursor-pointer ${cardSurface}`}
        >
          <div className="flex items-center justify-between mb-2">
            <Mic className="w-5 h-5 text-violet-500" />
            <span className={`text-xs font-mono ${mutedText}`}>{bootstrap.validation.interview_pack_count} রোল প্যাক</span>
          </div>
          <div className="font-bold text-sm">AI Interview ও কথোপকথন</div>
          <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
            Job, Bartender/Barista, Waiter, Hotel Reception, Customer Service, C1–C2 ও Daily Talk।
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('level-test', { level: progress.currentLevel })}
          className={`text-left rounded-2xl border p-4 transition hover:border-amber-500/50 cursor-pointer ${cardSurface}`}
        >
          <div className="flex items-center justify-between mb-2">
            <ClipboardCheck className="w-5 h-5 text-amber-500" />
            <span className={`text-xs font-mono ${mutedText}`}>{bootstrap.validation.total_review_questions} প্রশ্ন</span>
          </div>
          <div className="font-bold text-sm">৭টি CEFR লেভেল টেস্ট</div>
          <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
            Objective ৪০ + Writing ২০ + Speaking ২০ = ৮০ নম্বর। পাস: ৬৪/৮০ ও Writing/Speaking ১৪+।
          </p>
        </button>
      </section>

      {/* 7 CEFR Level Roadmap Cards */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              সাতটি CEFR স্তর (Pre-A1 থেকে C2)
            </h2>
            <p className={`text-xs ${mutedText}`}>
              Mastery-ভিত্তিক অগ্রগতি — কোনো নির্দিষ্ট দিনের প্রতিশ্রুতি নয়; বুঝে ও প্রয়োগ করে এগোবেন।
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('progress')}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer ${
              isDark ? 'text-sky-400' : 'text-sky-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>প্যাকেজ যাচাই রিপোর্ট ও বাংলা টুলকিট দেখুন</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bootstrap.syllabus.levels.map(lv => {
            const level = lv.level;
            const totalLessons = lv.lessons.length;
            const doneLessons = lv.lessons.filter(ls => progress.lessons[ls.lesson_id]?.mastered).length;
            const lessonPct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

            const vocabCountInLevel = bootstrap.validation.vocab_by_level[level] || 0;
            const batchesInLevelCount = Math.ceil(vocabCountInLevel / 5);
            const passedBatchesInLevel = Object.values(progress.batches).filter(
              b => b.level === level && b.quizPassed && b.interviewPassed
            ).length;

            const testRecord = progress.levelTests[level];
            const isCurrent = progress.currentLevel === level;

            return (
              <div
                key={level}
                className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition ${cardSurface} ${
                  isCurrent ? (isDark ? 'ring-1 ring-sky-400/60' : 'ring-2 ring-sky-500/40') : ''
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold tracking-tight">{level}</span>
                        <span className={`text-xs font-medium ${mutedText}`}>
                          — {lv.title_bn || lv.title}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
                        {LEVEL_DESCRIPTIONS_BN[level]}
                      </p>
                    </div>
                    {testRecord?.passed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>পাস</span>
                      </span>
                    ) : isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-500 shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>চলমান</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={mutedText}>পাঠের অগ্রগতি</span>
                      <span className="font-mono font-semibold">
                        {doneLessons}/{totalLessons} ({lessonPct}%)
                      </span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.08]' : 'bg-slate-100'}`}>
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-300"
                        style={{ width: `${lessonPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Clean tabular counts */}
                  <div
                    className={`grid grid-cols-2 gap-2 pt-2 border-t text-xs ${
                      isDark ? 'border-white/[0.07]' : 'border-slate-100'
                    }`}
                  >
                    <div>
                      <span className={mutedText}>Vocabulary ব্যাচ: </span>
                      <span className="font-semibold">
                        {passedBatchesInLevel}/{batchesInLevelCount}
                      </span>
                    </div>
                    <div>
                      <span className={mutedText}>Level Test: </span>
                      <span className="font-semibold">
                        {testRecord
                          ? `${testRecord.bestTotal}/80 ${testRecord.passed ? '(পাস)' : '(চলমান)'}`
                          : 'বাকি'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLevel(level);
                      onNavigate('lessons', { level });
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isDark
                        ? 'bg-white text-slate-950 hover:bg-zinc-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    পাঠ খুলুন
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLevel(level);
                      onNavigate('vocabulary', { level });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      isDark
                        ? 'border-white/15 hover:bg-white/[0.06] text-zinc-200'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    ব্যাচ ({vocabCountInLevel})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLevel(level);
                      onNavigate('level-test', { level });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      isDark
                        ? 'border-white/15 hover:bg-white/[0.06] text-zinc-200'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    টেস্ট
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Honest Academic Disclaimer */}
      <section
        className={`rounded-2xl border p-4 text-xs leading-relaxed flex items-start gap-3 ${
          isDark
            ? 'bg-white/[0.03] border-white/[0.08] text-zinc-400'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <RotateCcw className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
        <div>
          <strong className={isDark ? 'text-zinc-200' : 'text-slate-800'}>শেখার নীতিমালা:</strong> CEFR
          কোনো নির্দিষ্ট শব্দসংখ্যা বাধ্যতামূলক করে না এবং C2 মানে native-speaker হওয়া নয়। প্রতিটি Quiz,
          AI Interview ও Level Test যতবার খুশি retake করা যাবে; ভুল উত্তরগুলো স্বয়ংক্রিয়ভাবে Spaced
          Repetition রিভিউ কিউতে যুক্ত হবে।
        </div>
      </section>
    </div>
  );
};
