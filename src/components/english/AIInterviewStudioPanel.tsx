import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { englishLearningApi } from '../../services/englishLearningService';
import {
  speakEnglish,
  stopSpeaking,
  startEnglishSpeechRecognition,
  SpeechRecognizerHandle,
} from '../../services/englishSpeechService';
import type {
  CEFRLevel,
  InterviewPackPublic,
  RoleInterviewEvaluation,
} from '../../types/englishLearning';

interface AIInterviewStudioPanelProps {
  currentLevel: CEFRLevel;
  onLogCorrections: (
    role: string,
    prompt: string,
    userAnswer: string,
    corrections: Array<{ original: string; natural: string; reason_bn: string }>
  ) => void;
}

const INTERVIEW_ROLES = [
  { id: 'general_job_interview', labelBn: 'সাধারণ চাকরির ইন্টারভিউ', labelEn: 'General Job Interview' },
  { id: 'bartender_barista', labelBn: 'বারটেন্ডার ও বারিস্তা', labelEn: 'Bartender & Barista' },
  { id: 'waiter_restaurant', labelBn: 'ওয়েটার ও রেস্তোরাঁ', labelEn: 'Waiter & Restaurant' },
  { id: 'hotel_reception', labelBn: 'হোটেল রিসেপশন', labelEn: 'Hotel Reception' },
  { id: 'customer_service', labelBn: 'কাস্টমার সার্ভিস', labelEn: 'Customer Service' },
  { id: 'advanced_discussion', labelBn: 'উচ্চতর আলোচনা (C1–C2)', labelEn: 'Advanced Discussion' },
  { id: 'daily_conversation', labelBn: 'দৈনন্দিন কথোপকথন', labelEn: 'Daily Conversation' },
];

const DAILY_PROMPTS = [
  {
    id: 'DAILY-01',
    question_en: 'Could you tell me about your typical day from morning to evening?',
    question_bn: 'সকাল থেকে সন্ধ্যা পর্যন্ত আপনার সাধারণ দিনটি কীভাবে কাটে বলুন।',
    follow_up_prompt_en: 'Which part of your day do you enjoy the most and why?',
    follow_up_prompt_bn: 'দিনের কোন সময়টি আপনার সবচেয়ে ভালো লাগে এবং কেন?',
    evaluation_criteria: ['relevance', 'clarity', 'grammar', 'vocabulary', 'fluency'],
  },
  {
    id: 'DAILY-02',
    question_en: 'Imagine you are at a café or restaurant. How would you politely order food and ask about allergies?',
    question_bn: 'ধরুন আপনি একটি ক্যাফে বা রেস্তোরাঁয় আছেন। ভদ্রভাবে খাবার অর্ডার করবেন ও অ্যালার্জি সম্পর্কে জানতে চাইবেন কীভাবে?',
    follow_up_prompt_en: 'What would you say if the wrong dish arrived?',
    follow_up_prompt_bn: 'ভুল খাবার এলে আপনি ভদ্রভাবে কী বলবেন?',
    evaluation_criteria: ['relevance', 'clarity', 'grammar', 'vocabulary', 'fluency'],
  },
  {
    id: 'DAILY-03',
    question_en: 'Describe a problem you solved recently at work or in daily life.',
    question_bn: 'সম্প্রতি কাজে বা দৈনন্দিন জীবনে আপনি যে একটি সমস্যার সমাধান করেছেন তা বর্ণনা করুন।',
    follow_up_prompt_en: 'What did you learn from that experience?',
    follow_up_prompt_bn: 'ওই অভিজ্ঞতা থেকে আপনি কী শিখেছেন?',
    evaluation_criteria: ['relevance', 'clarity', 'grammar', 'vocabulary', 'fluency'],
  },
];

