import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Grid,
  Layers,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Send,
  Square,
  Unlock,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { englishLearningApi } from '../../services/englishLearningService';
import {
  speakEnglish,
  stopSpeaking,
  startEnglishSpeechRecognition,
  startSelfVoiceRecording,
  SpeechRecognizerHandle,
  VoiceRecorderSession,
} from '../../services/englishSpeechService';
import { isBatchUnlocked } from '../../services/englishProgressService';
import type {
  CEFRLevel,
  EnglishLearningProgress,
  VocabBatchSummary,
  VocabBatchDetail,
  BatchQuizEvaluationResult,
  BatchInterviewTurnResponse,
  VocabItem,
} from '../../types/englishLearning';
import { CEFR_LEVELS } from '../../types/englishLearning';

interface VocabMasterClassPanelProps {
  selectedLevel: CEFRLevel;
  initialBatchId?: string;
  progress: EnglishLearningProgress;
  onChangeLevel: (level: CEFRLevel) => void;
  onChangeBatchSize: (size: 5 | 6 | 7) => void;
  onCardsStudied: (batchId: string, level: CEFRLevel, itemIds: string[]) => void;
  onQuizCompleted: (
    batchId: string,
    level: CEFRLevel,
    result: BatchQuizEvaluationResult
  ) => void;
  onInterviewCompleted: (
    batchId: string,
    level: CEFRLevel,
    scoreOutOf20: number,
    passed: boolean,
    allItemIds: string[],
    remediationItemIds: string[],
    corrections: Array<{ original: string; natural: string; reason_bn: string }>
  ) => void;
  onToggleSavePhrase: (item: VocabItem) => void;
  onTrackSession: (level: CEFRLevel, batchId: string, labelBn: string) => void;
}

type BatchStep = 'cards' | 'quiz' | 'interview';

