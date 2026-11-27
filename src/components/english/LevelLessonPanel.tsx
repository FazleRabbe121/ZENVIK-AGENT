import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  Headphones,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Sparkles,
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
  EnglishBootstrapResponse,
  EnglishLearningProgress,
  GeneratedLesson,
  LessonProgressRecord,
} from '../../types/englishLearning';
import { CEFR_LEVELS } from '../../types/englishLearning';

interface LevelLessonPanelProps {
  bootstrap: EnglishBootstrapResponse;
  selectedLevel: CEFRLevel;
  initialLessonId?: string;
  progress: EnglishLearningProgress;
  onChangeLevel: (level: CEFRLevel) => void;
  onUpdateLessonProgress: (
    lessonId: string,
    level: CEFRLevel,
    patch: Partial<LessonProgressRecord>
  ) => void;
  onTrackSession: (level: CEFRLevel, lessonId: string, labelBn: string) => void;
}

type LessonTab = 'explain' | 'examples' | 'vocab' | 'exercises' | 'read_listen' | 'speak_write' | 'quiz' | 'source';

export const LevelLessonPanel: React.FC<LevelLessonPanelProps> = ({
  bootstrap,
  selectedLevel,
  initialLessonId,
  progress,
  onChangeLevel,
  onUpdateLessonProgress,
  onTrackSession,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [stageGuideMd, setStageGuideMd] = useState('');
  const [showStageGuide, setShowStageGuide] = useState(false);

  const [activeLessonId, setActiveLessonId] = useState<string | null>(initialLessonId || null);
  const [sourceMd, setSourceMd] = useState('');
  const [lessonMeta, setLessonMeta] = useState<any>(null);
  const [generated, setGenerated] = useState<GeneratedLesson | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LessonTab>('explain');

  // Exercise attempt-first states
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<number, string>>({});
  const [checkedExercises, setCheckedExercises] = useState<Record<number, boolean>>({});

  // Reading & Listening attempt-first states
  const [readingAnswers, setReadingAnswers] = useState<Record<number, string>>({});
  const [showReadingKey, setShowReadingKey] = useState(false);
  const [listeningAnswers, setListeningAnswers] = useState<Record<number, string>>({});
  const [showListeningScriptAndKey, setShowListeningScriptAndKey] = useState(false);

  // Speaking & Writing task states
  const [speakingInput, setSpeakingInput] = useState('');
  const [speakingEval, setSpeakingEval] = useState<any>(null);
  const [gradingSpeaking, setGradingSpeaking] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const sttRef = useRef<SpeechRecognizerHandle | null>(null);

  const [writingInput, setWritingInput] = useState('');
  const [writingEval, setWritingEval] = useState<any>(null);
  const [gradingWriting, setGradingWriting] = useState(false);

  // Mini-Quiz states
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const currentSyllabusLevel = bootstrap.syllabus.levels.find(l => l.level === selectedLevel);

  useEffect(() => {
    let active = true;
    englishLearningApi
      .getStage(selectedLevel)
      .then(res => {
        if (active) setStageGuideMd(res.guideMd || '');
      })
      .catch(() => {});
    return () => {
      active = false;
      stopSpeaking();
      sttRef.current?.stop();
    };
  }, [selectedLevel]);

  useEffect(() => {
    if (initialLessonId) {
      openLesson(initialLessonId);
    }
  }, [initialLessonId]);

  const openLesson = async (lessonId: string) => {
    setActiveLessonId(lessonId);
    setLoadingLesson(true);
    setError(null);
    setGenerated(null);
    setSourceMd('');
    setExerciseAnswers({});
    setCheckedExercises({});
    setReadingAnswers({});
    setShowReadingKey(false);
    setListeningAnswers({});
    setShowListeningScriptAndKey(false);
    setSpeakingInput('');
    setSpeakingEval(null);
    setWritingInput('');
    setWritingEval(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    stopSpeaking();

    try {
      const res = await englishLearningApi.getLesson(lessonId);
      setLessonMeta(res.meta);
      setSourceMd(res.sourceMd || '');
      setGenerated(res.generatedLesson || null);
      setTab(res.generatedLesson ? 'explain' : 'source');
      onTrackSession(res.level, lessonId, `${lessonId}: ${res.meta?.title || ''}`);
    } catch (err: any) {
      setError(err?.message || 'পাঠ লোড করা যায়নি।');
    } finally {
      setLoadingLesson(false);
    }
  };

  const handleGenerateLesson = async (force = false) => {
    if (!activeLessonId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await englishLearningApi.generateLesson(activeLessonId, force);
      setGenerated(res.lesson);
      setTab('explain');
    } catch (err: any) {
      setError(err?.message || 'AI পাঠ তৈরি করতে পারেনি। আবার চেষ্টা করুন।');
    } finally {
      setGenerating(false);
    }
  };

  const toggleSpeakingMic = () => {
    if (isMicOn) {
      sttRef.current?.stop();
      setIsMicOn(false);
      return;
    }
    const handle = startEnglishSpeechRecognition({
      onTranscript: (finalText, interim) => {
        setSpeakingInput((finalText + (interim ? ' ' + interim : '')).trim());
      },
      onError: () => setIsMicOn(false),
      onEnd: () => setIsMicOn(false),
    });
    if (handle) {
      sttRef.current = handle;
      setIsMicOn(true);
    }
  };

  const submitLessonTask = async (taskType: 'speaking' | 'writing') => {
    if (!generated || !activeLessonId) return;
    const text = taskType === 'speaking' ? speakingInput.trim() : writingInput.trim();
    if (!text) return;

    if (taskType === 'speaking') setGradingSpeaking(true);
    else setGradingWriting(true);
    setError(null);

    try {
      const task = taskType === 'speaking' ? generated.speaking_task : generated.writing_task;
      const res = await englishLearningApi.evaluateLessonTask({
        taskType,
        level: generated.level,
        promptBn: task.prompt_bn,
        userAnswer: text,
        modelAnswerEn: task.model_answer_en,
        modelAnswerBn: task.model_answer_bn,
      });

      if (taskType === 'speaking') {
        setSpeakingEval(res);
        onUpdateLessonProgress(activeLessonId, generated.level, {
          speakingCompleted: true,
          speakingScore: res.total,
        });
      } else {
        setWritingEval(res);
        onUpdateLessonProgress(activeLessonId, generated.level, {
          writingCompleted: true,
          writingScore: res.total,
        });
      }
    } catch (err: any) {
      setError(err?.message || 'মূল্যায়ন ব্যর্থ হয়েছে।');
    } finally {
      if (taskType === 'speaking') setGradingSpeaking(false);
      else setGradingWriting(false);
    }
  };

  const submitMiniQuiz = () => {
    if (!generated || !activeLessonId) return;
    const total = generated.mini_quiz.length;
    let correct = 0;
    generated.mini_quiz.forEach((q, idx) => {
      const u = (quizAnswers[idx] || '').trim().toLowerCase();
      const exp = (q.answer || '').trim().toLowerCase();
      if (u && (u === exp || exp.includes(u) && u.length >= 2)) correct++;
    });
    const passed = total > 0 && correct / total >= 0.8;
    setQuizSubmitted(true);
    onUpdateLessonProgress(activeLessonId, generated.level, {
      miniQuizScore: correct,
      miniQuizMax: total,
      miniQuizPassed: passed,
    });
  };

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  // =========================================================================
  // ACTIVE LESSON PLAYER
  // =========================================================================
  if (activeLessonId) {
    const lp = progress.lessons[activeLessonId];

    return (
      <div className="space-y-5 max-w-4xl mx-auto" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
        {/* Lesson Top Header */}
        <div className={`rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setActiveLessonId(null);
              }}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="text-xs font-mono font-bold text-emerald-500">
                {activeLessonId} · {lessonMeta?.source_file}
              </div>
              <h2 className="text-base sm:text-lg font-bold">
                {generated?.title_bn || lessonMeta?.title || activeLessonId}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lp?.mastered && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 mr-1">
                <CheckCircle2 className="w-4 h-4" /> পাঠ মাস্টার্ড
              </span>
            )}
            <button
              type="button"
              disabled={generating}
              onClick={() => handleGenerateLesson(Boolean(generated))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : generated ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>
                {generating
                  ? 'AI পূর্ণাঙ্গ পাঠ তৈরি করছে...'
                  : generated
                  ? 'পাঠ পুনরায় তৈরি করুন'
                  : 'AI পূর্ণাঙ্গ বাংলা-ইংরেজি পাঠ তৈরি করুন'}
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-500 font-medium">
            {error}
          </div>
        )}

        {loadingLesson ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
            <span className={mutedText}>পাঠ লোড হচ্ছে...</span>
          </div>
        ) : (
          <>
            {/* Banner prompting AI full lesson generation when only source outline exists */}
            {!generated && (
              <div
                className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isDark ? 'bg-sky-950/25 border-sky-500/30' : 'bg-sky-50 border-sky-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold">
                    এই পাঠের সোর্স আউটলাইন লোড হয়েছে — এখন AI দিয়ে পূর্ণাঙ্গ পাঠ তৈরি করুন
                  </div>
                  <p className={`text-xs leading-relaxed ${mutedText}`}>
                    AI পাঠ তৈরি করলে ১৫+ উদাহরণ, ৮–১২ লাইনের সংলাপ, ১০+ শব্দভাণ্ডার, ১০+ অনুশীলন, Reading ও
                    Listening TTS স্ক্রিপ্ট, Speaking/Writing টাস্ক এবং Mini-Quiz যুক্ত হবে।
                  </p>
                </div>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => handleGenerateLesson(false)}
                  className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>পূর্ণাঙ্গ পাঠ তৈরি করুন</span>
                </button>
              </div>
            )}

            {/* Stepped Lesson Navigation Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ...(generated
                    ? [
                        ['explain', '১. ব্যাখ্যা ও নিয়ম'],
                        ['examples', `২. উদাহরণ (${generated.examples.length}) ও সংলাপ`],
                        ['vocab', `৩. শব্দভাণ্ডার (${generated.vocabulary.length})`],
                        ['exercises', `৪. অনুশীলন (${generated.exercises.length})`],
                        ['read_listen', '৫. Reading ও Listening'],
                        ['speak_write', '৬. Speaking ও Writing'],
                        ['quiz', `৭. Mini-Quiz (${generated.mini_quiz.length})`],
                      ]
                    : []),
                  ['source', 'সোর্স আউটলাইন (Markdown)'],
                ] as Array<[LessonTab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
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

            {/* TAB 1: EXPLANATION */}
            {tab === 'explain' && generated && (
              <div className="space-y-4">
                <div className={`rounded-2xl border p-5 space-y-2.5 ${cardSurface}`}>
                  <h3 className="text-sm font-bold text-sky-500 uppercase tracking-wider">আজকের শেখার লক্ষ্য</h3>
                  <ul className="space-y-1.5 text-sm list-disc list-inside leading-relaxed">
                    {generated.objectives.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>

                {generated.explanation_sections.map((sec, idx) => (
                  <div key={idx} className={`rounded-2xl border p-5 sm:p-6 space-y-3.5 ${cardSurface}`}>
                    <h3 className="text-base sm:text-lg font-bold">{sec.heading_bn}</h3>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{sec.explanation_bn}</p>
                    <div
                      className={`rounded-xl p-3.5 text-xs sm:text-sm border ${
                        isDark ? 'bg-sky-950/20 border-sky-500/20' : 'bg-sky-50 border-sky-200/80'
                      }`}
                    >
                      <strong>কেন ও কখন ব্যবহার করবেন (Why &amp; When):</strong> {sec.why_when_bn}
                    </div>
                    {sec.pattern && (
                      <div
                        className={`rounded-xl p-3.5 text-xs sm:text-sm font-mono border ${
                          isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <strong>Pattern:</strong> {sec.pattern}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                      <div className={`rounded-xl p-3.5 border ${isDark ? 'border-white/[0.08]' : 'border-slate-200'}`}>
                        <div className="font-bold text-emerald-500 mb-1">বাংলা বনাম ইংরেজি পার্থক্য</div>
                        <div className={mutedText}>{sec.bengali_contrast}</div>
                      </div>
                      <div className={`rounded-xl p-3.5 border ${isDark ? 'border-white/[0.08]' : 'border-slate-200'}`}>
                        <div className="font-bold text-amber-500 mb-1">বাংলাভাষীদের সাধারণ ভুল</div>
                        <div className={mutedText}>{sec.common_bengali_speaker_error}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 2: EXAMPLES (15+) & DIALOGUE (8-12 lines) */}
            {tab === 'examples' && generated && (
              <div className="space-y-5">
                <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                  <h3 className="text-base font-bold">বাস্তব উদাহরণ ({generated.examples.length}টি)</h3>
                  <div className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
                    {generated.examples.map((ex, idx) => (
                      <div key={idx} className="py-3 flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-sm font-bold">
                            {idx + 1}. {ex.english}
                          </div>
                          <div className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                            {ex.bangla_meaning}
                          </div>
                          <div className={`text-xs ${mutedText}`}>{ex.usage_note_bn}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakEnglish(ex.english, { rate: 0.92 })}
                          className={`shrink-0 p-2 rounded-xl border cursor-pointer ${
                            isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                          title="ইংরেজি শুনুন"
                        >
                          <Volume2 className="w-4 h-4 text-sky-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold">বাস্তব সংলাপ ({generated.dialogue.length} লাইন)</h3>
                    <button
                      type="button"
                      onClick={() =>
                        speakEnglish(
                          generated.dialogue.map(d => d.english).join('. '),
                          { rate: 0.9 }
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> পুরো সংলাপ শুনুন
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {generated.dialogue.map((line, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl p-3.5 border flex items-start justify-between gap-3 ${
                          isDark ? 'bg-white/[0.02] border-white/[0.07]' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-sky-500">{line.speaker}</div>
                          <div className="text-sm font-semibold mt-0.5">{line.english}</div>
                          <div className={`text-xs mt-0.5 ${mutedText}`}>{line.bangla_meaning}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakEnglish(line.english, { rate: 0.92 })}
                          className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-500/10 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: VOCABULARY (10+) */}
            {tab === 'vocab' && generated && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {generated.vocabulary.map((v, idx) => (
                  <div key={idx} className={`rounded-2xl border p-4 space-y-2 ${cardSurface}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-base font-bold">{v.english}</div>
                        <div className="text-sm font-semibold text-emerald-500">{v.bangla_meaning}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakEnglish(v.english, { rate: 0.9 })}
                        className={`p-2 rounded-xl border cursor-pointer ${
                          isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Volume2 className="w-4 h-4 text-sky-500" />
                      </button>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div>
                        <span className="font-semibold text-amber-500">আনুমানিক বাংলা উচ্চারণ:</span>{' '}
                        {v.approx_pronunciation_bn}
                      </div>
                      {v.ipa && (
                        <div>
                          <span className="font-semibold text-sky-500">IPA:</span>{' '}
                          <span className="font-mono">/{v.ipa}/</span>
                        </div>
                      )}
                    </div>
                    <div className={`text-xs pt-2 border-t ${isDark ? 'border-white/[0.07]' : 'border-slate-100'}`}>
                      <div className="font-medium">{v.example_en}</div>
                      <div className={mutedText}>{v.example_bn}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 4: VARIED EXERCISES (Attempt-First Answer Key) */}
            {tab === 'exercises' && generated && (
              <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                <div>
                  <h3 className="text-base font-bold">বৈচিত্র্যময় অনুশীলন ({generated.exercises.length}টি)</h3>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    আগে নিজে চেষ্টা করে উত্তর লিখুন বা বাছাই করুন, তারপর “উত্তর যাচাই করুন” চাপলে উত্তর ও বাংলা ব্যাখ্যা
                    দেখাবে।
                  </p>
                </div>

                <div className="space-y-4">
                  {generated.exercises.map((ex, idx) => {
                    const userVal = exerciseAnswers[idx] || '';
                    const isChecked = Boolean(checkedExercises[idx]);
                    const isRight =
                      isChecked &&
                      userVal.trim().toLowerCase() === ex.answer.trim().toLowerCase();

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-4 space-y-2.5 ${
                          isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold uppercase text-sky-500">
                            #{idx + 1} · {ex.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="text-sm font-semibold">{ex.prompt}</div>

                        {ex.options && ex.options.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {ex.options.map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setExerciseAnswers(prev => ({ ...prev, [idx]: opt }))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                                  userVal === opt
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
                            value={userVal}
                            onChange={e => setExerciseAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="আপনার উত্তর লিখুন..."
                            className="w-full px-3.5 py-2 rounded-xl border text-sm"
                          />
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!userVal.trim()}
                            onClick={() => setCheckedExercises(prev => ({ ...prev, [idx]: true }))}
                            className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                          >
                            উত্তর যাচাই করুন
                          </button>
                          {!userVal.trim() && (
                            <span className={`text-[11px] ${mutedText}`}>
                              উত্তর দেখার আগে নিজে চেষ্টা করুন
                            </span>
                          )}
                        </div>

                        {isChecked && (
                          <div
                            className={`rounded-xl p-3 text-xs border space-y-1 ${
                              isRight
                                ? isDark
                                  ? 'bg-emerald-950/30 border-emerald-500/30'
                                  : 'bg-emerald-50 border-emerald-200'
                                : isDark
                                ? 'bg-amber-950/30 border-amber-500/30'
                                : 'bg-amber-50 border-amber-200'
                            }`}
                          >
                            <div className="font-bold">
                              সঠিক উত্তর (Answer Key): <span className="text-emerald-500">{ex.answer}</span>
                            </div>
                            <div>{ex.explanation_bn}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 5: READING & LISTENING */}
            {tab === 'read_listen' && generated && (
              <div className="space-y-5">
                {/* Reading */}
                <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
                    <BookOpen className="w-4 h-4" />
                    <span>Reading Comprehension</span>
                  </div>
                  <div
                    className={`rounded-xl p-4 text-sm leading-relaxed border ${
                      isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {generated.reading.passage_en}
                  </div>
                  <div className="space-y-3">
                    {generated.reading.questions.map((q, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="text-xs font-semibold block">
                          {idx + 1}. {q.prompt}
                        </label>
                        <input
                          type="text"
                          value={readingAnswers[idx] || ''}
                          onChange={e => setReadingAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="আপনার উত্তর..."
                          className="w-full px-3.5 py-2 rounded-xl border text-sm"
                        />
                        {showReadingKey && (
                          <div className="text-xs text-emerald-500 pt-0.5">
                            উত্তর: {q.answer} — {q.explanation_bn}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReadingKey(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> উত্তর ও বাংলা অনুবাদ দেখুন
                  </button>
                  {showReadingKey && (
                    <div
                      className={`rounded-xl p-3.5 text-xs leading-relaxed border ${
                        isDark ? 'bg-emerald-950/20 border-emerald-500/25' : 'bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      <strong>বাংলা অনুবাদ:</strong> {generated.reading.passage_bn}
                    </div>
                  )}
                </div>

                {/* Listening */}
                <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-sky-500">
                      <Headphones className="w-4 h-4" />
                      <span>Listening (TTS Script)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => speakEnglish(generated.listening.script_en, { rate: 0.92 })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" /> শুনুন
                      </button>
                      <button
                        type="button"
                        onClick={() => speakEnglish(generated.listening.script_en, { rate: 0.72 })}
                        className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                          isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        ধীরে (0.72x)
                      </button>
                    </div>
                  </div>
                  <p className={`text-xs ${mutedText}`}>
                    আগে অডিও শুনে প্রশ্নগুলোর উত্তর দিন; তারপর script ও বাংলা অনুবাদ দেখুন।
                  </p>
                  <div className="space-y-3">
                    {generated.listening.questions.map((q, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="text-xs font-semibold block">
                          {idx + 1}. {q.prompt}
                        </label>
                        <input
                          type="text"
                          value={listeningAnswers[idx] || ''}
                          onChange={e => setListeningAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="শুনে উত্তর লিখুন..."
                          className="w-full px-3.5 py-2 rounded-xl border text-sm"
                        />
                        {showListeningScriptAndKey && (
                          <div className="text-xs text-sky-500 pt-0.5">
                            উত্তর: {q.answer} — {q.explanation_bn}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowListeningScriptAndKey(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> Listening Script, বাংলা অনুবাদ ও উত্তর দেখুন
                  </button>
                  {showListeningScriptAndKey && (
                    <div
                      className={`rounded-xl p-4 text-xs leading-relaxed border space-y-2 ${
                        isDark ? 'bg-sky-950/20 border-sky-500/25' : 'bg-sky-50 border-sky-200'
                      }`}
                    >
                      <div>
                        <strong>Script (EN):</strong> {generated.listening.script_en}
                      </div>
                      <div>
                        <strong>বাংলা অর্থ:</strong> {generated.listening.script_bn}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: SPEAKING & WRITING (AI Rubric, Attempt-First Model Answer) */}
            {tab === 'speak_write' && generated && (
              <div className="space-y-5">
                {/* Speaking */}
                <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold">Speaking Task (মাস্টারির জন্য আবশ্যক)</h3>
                    <button
                      type="button"
                      onClick={toggleSpeakingMic}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                        isMicOn ? 'bg-rose-600 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
                      }`}
                    >
                      {isMicOn ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      <span>{isMicOn ? 'রেকর্ডিং থামান' : 'মাইক্রোফোনে বলুন'}</span>
                    </button>
                  </div>
                  <p className="text-sm">{generated.speaking_task.prompt_bn}</p>
                  <textarea
                    rows={3}
                    value={speakingInput}
                    onChange={e => setSpeakingInput(e.target.value)}
                    placeholder="আগে নিজের উত্তর বলুন বা লিখুন; জমা দেওয়ার পর AI মূল্যায়ন ও model answer দেখাবে..."
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
                  />
                  <button
                    type="button"
                    disabled={gradingSpeaking || !speakingInput.trim()}
                    onClick={() => submitLessonTask('speaking')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {gradingSpeaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>AI Speaking মূল্যায়ন নিন</span>
                  </button>
                  {speakingEval && (
                    <div
                      className={`rounded-xl p-4 text-xs space-y-2 border ${
                        isDark ? 'bg-violet-950/20 border-violet-500/25' : 'bg-violet-50 border-violet-200'
                      }`}
                    >
                      <div className="font-bold text-sm">স্কোর: {speakingEval.total}/20</div>
                      <div>{speakingEval.feedback_bn}</div>
                      <div>
                        <strong>স্বাভাবিক রূপ:</strong> {speakingEval.natural_version_en}
                      </div>
                      <div className="pt-1 border-t border-violet-500/20">
                        <strong>Model Answer:</strong> {speakingEval.model_answer_en} ({speakingEval.model_answer_bn})
                      </div>
                    </div>
                  )}
                </div>

                {/* Writing */}
                <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                  <h3 className="text-base font-bold">Writing Task (মাস্টারির জন্য আবশ্যক)</h3>
                  <p className="text-sm">{generated.writing_task.prompt_bn}</p>
                  <textarea
                    rows={4}
                    value={writingInput}
                    onChange={e => setWritingInput(e.target.value)}
                    placeholder="ইংরেজিতে লিখুন..."
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
                  />
                  <button
                    type="button"
                    disabled={gradingWriting || !writingInput.trim()}
                    onClick={() => submitLessonTask('writing')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {gradingWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>AI Writing মূল্যায়ন নিন</span>
                  </button>
                  {writingEval && (
                    <div
                      className={`rounded-xl p-4 text-xs space-y-2 border ${
                        isDark ? 'bg-sky-950/20 border-sky-500/25' : 'bg-sky-50 border-sky-200'
                      }`}
                    >
                      <div className="font-bold text-sm">স্কোর: {writingEval.total}/20</div>
                      <div>{writingEval.feedback_bn}</div>
                      <div>
                        <strong>স্বাভাবিক রূপ:</strong> {writingEval.natural_version_en}
                      </div>
                      <div className="pt-1 border-t border-sky-500/20">
                        <strong>Model Answer:</strong> {writingEval.model_answer_en} ({writingEval.model_answer_bn})
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 7: MINI-QUIZ */}
            {tab === 'quiz' && generated && (
              <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
                <div>
                  <h3 className="text-base font-bold">Lesson Mini-Quiz (পাস: অন্তত ৮০%)</h3>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    Mini-Quiz অন্তত ৮০% + Speaking + Writing সম্পন্ন হলে পাঠটি Mastered হিসেবে সংরক্ষিত হবে।
                  </p>
                </div>

                <div className="space-y-3.5">
                  {generated.mini_quiz.map((q, idx) => {
                    const userVal = quizAnswers[idx] || '';
                    const isRight =
                      quizSubmitted &&
                      userVal.trim().toLowerCase() === q.answer.trim().toLowerCase();

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-4 space-y-2 ${
                          isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="text-sm font-semibold">
                          {idx + 1}. {q.prompt}
                        </div>
                        {q.options && q.options.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {q.options.map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setQuizAnswers(prev => ({ ...prev, [idx]: opt }))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                                  userVal === opt
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : isDark
                                    ? 'border-white/15'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={userVal}
                            onChange={e => setQuizAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                            placeholder="উত্তর লিখুন..."
                            className="w-full px-3.5 py-2 rounded-xl border text-sm"
                          />
                        )}
                        {quizSubmitted && (
                          <div className={`text-xs pt-1 ${isRight ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {isRight ? '✓ সঠিক!' : `✗ সঠিক উত্তর: ${q.answer}`} — {q.explanation_bn}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={submitMiniQuiz}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Mini-Quiz জমা দিন
                  </button>
                  {lp && (
                    <div className="text-xs font-semibold">
                      Quiz: {lp.miniQuizPassed ? 'পাস ✓' : 'বাকি'} · Speaking:{' '}
                      {lp.speakingCompleted ? 'সম্পন্ন ✓' : 'বাকি'} · Writing:{' '}
                      {lp.writingCompleted ? 'সম্পন্ন ✓' : 'বাকি'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SOURCE MARKDOWN TAB */}
            {tab === 'source' && (
              <div className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-sky-500">
                  <FileText className="w-4 h-4" />
                  <span>সোর্স ফাইল: {lessonMeta?.source_file}</span>
                </div>
                <pre className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed font-sans">
                  {sourceMd}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // =========================================================================
  // LEVEL OVERVIEW & LESSON LIST
  // =========================================================================
  return (
    <div className="space-y-5" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-500">
              <BookOpen className="w-4 h-4" />
              <span>CEFR Level Overview &amp; AI Lessons</span>
            </div>
            <h2 className="text-xl font-bold mt-0.5">
              {selectedLevel} — {currentSyllabusLevel?.title_bn || currentSyllabusLevel?.title} (
              {currentSyllabusLevel?.lessons.length || 0}টি পাঠ)
            </h2>
            <p className={`text-xs mt-1 ${mutedText}`}>
              প্রতিটি পাঠের সোর্স ফাইল থেকে AI পূর্ণাঙ্গ বাংলা-ইংরেজি পাঠ তৈরি করবে (Mastery শর্ত: Mini-Quiz
              ৮০% + Speaking + Writing)।
            </p>
          </div>
          {stageGuideMd && (
            <button
              type="button"
              onClick={() => setShowStageGuide(v => !v)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showStageGuide ? 'Stage Guide বন্ধ করুন' : 'Stage Guide ও Can-Do দেখুন'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CEFR_LEVELS.map(lv => (
            <button
              key={lv}
              type="button"
              onClick={() => onChangeLevel(lv)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedLevel === lv
                  ? 'bg-emerald-600 text-white'
                  : isDark
                  ? 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>

        {showStageGuide && stageGuideMd && (
          <div
            className={`rounded-xl p-4 border max-h-72 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap ${
              isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            {stageGuideMd}
          </div>
        )}
      </div>

      {/* Lesson Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {(currentSyllabusLevel?.lessons || []).map(ls => {
          const rec = progress.lessons[ls.lesson_id];
          return (
            <div key={ls.lesson_id} className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${cardSurface}`}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-500">{ls.lesson_id}</span>
                  {rec?.mastered ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500">
                      <CheckCircle2 className="w-3.5 h-3.5" /> মাস্টার্ড
                    </span>
                  ) : rec ? (
                    <span className="text-xs font-semibold text-sky-500">চলমান</span>
                  ) : (
                    <span className={`text-xs ${mutedText}`}>নতুন</span>
                  )}
                </div>
                <div className="text-sm font-bold">{ls.title}</div>
                <div className={`text-[11px] font-mono truncate ${mutedText}`}>{ls.source_file}</div>
              </div>
              <button
                type="button"
                onClick={() => openLesson(ls.lesson_id)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDark ? 'bg-white text-slate-950 hover:bg-zinc-200' : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {rec?.mastered ? 'পাঠ রিভিউ করুন' : 'পাঠ শুরু করুন'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