export const AIInterviewStudioPanel: React.FC<AIInterviewStudioPanelProps> = ({
  currentLevel,
  onLogCorrections,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [selectedRole, setSelectedRole] = useState('general_job_interview');
  const [pack, setPack] = useState<InterviewPackPublic | null>(null);
  const [loading, setLoading] = useState(false);
  const [qIndex, setQIndex] = useState(0);

  const [userAnswer, setUserAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<RoleInterviewEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const sttRef = useRef<SpeechRecognizerHandle | null>(null);

  useEffect(() => {
    let active = true;
    stopSpeaking();
    sttRef.current?.stop();
    setIsRecording(false);
    setQIndex(0);
    setUserAnswer('');
    setEvaluation(null);
    setError(null);

    if (selectedRole === 'daily_conversation') {
      setPack({
        role: 'daily_conversation',
        title_bn: 'দৈনন্দিন কথোপকথন',
        title_en: 'Daily Conversation',
        question_count: DAILY_PROMPTS.length,
        questions: DAILY_PROMPTS,
      });
      return;
    }

    setLoading(true);
    englishLearningApi
      .getInterviewPack(selectedRole)
      .then(res => {
        if (active) setPack(res);
      })
      .catch(err => {
        if (active) setError(err?.message || 'ইন্টারভিউ প্যাক লোড করা যায়নি।');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      stopSpeaking();
      sttRef.current?.stop();
    };
  }, [selectedRole]);

  const currentQuestion = pack?.questions[qIndex] || null;

  const toggleMic = () => {
    if (isRecording) {
      sttRef.current?.stop();
      setIsRecording(false);
      return;
    }
    setMicMsg(null);
    const handle = startEnglishSpeechRecognition({
      onTranscript: (finalText, interim) => {
        setUserAnswer((finalText + (interim ? ' ' + interim : '')).trim());
      },
      onError: msg => {
        setMicMsg(msg);
        setIsRecording(false);
      },
      onEnd: () => setIsRecording(false),
    });
    if (handle) {
      sttRef.current = handle;
      setIsRecording(true);
    }
  };

  const handleEvaluate = async () => {
    if (!currentQuestion || !userAnswer.trim()) return;
    sttRef.current?.stop();
    setIsRecording(false);
    setEvaluating(true);
    setError(null);

    try {
      const res = await englishLearningApi.evaluateRoleInterview({
        role: selectedRole,
        questionId: currentQuestion.id,
        customPromptEn: currentQuestion.question_en,
        userAnswer: userAnswer.trim(),
        level: currentLevel,
      });
      setEvaluation(res);
      if (res.priority_corrections.length > 0) {
        onLogCorrections(selectedRole, currentQuestion.question_en, userAnswer.trim(), res.priority_corrections);
      }
    } catch (err: any) {
      setError(err?.message || 'মূল্যায়ন করা যায়নি।');
    } finally {
      setEvaluating(false);
    }
  };

  const goToQuestion = (nextIdx: number) => {
    stopSpeaking();
    setQIndex(nextIdx);
    setUserAnswer('');
    setEvaluation(null);
    setError(null);
  };

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  return (
    <div className="space-y-5 max-w-4xl mx-auto" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Role Selector */}
      <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-500">
            <MessageSquare className="w-4 h-4" />
            <span>AI Interview Mode (6 Supplied Role Packs + Daily Talk)</span>
          </div>
          <h2 className="text-xl font-bold mt-0.5">রোল-ভিত্তিক AI ইন্টারভিউ অনুশীলন</h2>
          <p className={`text-xs mt-1 ${mutedText}`}>
            আগে নিজে ইংরেজিতে উত্তর দিন (মুখে বা লিখে)। আপনার চেষ্টার পরই AI বাংলা ফিডব্যাক, সংশোধন, Rubric স্কোর
            ও Model Answer দেখাবে।
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {INTERVIEW_ROLES.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRole(r.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                selectedRole === r.id
                  ? 'bg-violet-600 text-white border-violet-600'
                  : isDark
                  ? 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {r.labelBn}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
          <span className={mutedText}>ইন্টারভিউ প্যাক লোড হচ্ছে...</span>
        </div>
      ) : pack && currentQuestion ? (
        <div className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${cardSurface}`}>
          {/* Question Stepper */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono font-bold text-violet-500">
              {pack.title_en} · প্রশ্ন {qIndex + 1} / {pack.questions.length}
            </div>
            <div className="flex items-center gap-1.5">
              {pack.questions.map((q, idx) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => goToQuestion(idx)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold cursor-pointer ${
                    idx === qIndex
                      ? 'bg-violet-600 text-white'
                      : isDark
                      ? 'bg-white/[0.06] text-zinc-400 hover:text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Question Box */}
          <div
            className={`rounded-2xl border p-5 space-y-2 ${
              isDark ? 'bg-violet-950/20 border-violet-500/25' : 'bg-violet-50/70 border-violet-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-base sm:text-lg font-bold leading-snug">
                  “{currentQuestion.question_en}”
                </div>
                <div className={`text-xs sm:text-sm ${mutedText}`}>{currentQuestion.question_bn}</div>
              </div>
              <button
                type="button"
                onClick={() => speakEnglish(currentQuestion.question_en, { rate: 0.92 })}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
              >
                <Volume2 className="w-4 h-4" /> শুনুন
              </button>
            </div>
          </div>

          {/* Learner Answer Input */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold">আপনার উত্তর (ইংরেজিতে বলুন বা লিখুন)</label>
              <button
                type="button"
                onClick={toggleMic}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  isRecording ? 'bg-rose-600 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isRecording ? 'মাইক্রোফোন বন্ধ' : 'মুখে উত্তর দিন'}</span>
              </button>
            </div>

            {micMsg && <div className="text-xs text-amber-500">{micMsg}</div>}

            <textarea
              rows={4}
              value={userAnswer}
              onChange={e => setUserAnswer(e.target.value)}
              placeholder="আগে নিজের ভাষায় উত্তর দিন... জমা দেওয়ার আগে Model Answer লুকানো থাকবে।"
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
            />

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setUserAnswer('');
                  setEvaluation(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" /> আবার চেষ্টা
              </button>

              <button
                type="button"
                disabled={evaluating || !userAnswer.trim()}
                onClick={handleEvaluate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{evaluating ? 'AI মূল্যায়ন করছে...' : 'জমা দিন ও মূল্যায়ন দেখুন'}</span>
              </button>
            </div>
          </div>

          {error && <div className="text-xs text-rose-500 font-medium">{error}</div>}

          {/* Post-Attempt AI Evaluation + Model Answer */}
          {evaluation && (
            <div className="space-y-4 pt-2 border-t border-slate-200/70 dark:border-white/[0.08]">
              <div
                className={`rounded-2xl border p-4 space-y-2 ${
                  evaluation.rubric.passed
                    ? isDark
                      ? 'bg-emerald-950/30 border-emerald-500/30'
                      : 'bg-emerald-50 border-emerald-200'
                    : isDark
                    ? 'bg-amber-950/30 border-amber-500/30'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  {evaluation.rubric.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-amber-500" />
                  )}
                  <span>
                    স্কোর: {evaluation.rubric.total}/20 ({evaluation.rubric.percent}%) —{' '}
                    {evaluation.rubric.passed ? 'শক্তিশালী উত্তর (৮০%+)' : 'আরও একটু অনুশীলন করুন'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">{evaluation.feedback_bn}</p>
              </div>

              {/* 5-Criterion Rubric */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {[
                  ['Relevance', evaluation.rubric.meaning_or_relevance],
                  ['Clarity', evaluation.rubric.contextual_use_or_clarity],
                  ['Grammar', evaluation.rubric.grammar],
                  ['Intelligibility', evaluation.rubric.pronunciation_intelligibility],
                  ['Fluency', evaluation.rubric.fluency],
                ].map(([label, score]) => (
                  <div key={String(label)} className={`rounded-xl p-3 border ${cardSurface}`}>
                    <div className={mutedText}>{label}</div>
                    <div className="text-base font-bold mt-0.5">{score}/4</div>
                  </div>
                ))}
              </div>

              {evaluation.priority_corrections.length > 0 && (
                <div className={`rounded-xl p-4 border space-y-2 text-xs ${cardSurface}`}>
                  <div className="font-bold text-amber-500">গুরুত্বপূর্ণ সংশোধন (সর্বোচ্চ ৩টি)</div>
                  <ul className="space-y-1.5">
                    {evaluation.priority_corrections.map((c, idx) => (
                      <li key={idx}>
                        <span className="line-through text-rose-500">{c.original}</span> →{' '}
                        <span className="font-bold text-emerald-500">{c.natural}</span> — {c.reason_bn}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.natural_version_en && (
                <div className={`rounded-xl p-4 border space-y-1 text-xs sm:text-sm ${cardSurface}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-500">আপনার উত্তরের আরও স্বাভাবিক ইংরেজি রূপ</span>
                    <button
                      type="button"
                      onClick={() => speakEnglish(evaluation.natural_version_en, { rate: 0.92 })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> শুনুন
                    </button>
                  </div>
                  <div className="font-medium">{evaluation.natural_version_en}</div>
                </div>
              )}

              {evaluation.model_answer_en && (
                <div
                  className={`rounded-xl p-4 border space-y-1.5 text-xs sm:text-sm ${
                    isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-500">Model Answer (আপনার চেষ্টার পর দেখানো হলো)</span>
                    <button
                      type="button"
                      onClick={() => speakEnglish(evaluation.model_answer_en, { rate: 0.92 })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> শুনুন
                    </button>
                  </div>
                  <div className="font-semibold">{evaluation.model_answer_en}</div>
                  <div className={mutedText}>{evaluation.model_answer_bn}</div>
                </div>
              )}

              {/* Follow-up prompt & Next Question */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs">
                  <strong className="text-violet-500">Follow-up:</strong> {evaluation.follow_up_en}{' '}
                  <span className={mutedText}>({evaluation.follow_up_bn})</span>
                </div>
                {qIndex < pack.questions.length - 1 && (
                  <button
                    type="button"
                    onClick={() => goToQuestion(qIndex + 1)}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
                  >
                    পরের প্রশ্ন ({qIndex + 2}/{pack.questions.length}) →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