export const VocabMasterClassPanel: React.FC<VocabMasterClassPanelProps> = ({
  selectedLevel,
  initialBatchId,
  progress,
  onChangeLevel,
  onChangeBatchSize,
  onCardsStudied,
  onQuizCompleted,
  onInterviewCompleted,
  onToggleSavePhrase,
  onTrackSession,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [batches, setBatches] = useState<VocabBatchSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeBatch, setActiveBatch] = useState<VocabBatchDetail | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Study step state
  const [step, setStep] = useState<BatchStep>('cards');
  const [cardIndex, setCardIndex] = useState(0);
  const [showOverviewGrid, setShowOverviewGrid] = useState(false);

  // Voice self-recording on card
  const [isSelfRecording, setIsSelfRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const selfRecorderRef = useRef<VoiceRecorderSession | null>(null);

  // Step 2: Quiz state
  const [quizInputs, setQuizInputs] = useState<Record<number, string>>({});
  const [gradingQuiz, setGradingQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<BatchQuizEvaluationResult | null>(null);

  // Step 3: Batch AI Interview state
  const [interviewHistory, setInterviewHistory] = useState<
    Array<{
      stage: string;
      prompt_bn: string;
      prompt_en?: string;
      user_answer: string;
      feedback_bn?: string;
      natural_version_en?: string;
      priority_corrections?: Array<{ original: string; natural: string; reason_bn: string }>;
    }>
  >([]);
  const [currentQuestion, setCurrentQuestion] = useState<{
    stage: 'closed' | 'open' | 'roleplay';
    prompt_bn: string;
    prompt_en?: string;
    item_id?: string;
  } | null>(null);
  const [interviewIntro, setInterviewIntro] = useState('');
  const [interviewInput, setInterviewInput] = useState('');
  const [sendingTurn, setSendingTurn] = useState(false);
  const [interviewFinal, setInterviewFinal] = useState<BatchInterviewTurnResponse['final_evaluation'] | null>(null);
  const [isMicListening, setIsMicListening] = useState(false);
  const [micWarning, setMicWarning] = useState<string | null>(null);
  const sttRef = useRef<SpeechRecognizerHandle | null>(null);

  // Load batches for selected level
  useEffect(() => {
    let active = true;
    setLoadingList(true);
    englishLearningApi
      .getBatches({ level: selectedLevel })
      .then(res => {
        if (!active) return;
        setBatches(res.batches);
        if (initialBatchId && res.batches.some(b => b.batch_id === initialBatchId)) {
          openBatch(initialBatchId, progress.preferredBatchSize);
        }
      })
      .catch(err => {
        if (active) setError(err?.message || 'ব্যাচ তালিকা লোড করা যায়নি।');
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
      stopSpeaking();
      sttRef.current?.stop();
    };
  }, [selectedLevel]);

  const filteredBatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return batches;
    return batches.filter(
      b =>
        b.batch_id.toLowerCase().includes(q) ||
        b.topic.toLowerCase().includes(q) ||
        b.preview_english.some(e => e.toLowerCase().includes(q))
    );
  }, [batches, searchQuery]);

  const openBatch = async (batchId: string, size: 5 | 6 | 7 = progress.preferredBatchSize) => {
    setLoadingBatch(true);
    setError(null);
    stopSpeaking();
    try {
      const detail = await englishLearningApi.getBatchDetail(batchId, size);
      setActiveBatch(detail);
      setStep('cards');
      setCardIndex(0);
      setShowOverviewGrid(false);
      setQuizInputs({});
      setQuizResult(null);
      setInterviewHistory([]);
      setCurrentQuestion(null);
      setInterviewFinal(null);
      setInterviewIntro('');
      setRecordedAudioUrl(null);
      onTrackSession(detail.level, detail.batch_id, `${detail.batch_id} (${detail.level})`);
    } catch (err: any) {
      setError(err?.message || 'ব্যাচ লোড করা যায়নি।');
    } finally {
      setLoadingBatch(false);
    }
  };

  const handleSizeSwitch = (size: 5 | 6 | 7) => {
    onChangeBatchSize(size);
    if (activeBatch) {
      openBatch(activeBatch.batch_id, size);
    }
  };

  const toggleSelfVoiceRecord = async () => {
    if (isSelfRecording) {
      const url = await selfRecorderRef.current?.stop();
      setIsSelfRecording(false);
      if (url) setRecordedAudioUrl(url);
      return;
    }
    setRecordedAudioUrl(null);
    const session = await startSelfVoiceRecording();
    if (!session) {
      setError('মাইক্রোফোন রেকর্ডিং চালু করা যায়নি। ব্রাউজারে মাইক্রোফোন অনুমতি দিন।');
      return;
    }
    selfRecorderRef.current = session;
    setIsSelfRecording(true);
  };

  const startQuizStep = () => {
    if (!activeBatch) return;
    onCardsStudied(activeBatch.batch_id, activeBatch.level, activeBatch.item_ids);
    setStep('quiz');
    setQuizResult(null);
  };

  const submitQuiz = async () => {
    if (!activeBatch) return;
    setGradingQuiz(true);
    setError(null);
    try {
      const payload = activeBatch.quiz.questions.map(q => ({
        source_item_id: q.source_item_id,
        prompt_bn: q.prompt_bn,
        user_answer: quizInputs[q.index] || '',
      }));
      const res = await englishLearningApi.evaluateBatchQuiz(activeBatch.batch_id, payload);
      setQuizResult(res);
      onQuizCompleted(activeBatch.batch_id, activeBatch.level, res);
    } catch (err: any) {
      setError(err?.message || 'Quiz মূল্যায়ন করা যায়নি।');
    } finally {
      setGradingQuiz(false);
    }
  };

  const startInterviewStep = async () => {
    if (!activeBatch) return;
    setStep('interview');
    setInterviewHistory([]);
    setInterviewFinal(null);
    setInterviewInput('');
    setSendingTurn(true);
    setError(null);
    try {
      const res = await englishLearningApi.batchInterviewTurn({
        batchId: activeBatch.batch_id,
        itemIds: activeBatch.item_ids,
        history: [],
      });
      setInterviewIntro(res.turn_feedback_bn);
      setCurrentQuestion(res.next_question || null);
    } catch (err: any) {
      setError(err?.message || 'AI Interview শুরু করা যায়নি।');
    } finally {
      setSendingTurn(false);
    }
  };

  const submitInterviewAnswer = async () => {
    if (!activeBatch || !currentQuestion || !interviewInput.trim()) return;
    sttRef.current?.stop();
    setIsMicListening(false);
    setSendingTurn(true);
    setError(null);

    const userAnswer = interviewInput.trim();
    const historyForApi = interviewHistory.map(h => ({
      stage: h.stage,
      prompt_bn: h.prompt_bn,
      prompt_en: h.prompt_en,
      user_answer: h.user_answer,
    }));

    try {
      const res = await englishLearningApi.batchInterviewTurn({
        batchId: activeBatch.batch_id,
        itemIds: activeBatch.item_ids,
        history: historyForApi,
        userResponse: userAnswer,
      });

      const updatedTurn = {
        stage: currentQuestion.stage,
        prompt_bn: currentQuestion.prompt_bn,
        prompt_en: currentQuestion.prompt_en,
        user_answer: userAnswer,
        feedback_bn: res.turn_feedback_bn,
        natural_version_en: res.natural_version_en,
        priority_corrections: res.priority_corrections,
      };
      const nextHistory = [...interviewHistory, updatedTurn];
      setInterviewHistory(nextHistory);
      setInterviewInput('');

      if (res.completed && res.final_evaluation) {
        setCurrentQuestion(null);
        setInterviewFinal(res.final_evaluation);
        const allCorrections = nextHistory.flatMap(t => t.priority_corrections || []);
        onInterviewCompleted(
          activeBatch.batch_id,
          activeBatch.level,
          res.final_evaluation.rubric.total,
          res.final_evaluation.passed,
          activeBatch.item_ids,
          res.final_evaluation.remediation_item_ids || [],
          allCorrections
        );
      } else {
        setCurrentQuestion(res.next_question || null);
      }
    } catch (err: any) {
      setError(err?.message || 'উত্তর মূল্যায়ন করা যায়নি।');
    } finally {
      setSendingTurn(false);
    }
  };

  const toggleInterviewMic = () => {
    if (isMicListening) {
      sttRef.current?.stop();
      setIsMicListening(false);
      return;
    }
    setMicWarning(null);
    const handle = startEnglishSpeechRecognition({
      onTranscript: (finalText, interim) => {
        setInterviewInput((finalText + (interim ? ' ' + interim : '')).trim());
      },
      onError: msg => {
        setMicWarning(msg);
        setIsMicListening(false);
      },
      onEnd: () => setIsMicListening(false),
    });
    if (handle) {
      sttRef.current = handle;
      setIsMicListening(true);
    }
  };

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  const activeBatchRecord = activeBatch ? progress.batches[activeBatch.batch_id] : undefined;
  const canEnterInterview = Boolean(quizResult?.passed || activeBatchRecord?.quizPassed);

  const nextBatchSummary = useMemo(() => {
    if (!activeBatch) return null;
    const pos = batches.findIndex(b => b.batch_id === activeBatch.batch_id);
    return pos >= 0 && pos + 1 < batches.length ? batches[pos + 1] : null;
  }, [activeBatch, batches]);

  // =========================================================================
  // ACTIVE BATCH GUIDED SESSION VIEW (Cards -> Quiz -> AI Interview)
  // =========================================================================
  if (activeBatch) {
    const currentItem = activeBatch.items[cardIndex];
    const isSaved = currentItem && progress.savedPhrases.some(p => p.id === currentItem.id);

    return (
      <div className="space-y-5 max-w-4xl mx-auto" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
        {/* Top Session Bar */}
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setActiveBatch(null);
              }}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="text-xs font-mono font-bold text-sky-500">
                {activeBatch.batch_id} · {activeBatch.level}
              </div>
              <div className="text-sm font-bold capitalize">
                {activeBatch.topic.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          {/* 3-Step Progression Header */}
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStep('cards')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                step === 'cards'
                  ? 'bg-sky-600 text-white'
                  : isDark
                  ? 'bg-white/[0.06] text-zinc-300'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              ১. কার্ড ({activeBatch.items.length})
            </button>
            <button
              type="button"
              onClick={startQuizStep}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                step === 'quiz'
                  ? 'bg-sky-600 text-white'
                  : isDark
                  ? 'bg-white/[0.06] text-zinc-300'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              ২. Quiz {activeBatchRecord?.quizPassed ? '✓' : ''}
            </button>
            <button
              type="button"
              disabled={!canEnterInterview}
              onClick={startInterviewStep}
              title={!canEnterInterview ? 'আগে Quiz-এ অন্তত ৮০% (৪/৫) পেতে হবে' : 'AI Interview শুরু করুন'}
              className={`px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1 ${
                step === 'interview'
                  ? 'bg-violet-600 text-white'
                  : canEnterInterview
                  ? isDark
                    ? 'bg-white/[0.06] text-zinc-200 cursor-pointer'
                    : 'bg-slate-100 text-slate-800 cursor-pointer'
                  : 'opacity-45 cursor-not-allowed bg-slate-500/10'
              }`}
            >
              {!canEnterInterview && <Lock className="w-3 h-3" />}
              <span>৩. AI Interview {activeBatchRecord?.interviewPassed ? '✓' : ''}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-500 font-medium">
            {error}
          </div>
        )}

        {/* STEP 1: STUDY CARDS */}
        {step === 'cards' && currentItem && (
          <div className="space-y-4">
            {/* Batch size & overview toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={mutedText}>ব্যাচ সাইজ (default ৫, সর্বোচ্চ ৭):</span>
                {([5, 6, 7] as const).map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => handleSizeSwitch(sz)}
                    className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                      progress.preferredBatchSize === sz
                        ? 'bg-sky-600 text-white border-sky-600'
                        : isDark
                        ? 'border-white/15 text-zinc-300'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowOverviewGrid(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold cursor-pointer ${
                  isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>{showOverviewGrid ? 'একটি করে কার্ড দেখুন' : 'ব্যাচ ওভারভিউ (সব কার্ড)'}</span>
              </button>
            </div>

            {showOverviewGrid ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeBatch.items.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCardIndex(idx);
                      setShowOverviewGrid(false);
                    }}
                    className={`text-left rounded-2xl border p-4 transition hover:border-sky-500/60 cursor-pointer ${cardSurface}`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-sky-500 mb-1">
                      <span>
                        #{idx + 1} · {item.item_type.replace('_', ' ')}
                      </span>
                      <span>{item.register}</span>
                    </div>
                    <div className="text-base font-bold">{item.english}</div>
                    <div className={`text-xs mt-1 ${mutedText}`}>{item.bangla_meaning}</div>
                    <div className="text-[11px] mt-2 text-sky-500 font-medium">বিস্তারিত কার্ড খুলুন →</div>
                  </button>
                ))}
              </div>
            ) : (
              /* Focused Single Card (Mobile-First, Zero Clutter) */
              <div className={`rounded-2xl border p-5 sm:p-7 space-y-5 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-mono font-bold text-sky-500">
                    কার্ড {cardIndex + 1} / {activeBatch.items.length} · {currentItem.item_type.replace('_', ' ')} ·{' '}
                    {currentItem.pos}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${mutedText}`}>Register: {currentItem.register}</span>
                    <button
                      type="button"
                      onClick={() => onToggleSavePhrase(currentItem)}
                      className={`p-2 rounded-xl border transition cursor-pointer ${
                        isSaved
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                          : isDark
                          ? 'border-white/15 text-zinc-400 hover:text-white'
                          : 'border-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                      title={isSaved ? 'Saved Phrases থেকে সরান' : 'Saved Phrases-এ সংরক্ষণ করুন'}
                    >
                      {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* English Primary Phrase + TTS */}
                <div className="space-y-2">
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug">
                    {currentItem.english}
                  </div>
                  <div className="text-lg sm:text-xl font-semibold text-emerald-500">
                    {currentItem.bangla_meaning}
                  </div>

                  {currentItem.has_data_quality_notice && currentItem.data_quality_note_bn && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-600 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{currentItem.data_quality_note_bn}</span>
                    </div>
                  )}

                  {/* TTS & Self-Record Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => speakEnglish(currentItem.english, { rate: 0.95 })}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" /> উচ্চারণ শুনুন
                    </button>
                    <button
                      type="button"
                      onClick={() => speakEnglish(currentItem.english, { rate: 0.7 })}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      ধীরে (0.7x)
                    </button>
                    <button
                      type="button"
                      onClick={toggleSelfVoiceRecord}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        isSelfRecording
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : isDark
                          ? 'border-white/15 hover:bg-white/[0.06]'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isSelfRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      <span>{isSelfRecording ? 'থামান' : 'নিজে বলে রেকর্ড করুন'}</span>
                    </button>
                    {recordedAudioUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const audio = new Audio(recordedAudioUrl);
                          audio.play().catch(() => {});
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" /> নিজের কণ্ঠ শুনুন
                      </button>
                    )}
                  </div>
                </div>

                {/* Approximate Bengali Pronunciation & Separate IPA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className={`rounded-xl p-3.5 border ${
                      isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-500">
                      আনুমানিক বাংলা উচ্চারণ (শুধু কাছাকাছি ধারণা)
                    </div>
                    <div className="text-sm font-semibold mt-1">{currentItem.approx_pronunciation_bn}</div>
                    <div className={`text-[11px] mt-1 ${mutedText}`}>
                      সঠিক উচ্চারণের জন্য উপরের ইংরেজি অডিও শুনুন।
                    </div>
                  </div>
                  <div
                    className={`rounded-xl p-3.5 border ${
                      isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wide text-sky-500">
                      IPA (আলাদা ফনেটিক লিপি)
                    </div>
                    <div className="text-sm font-mono font-semibold mt-1">
                      {currentItem.ipa ? `/${currentItem.ipa}/` : 'সোর্স ফাইলে IPA দেওয়া নেই'}
                    </div>
                    <div className={`text-[11px] mt-1 ${mutedText}`}>
                      US-oriented স্বয়ংক্রিয় IPA; UK/US সামান্য ভিন্নতা থাকতে পারে।
                    </div>
                  </div>
                </div>

                {/* Usage Note & Alternative Phrase */}
                <div className="space-y-2.5 text-sm">
                  <div>
                    <span className="font-bold">ব্যবহারের নোট (Usage Note): </span>
                    <span className={mutedText}>{currentItem.usage_note}</span>
                  </div>
                  {currentItem.alternative_phrase && (
                    <div>
                      <span className="font-bold">বিকল্প অভিব্যক্তি (Alternative Phrase): </span>
                      <span className="font-medium text-sky-500">{currentItem.alternative_phrase}</span>
                    </div>
                  )}
                </div>

                {/* Bilingual Example Sentence */}
                <div
                  className={`rounded-xl p-4 border space-y-1.5 ${
                    isDark ? 'bg-sky-950/20 border-sky-500/20' : 'bg-sky-50/70 border-sky-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-500">
                      বাস্তব উদাহরণ (Example)
                    </span>
                    <button
                      type="button"
                      onClick={() => speakEnglish(currentItem.example_en, { rate: 0.92 })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500 hover:underline cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> বাক্য শুনুন
                    </button>
                  </div>
                  <div className="text-sm sm:text-base font-semibold">{currentItem.example_en}</div>
                  <div className={`text-xs sm:text-sm ${mutedText}`}>{currentItem.example_bn}</div>
                </div>

                {/* Single Clear Next Action Footer */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={cardIndex === 0}
                    onClick={() => {
                      stopSpeaking();
                      setRecordedAudioUrl(null);
                      setCardIndex(i => Math.max(0, i - 1));
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-bold disabled:opacity-40 cursor-pointer ${
                      isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" /> আগের কার্ড
                  </button>

                  {cardIndex < activeBatch.items.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopSpeaking();
                        setRecordedAudioUrl(null);
                        setCardIndex(i => i + 1);
                      }}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <span>পরের কার্ড ({cardIndex + 2}/{activeBatch.items.length})</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startQuizStep}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <span>ধাপ ২: Batch Quiz শুরু করুন</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: BATCH QUIZ (>= 4/5 = 80% REQUIRED) */}
        {step === 'quiz' && (
          <div className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${cardSurface}`}>
            <div>
              <h3 className="text-lg font-bold">ধাপ ২: Batch Quiz ({activeBatch.quiz.total_score}টি প্রশ্ন)</h3>
              <p className={`text-xs sm:text-sm mt-1 ${mutedText}`}>
                প্রতিটি প্রশ্নের অর্থ ও ব্যবহার নিজের ভাষায় বাংলা বা ইংরেজিতে লিখুন। অন্তত{' '}
                <strong>
                  {activeBatch.quiz.pass_score}/{activeBatch.quiz.total_score} (৮০%)
                </strong>{' '}
                পেলে AI Interview ধাপ unlock হবে। যতবার খুশি retry করা যাবে।
              </p>
            </div>

            <div className="space-y-4">
              {activeBatch.quiz.questions.map(q => {
                const graded = quizResult?.results.find(r => r.index === q.index);
                return (
                  <div
                    key={q.index}
                    className={`rounded-xl border p-4 space-y-2.5 ${
                      isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      {q.index + 1}. {q.prompt_bn}
                    </div>
                    <textarea
                      rows={2}
                      value={quizInputs[q.index] || ''}
                      onChange={e => setQuizInputs(prev => ({ ...prev, [q.index]: e.target.value }))}
                      placeholder="আগে নিজের উত্তর লিখুন (বাংলা অর্থ + কোন পরিস্থিতিতে ব্যবহার করবেন)..."
                      className="w-full px-3.5 py-2 rounded-xl border text-sm"
                    />
                    {graded && (
                      <div
                        className={`rounded-xl p-3 text-xs space-y-1 border ${
                          graded.correct
                            ? isDark
                              ? 'bg-emerald-950/30 border-emerald-500/30'
                              : 'bg-emerald-50 border-emerald-200'
                            : isDark
                            ? 'bg-rose-950/30 border-rose-500/30'
                            : 'bg-rose-50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className={graded.correct ? 'text-emerald-500' : 'text-rose-500'}>
                            {graded.correct ? '✓ সঠিক / গ্রহণযোগ্য' : '✗ সংশোধন প্রয়োজন'} (স্কোর: {graded.score}/1)
                          </span>
                        </div>
                        <div>
                          <strong>ব্যাখ্যা:</strong> {graded.explanation_bn}
                        </div>
                        <div>
                          <strong>স্বাভাবিক রূপ:</strong> {graded.natural_correction}
                        </div>
                        {graded.new_example_en && (
                          <div className={mutedText}>
                            <strong>নতুন উদাহরণ:</strong> {graded.new_example_en}{' '}
                            {graded.new_example_bn ? `— ${graded.new_example_bn}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {quizResult && (
              <div
                className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  quizResult.passed
                    ? isDark
                      ? 'bg-emerald-950/30 border-emerald-500/30'
                      : 'bg-emerald-50 border-emerald-200'
                    : isDark
                    ? 'bg-amber-950/30 border-amber-500/30'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold flex items-center gap-2">
                    {quizResult.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-amber-500" />
                    )}
                    <span>
                      ফলাফল: {quizResult.total_score}/{quizResult.max_score} ({quizResult.percent}%) —{' '}
                      {quizResult.passed ? 'Quiz পাস!' : 'আবার চেষ্টা করুন'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed">{quizResult.summary_bn}</p>
                </div>

                {quizResult.passed ? (
                  <button
                    type="button"
                    onClick={startInterviewStep}
                    className="shrink-0 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <span>ধাপ ৩: AI Interview শুরু করুন</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setQuizResult(null);
                      setStep('cards');
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> কার্ড দেখে আবার চেষ্টা করুন
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('cards')}
                className={`px-4 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                  isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                ← কার্ডে ফিরুন
              </button>
              <button
                type="button"
                disabled={gradingQuiz}
                onClick={submitQuiz}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
              >
                {gradingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{gradingQuiz ? 'AI যাচাই করছে...' : 'Quiz জমা দিন'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: BATCH AI INTERVIEW (One Q at a Time -> Rubric >= 16/20 unlocks next batch) */}
        {step === 'interview' && (
          <div className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold">ধাপ ৩: Batch AI Interview</h3>
                <p className={`text-xs mt-0.5 ${mutedText}`}>
                  Closed প্রশ্ন → Open-ended প্রশ্ন → বাস্তব Role-Play। Rubric-এ অন্তত ১৬/২০ (৮০%) পেলে পরের ব্যাচ
                  unlock হবে।
                </p>
              </div>
              <button
                type="button"
                onClick={startInterviewStep}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                  isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" /> নতুন করে শুরু
              </button>
            </div>

            {interviewIntro && (
              <div
                className={`rounded-xl p-3.5 text-xs leading-relaxed border ${
                  isDark ? 'bg-violet-950/20 border-violet-500/25' : 'bg-violet-50 border-violet-200'
                }`}
              >
                {interviewIntro}
              </div>
            )}

            {/* Completed Turns Transcript */}
            {interviewHistory.length > 0 && (
              <div className="space-y-3">
                {interviewHistory.map((turn, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-4 space-y-2 text-xs ${
                      isDark ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-sky-500 uppercase">
                      ধাপ {idx + 1} ({turn.stage})
                    </div>
                    <div className="font-semibold">{turn.prompt_bn}</div>
                    {turn.prompt_en && <div className="italic text-sky-500">“{turn.prompt_en}”</div>}
                    <div className={`p-2.5 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-white border border-slate-200'}`}>
                      <strong>আপনার উত্তর:</strong> {turn.user_answer}
                    </div>
                    {turn.feedback_bn && (
                      <div className="text-emerald-600 dark:text-emerald-400">
                        <strong>AI ফিডব্যাক:</strong> {turn.feedback_bn}
                      </div>
                    )}
                    {turn.natural_version_en && (
                      <div>
                        <strong>স্বাভাবিক ইংরেজি রূপ:</strong> {turn.natural_version_en}
                      </div>
                    )}
                    {turn.priority_corrections && turn.priority_corrections.length > 0 && (
                      <ul className="space-y-1 pl-3 border-l-2 border-amber-500">
                        {turn.priority_corrections.map((c, ci) => (
                          <li key={ci}>
                            <span className="line-through text-rose-500">{c.original}</span> →{' '}
                            <span className="font-bold text-emerald-500">{c.natural}</span> ({c.reason_bn})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Current Active Question */}
            {currentQuestion && !interviewFinal && (
              <div
                className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                  isDark ? 'bg-sky-950/20 border-sky-500/30' : 'bg-sky-50/70 border-sky-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-sky-500">
                    প্রশ্ন {interviewHistory.length + 1} / 4 · {currentQuestion.stage}
                  </span>
                  {currentQuestion.prompt_en && (
                    <button
                      type="button"
                      onClick={() => speakEnglish(currentQuestion.prompt_en!, { rate: 0.92 })}
                      className="inline-flex items-center gap-1 text-xs font-bold text-sky-500 hover:underline cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> শুনুন
                    </button>
                  )}
                </div>
                <div className="text-sm sm:text-base font-bold">{currentQuestion.prompt_bn}</div>
                {currentQuestion.prompt_en && (
                  <div className="text-sm font-semibold text-sky-600 dark:text-sky-300">
                    “{currentQuestion.prompt_en}”
                  </div>
                )}

                {micWarning && <div className="text-xs text-amber-500">{micWarning}</div>}

                <textarea
                  rows={3}
                  value={interviewInput}
                  onChange={e => setInterviewInput(e.target.value)}
                  placeholder="আপনার উত্তর বলুন (মাইক্রোফোন) বা ইংরেজিতে লিখুন..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={toggleInterviewMic}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                      isMicListening
                        ? 'bg-rose-600 text-white'
                        : 'bg-violet-600 hover:bg-violet-500 text-white'
                    }`}
                  >
                    {isMicListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{isMicListening ? 'মাইক্রোফোন বন্ধ' : 'মুখে বলুন (English STT)'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={sendingTurn || !interviewInput.trim()}
                    onClick={submitInterviewAnswer}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {sendingTurn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{sendingTurn ? 'মূল্যায়ন হচ্ছে...' : 'উত্তর পাঠান'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Final Rubric Card */}
            {interviewFinal && (
              <div
                className={`rounded-2xl border p-5 space-y-4 ${
                  interviewFinal.passed
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
                    <div className="text-base font-extrabold flex items-center gap-2">
                      {interviewFinal.passed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-amber-500" />
                      )}
                      <span>
                        Interview ফলাফল: {interviewFinal.rubric.total}/20 ({interviewFinal.rubric.percent}%) —{' '}
                        {interviewFinal.passed ? 'পাস! পরের ব্যাচ Unlock হয়েছে' : 'পুনরায় অনুশীলন প্রয়োজন'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm mt-1">{interviewFinal.summary_bn}</p>
                  </div>

                  {interviewFinal.passed && nextBatchSummary ? (
                    <button
                      type="button"
                      onClick={() => openBatch(nextBatchSummary.batch_id, progress.preferredBatchSize)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <span>পরের ব্যাচ খুলুন ({nextBatchSummary.batch_id})</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startInterviewStep}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Interview আবার দিন
                    </button>
                  )}
                </div>

                {/* 5-Criterion Rubric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {[
                    ['Meaning', interviewFinal.rubric.meaning_or_relevance],
                    ['Context', interviewFinal.rubric.contextual_use_or_clarity],
                    ['Grammar', interviewFinal.rubric.grammar],
                    ['Intelligibility', interviewFinal.rubric.pronunciation_intelligibility],
                    ['Fluency', interviewFinal.rubric.fluency],
                  ].map(([label, score]) => (
                    <div key={String(label)} className={`rounded-xl p-3 border ${cardSurface}`}>
                      <div className={mutedText}>{label}</div>
                      <div className="text-base font-bold mt-0.5">{score}/4</div>
                    </div>
                  ))}
                </div>

                {interviewFinal.remediation_advice_bn && (
                  <div className="text-xs leading-relaxed">
                    <strong>পরামর্শ:</strong> {interviewFinal.remediation_advice_bn}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // BATCH BROWSER (Level filter + Lock/Unlock visual clarity)
  // =========================================================================
  return (
    <div className="space-y-5" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      <div className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-500">
              <Layers className="w-4 h-4" />
              <span>Vocabulary &amp; Sentence Master Class</span>
            </div>
            <h2 className="text-xl font-bold mt-0.5">ব্যাচভিত্তিক শব্দ, Chunk ও Collocation অনুশীলন</h2>
            <p className={`text-xs mt-1 ${mutedText}`}>
              প্রতি ব্যাচে ৫টি আইটেম (সর্বোচ্চ ৭টি) → Quiz ৮০% + AI Interview ৮০% পাস করলেই পরের ব্যাচ unlock হবে।
            </p>
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="শব্দ, topic বা batch ID খুঁজুন..."
            className="sm:w-64 px-3.5 py-2 rounded-xl border text-xs"
          />
        </div>

        {/* CEFR Level Switcher */}
        <div className="flex flex-wrap gap-1.5">
          {CEFR_LEVELS.map(lv => (
            <button
              key={lv}
              type="button"
              onClick={() => onChangeLevel(lv)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedLevel === lv
                  ? 'bg-sky-600 text-white'
                  : isDark
                  ? 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {loadingList || loadingBatch ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
          <span className={mutedText}>ব্যাচ লোড হচ্ছে...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredBatches.map(b => {
            const unlocked = isBatchUnlocked(b, batches, progress);
            const rec = progress.batches[b.batch_id];
            const completed = Boolean(rec?.quizPassed && rec?.interviewPassed);

            return (
              <div
                key={b.batch_id}
                className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${cardSurface} ${
                  !unlocked ? 'opacity-65' : ''
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-sky-500">{b.batch_id}</span>
                    {completed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500">
                        <CheckCircle2 className="w-3.5 h-3.5" /> সম্পন্ন
                      </span>
                    ) : unlocked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500">
                        <Unlock className="w-3.5 h-3.5" /> আনলক
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${mutedText}`}>
                        <Lock className="w-3.5 h-3.5" /> লকড
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold capitalize">{b.topic.replace(/_/g, ' ')}</div>
                  <div className={`text-xs leading-relaxed ${mutedText}`}>
                    {b.preview_english.slice(0, 3).join(' · ')}
                    {b.preview_english.length > 3 ? ` (+${b.preview_english.length - 3})` : ''}
                  </div>
                  {rec && (
                    <div className="flex items-center gap-3 text-[11px] pt-1">
                      <span className={rec.quizPassed ? 'text-emerald-500 font-semibold' : mutedText}>
                        Quiz: {rec.bestQuizScore}/{rec.bestQuizMax}
                      </span>
                      <span className={rec.interviewPassed ? 'text-emerald-500 font-semibold' : mutedText}>
                        Interview: {rec.bestInterviewScore}/20
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => openBatch(b.batch_id, progress.preferredBatchSize)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition ${
                    unlocked
                      ? isDark
                        ? 'bg-white text-slate-950 hover:bg-zinc-200 cursor-pointer'
                        : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                      : 'bg-slate-500/15 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {completed
                    ? 'পুনরায় অনুশীলন করুন'
                    : unlocked
                    ? 'ব্যাচ শুরু করুন'
                    : 'আগের ব্যাচের Quiz + Interview পাস করুন'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
