import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
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
  EnglishLearningProgress,
  ReviewTestPublic,
  ReviewTestEvaluationResult,
} from '../../types/englishLearning';
import { CEFR_LEVELS } from '../../types/englishLearning';

interface LevelReviewTestPanelProps {
  selectedLevel: CEFRLevel;
  progress: EnglishLearningProgress;
  onChangeLevel: (level: CEFRLevel) => void;
  onTestEvaluated: (result: ReviewTestEvaluationResult) => void;
}

const SECTION_LABELS_BN: Record<string, string> = {
  grammar: 'Grammar (১৫ প্রশ্ন)',
  vocabulary: 'Vocabulary (১০ প্রশ্ন)',
  language_use: 'Language Use (৫ প্রশ্ন)',
  reading: 'Reading Comprehension (৫ প্রশ্ন)',
  listening: 'Listening Comprehension (৫ প্রশ্ন)',
};

export const LevelReviewTestPanel: React.FC<LevelReviewTestPanelProps> = ({
  selectedLevel,
  progress,
  onChangeLevel,
  onTestEvaluated,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [test, setTest] = useState<ReviewTestPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [writingText, setWritingText] = useState('');
  const [speakingText, setSpeakingText] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReviewTestEvaluationResult | null>(null);

  const [isMicOn, setIsMicOn] = useState(false);
  const sttRef = useRef<SpeechRecognizerHandle | null>(null);

  useEffect(() => {
    let active = true;
    stopSpeaking();
    sttRef.current?.stop();
    setIsMicOn(false);
    setLoading(true);
    setError(null);
    setAnswers({});
    setWritingText('');
    setSpeakingText('');
    setResult(null);

    englishLearningApi
      .getReviewTest(selectedLevel)
      .then(res => {
        if (active) setTest(res);
      })
      .catch(err => {
        if (active) setError(err?.message || 'লেভেল টেস্ট লোড করা যায়নি।');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      stopSpeaking();
      sttRef.current?.stop();
    };
  }, [selectedLevel]);

  const sections = useMemo(() => {
    if (!test) return [];
    const order = ['grammar', 'vocabulary', 'language_use', 'reading', 'listening'] as const;
    return order
      .map(sec => ({
        key: sec,
        label: SECTION_LABELS_BN[sec],
        items: test.questions.filter(q => q.section === sec),
      }))
      .filter(s => s.items.length > 0);
  }, [test]);

  const answeredCount = useMemo(() => {
    if (!test) return 0;
    return test.questions.filter(q => (answers[q.id] || '').trim().length > 0).length;
  }, [test, answers]);

  const toggleMic = () => {
    if (isMicOn) {
      sttRef.current?.stop();
      setIsMicOn(false);
      return;
    }
    const handle = startEnglishSpeechRecognition({
      onTranscript: (finalText, interim) => {
        setSpeakingText((finalText + (interim ? ' ' + interim : '')).trim());
      },
      onError: () => setIsMicOn(false),
      onEnd: () => setIsMicOn(false),
    });
    if (handle) {
      sttRef.current = handle;
      setIsMicOn(true);
    }
  };

  const handleSubmit = async () => {
    if (!test) return;
    sttRef.current?.stop();
    setIsMicOn(false);
    setSubmitting(true);
    setError(null);
    try {
      const res = await englishLearningApi.evaluateLevelTest({
        level: test.level,
        answers,
        writingText,
        speakingText,
      });
      setResult(res);
      onTestEvaluated(res);
    } catch (err: any) {
      setError(err?.message || 'পরীক্ষা মূল্যায়ন ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  const prevBest = progress.levelTests[selectedLevel];

  return (
    <div className="space-y-5 max-w-4xl mx-auto" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Header & Level Selector */}
      <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
              <ClipboardCheck className="w-4 h-4" />
              <span>CEFR Level Review Test (40 Objective + Writing 20 + Speaking 20)</span>
            </div>
            <h2 className="text-xl font-bold mt-0.5">{selectedLevel} পূর্ণাঙ্গ মূল্যায়ন পরীক্ষা</h2>
            <p className={`text-xs mt-1 ${mutedText}`}>
              পাস করার শর্ত: মোট ৮০-এর মধ্যে অন্তত ৬৪ এবং Writing ও Speaking প্রত্যেকে অন্তত ১৪/২০। Retake
              unlimited।
            </p>
          </div>
          {prevBest && (
            <div className="text-right text-xs">
              <div className={mutedText}>সর্বোচ্চ স্কোর ({prevBest.attempts} বার চেষ্টা)</div>
              <div className={`font-bold text-sm ${prevBest.passed ? 'text-emerald-500' : 'text-amber-500'}`}>
                {prevBest.bestTotal}/80 {prevBest.passed ? '(পাস ✓)' : '(পুনরায় চেষ্টা)'}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CEFR_LEVELS.map(lv => {
            const rec = progress.levelTests[lv];
            return (
              <button
                key={lv}
                type="button"
                onClick={() => onChangeLevel(lv)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  selectedLevel === lv
                    ? 'bg-amber-600 text-white'
                    : isDark
                    ? 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {lv} {rec?.passed ? '✓' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          <span className={mutedText}>{selectedLevel} টেস্ট লোড হচ্ছে...</span>
        </div>
      ) : error && !test ? (
        <div className={`rounded-2xl border p-5 text-sm text-rose-500 ${cardSurface}`}>{error}</div>
      ) : test ? (
        <>
          {/* Result Summary Banner */}
          {result && (
            <div
              className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${
                result.passed
                  ? isDark
                    ? 'bg-emerald-950/30 border-emerald-500/35'
                    : 'bg-emerald-50 border-emerald-200'
                  : isDark
                  ? 'bg-amber-950/30 border-amber-500/35'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-extrabold flex items-center gap-2">
                    {result.passed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    ) : (
                      <XCircle className="w-6 h-6 text-amber-500" />
                    )}
                    <span>
                      মোট স্কোর: {result.total_score}/{result.max_score} —{' '}
                      {result.passed ? `${result.level} পাস!` : 'আবার চেষ্টা করুন'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm mt-1 leading-relaxed">{result.pass_breakdown_bn}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setAnswers({});
                    setWritingText('');
                    setSpeakingText('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> পুনরায় পরীক্ষা দিন
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className={`rounded-xl p-3.5 border ${cardSurface}`}>
                  <div className={mutedText}>Objective (৪০ প্রশ্ন)</div>
                  <div className="text-lg font-bold mt-0.5">
                    {result.objective_score}/{result.objective_total}
                  </div>
                </div>
                <div className={`rounded-xl p-3.5 border ${cardSurface}`}>
                  <div className={mutedText}>Writing (ন্যূনতম ১৪)</div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      result.writing_score >= 14 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {result.writing_score}/{result.writing_total}
                  </div>
                </div>
                <div className={`rounded-xl p-3.5 border ${cardSurface}`}>
                  <div className={mutedText}>Speaking (ন্যূনতম ১৪)</div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      result.speaking_score >= 14 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {result.speaking_score}/{result.speaking_total}
                  </div>
                </div>
              </div>

              {/* Post-submission Bengali Reading & Listening Translations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className={`rounded-xl p-3.5 border space-y-1 ${cardSurface}`}>
                  <div className="font-bold text-emerald-500">Reading Passage বাংলা অনুবাদ</div>
                  <div className="leading-relaxed">{result.reading_translation_bn}</div>
                </div>
                <div className={`rounded-xl p-3.5 border space-y-1 ${cardSurface}`}>
                  <div className="font-bold text-sky-500">Listening Script ও বাংলা অনুবাদ</div>
                  <div className="italic">{test.listening.script_en}</div>
                  <div className="leading-relaxed pt-1">{result.listening_translation_bn}</div>
                </div>
              </div>

              {/* Writing & Speaking Feedback */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className={`rounded-xl p-4 border space-y-1.5 ${cardSurface}`}>
                  <div className="font-bold text-sky-500">Writing মূল্যায়ন ও Model Answer</div>
                  <div>{result.writing_feedback_bn}</div>
                  {result.writing_model_en && (
                    <div className="pt-1 border-t border-slate-200/60 dark:border-white/[0.08]">
                      <strong>Model:</strong> {result.writing_model_en} ({result.writing_model_bn})
                    </div>
                  )}
                </div>
                <div className={`rounded-xl p-4 border space-y-1.5 ${cardSurface}`}>
                  <div className="font-bold text-violet-500">Speaking মূল্যায়ন ও Model Answer</div>
                  <div>{result.speaking_feedback_bn}</div>
                  {result.speaking_model_en && (
                    <div className="pt-1 border-t border-slate-200/60 dark:border-white/[0.08]">
                      <strong>Model:</strong> {result.speaking_model_en} ({result.speaking_model_bn})
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Objective Sections */}
          {sections.map(sec => (
            <div key={sec.key} className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
              <h3 className="text-base font-bold">{sec.label}</h3>

              {sec.key === 'reading' && (
                <div
                  className={`rounded-xl p-4 text-sm leading-relaxed border ${
                    isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {test.reading.passage_en}
                </div>
              )}

              {sec.key === 'listening' && (
                <div
                  className={`rounded-xl p-4 border space-y-2 ${
                    isDark ? 'bg-sky-950/20 border-sky-500/25' : 'bg-sky-50 border-sky-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-sky-500">
                      TTS Listening Audio (জমা দেওয়ার পর script দেখাবে)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => speakEnglish(test.listening.script_en, { rate: 0.92 })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" /> শুনুন
                      </button>
                      <button
                        type="button"
                        onClick={() => speakEnglish(test.listening.script_en, { rate: 0.72 })}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                          isDark ? 'border-white/15' : 'border-slate-300 bg-white'
                        }`}
                      >
                        ধীরে (0.72x)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3.5">
                {sec.items.map(q => {
                  const graded = result?.question_results.find(r => r.id === q.id);
                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-3.5 space-y-2 ${
                        isDark ? 'bg-white/[0.02] border-white/[0.07]' : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="text-sm font-medium">
                        <span className="font-mono text-xs text-sky-500 mr-1.5">{q.id}</span>
                        {q.prompt}
                      </div>

                      {q.type === 'mcq' && q.options ? (
                        <div className="flex flex-wrap gap-2">
                          {q.options.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                                answers[q.id] === opt
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : isDark
                                  ? 'border-white/15 hover:bg-white/[0.06]'
                                  : 'border-slate-200 bg-white hover:bg-slate-100'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={answers[q.id] || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="ইংরেজিতে আপনার উত্তর লিখুন..."
                          className="w-full px-3.5 py-2 rounded-xl border text-sm"
                        />
                      )}

                      {graded && (
                        <div
                          className={`text-xs pt-1 ${
                            graded.correct ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {graded.correct ? '✓ সঠিক!' : `✗ সম্ভাব্য উত্তর: ${graded.expected_answer}`} —{' '}
                          {graded.explanation_bn}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Writing Task (/20, min 14) */}
          <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
            <h3 className="text-base font-bold">Writing Section (২০ নম্বর · পাস ন্যূনতম ১৪)</h3>
            <p className="text-sm">{test.writing_task.prompt_bn}</p>
            <textarea
              rows={5}
              value={writingText}
              onChange={e => setWritingText(e.target.value)}
              placeholder="ইংরেজিতে আপনার লেখা লিখুন..."
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
            />
          </div>

          {/* Speaking Task (/20, min 14) */}
          <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">Speaking Section (২০ নম্বর · পাস ন্যূনতম ১৪)</h3>
              <button
                type="button"
                onClick={toggleMic}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  isMicOn ? 'bg-rose-600 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
                }`}
              >
                {isMicOn ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isMicOn ? 'রেকর্ডিং থামান' : 'মাইক্রোফোনে বলুন'}</span>
              </button>
            </div>
            <p className="text-sm">{test.speaking_task.prompt_bn}</p>
            <textarea
              rows={4}
              value={speakingText}
              onChange={e => setSpeakingText(e.target.value)}
              placeholder="মাইক্রোফোনে বলুন অথবা আপনার spoken response এখানে লিখুন..."
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
            />
          </div>

          {error && <div className="text-sm text-rose-500 font-medium">{error}</div>}

          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div className={`text-xs font-semibold ${mutedText}`}>
              উত্তর দেওয়া হয়েছে: {answeredCount} / {test.question_count} Objective প্রশ্ন
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold text-sm cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{submitting ? 'AI সম্পূর্ণ টেস্ট মূল্যায়ন করছে...' : 'পরীক্ষা জমা দিন ও ফলাফল দেখুন'}</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
};
