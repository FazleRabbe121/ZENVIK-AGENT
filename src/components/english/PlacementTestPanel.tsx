import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Compass,
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
  PlacementTestData,
  PlacementEvaluationResult,
} from '../../types/englishLearning';

interface PlacementTestPanelProps {
  onApplyStartLevel: (recommended: CEFRLevel, chosenStart: CEFRLevel, summaryBn: string) => void;
}

export const PlacementTestPanel: React.FC<PlacementTestPanelProps> = ({ onApplyStartLevel }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [data, setData] = useState<PlacementTestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [writingText, setWritingText] = useState('');
  const [speakingText, setSpeakingText] = useState('');
  const [showListeningScript, setShowListeningScript] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const recognizerRef = useRef<SpeechRecognizerHandle | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PlacementEvaluationResult | null>(null);

  useEffect(() => {
    let active = true;
    englishLearningApi
      .getPlacementTest()
      .then(res => {
        if (active) setData(res);
      })
      .catch(err => {
        if (active) setError(err?.message || 'Placement test লোড করা যায়নি।');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      stopSpeaking();
      recognizerRef.current?.stop();
    };
  }, []);

  const toggleMic = () => {
    if (isRecording) {
      recognizerRef.current?.stop();
      setIsRecording(false);
      return;
    }
    setMicNote(null);
    const handle = startEnglishSpeechRecognition({
      onTranscript: (finalText, interim) => {
        setSpeakingText((finalText + (interim ? ' ' + interim : '')).trim());
      },
      onError: msg => {
        setMicNote(msg);
        setIsRecording(false);
      },
      onEnd: () => setIsRecording(false),
    });
    if (handle) {
      recognizerRef.current = handle;
      setIsRecording(true);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await englishLearningApi.evaluatePlacement({
        answers,
        writingText,
        speakingText,
      });
      setResult(res);
      setShowListeningScript(true);
    } catch (err: any) {
      setError(err?.message || 'মূল্যায়ন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setAnswers({});
    setWritingText('');
    setSpeakingText('');
    setResult(null);
    setShowListeningScript(false);
  };

  const cardSurface = isDark
    ? 'bg-[#1a1d24] border-white/[0.08] text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDark ? 'text-zinc-400' : 'text-slate-600';

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
        <span className={`text-sm ${mutedText}`}>Placement Test লোড হচ্ছে...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`rounded-2xl border p-6 text-sm text-rose-500 ${cardSurface}`}>{error}</div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className={`rounded-2xl border p-5 sm:p-6 ${cardSurface}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-500">
              <Compass className="w-4 h-4" />
              <span>English Level Placement Screening</span>
            </div>
            <h2 className="text-xl font-bold mt-1">প্রাথমিক স্তর নির্ধারণ পরীক্ষা</h2>
            <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${mutedText}`}>{data.disclaimer_bn}</p>
          </div>
          <button
            type="button"
            onClick={() => onApplyStartLevel('Pre-A1', 'Pre-A1', 'শিক্ষার্থী সরাসরি Pre-A1 থেকে শুরু করার সিদ্ধান্ত নিয়েছেন।')}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              isDark
                ? 'border-white/15 hover:bg-white/[0.06] text-zinc-200'
                : 'border-slate-300 hover:bg-slate-50 text-slate-800'
            }`}
          >
            সরাসরি Pre-A1 থেকে শুরু করুন
          </button>
        </div>
      </div>

      {/* Result Banner */}
      {result && (
        <div
          className={`rounded-2xl border p-6 space-y-4 ${
            isDark ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                প্রস্তাবিত শুরুর স্তর (Recommended Start)
              </div>
              <div className="text-2xl font-extrabold mt-0.5">{result.recommended_level}</div>
              <p className="text-sm mt-1 leading-relaxed">{result.summary_bn}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onApplyStartLevel(result.recommended_level, result.recommended_level, result.summary_bn)
                }
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                {result.recommended_level} দিয়ে শুরু করুন
              </button>
              <button
                type="button"
                onClick={() => onApplyStartLevel(result.recommended_level, 'Pre-A1', result.summary_bn)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-slate-300 bg-white text-slate-900'
                }`}
              >
                তবুও Pre-A1 থেকে শুরু করব
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            <div className={`rounded-xl p-3 border ${cardSurface}`}>
              <div className={mutedText}>Part A Grammar</div>
              <div className="text-base font-bold mt-0.5">
                {result.part_a_score}/{result.part_a_total}
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${cardSurface}`}>
              <div className={mutedText}>Part B Reading</div>
              <div className="text-base font-bold mt-0.5">
                {result.part_b_score}/{result.part_b_total}
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${cardSurface}`}>
              <div className={mutedText}>Part C Listening</div>
              <div className="text-base font-bold mt-0.5">
                {result.part_c_score}/{result.part_c_total}
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${cardSurface}`}>
              <div className={mutedText}>Part D Writing</div>
              <div className="text-base font-bold mt-0.5">{result.writing_score}/20</div>
            </div>
            <div className={`rounded-xl p-3 border ${cardSurface}`}>
              <div className={mutedText}>Part E Speaking</div>
              <div className="text-base font-bold mt-0.5">{result.speaking_score}/20</div>
            </div>
          </div>

          {(result.strengths_bn.length > 0 || result.focus_areas_bn.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {result.strengths_bn.length > 0 && (
                <div className={`rounded-xl p-3.5 border ${cardSurface}`}>
                  <div className="font-bold text-emerald-500 mb-1.5">আপনার শক্তিশালী দিক</div>
                  <ul className="space-y-1 list-disc list-inside">
                    {result.strengths_bn.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.focus_areas_bn.length > 0 && (
                <div className={`rounded-xl p-3.5 border ${cardSurface}`}>
                  <div className="font-bold text-amber-500 mb-1.5">যেখানে মনোযোগ দেবেন</div>
                  <ul className="space-y-1 list-disc list-inside">
                    {result.focus_areas_bn.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Answer key review */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold">উত্তর পর্যালোচনা (Answer Key)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.answer_review.map(item => (
                <div key={item.id} className={`rounded-xl p-3 border text-xs ${cardSurface}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold">{item.id}</span>
                    {item.correct ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> সঠিক
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-500 font-bold">
                        <XCircle className="w-3.5 h-3.5" /> সংশোধন প্রয়োজন
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 ${mutedText}`}>আপনার উত্তর: {item.user_answer || '—'}</div>
                  <div className="mt-0.5 font-medium">সম্ভাব্য উত্তর: {item.expected_answer}</div>
                  <div className={`mt-1 ${mutedText}`}>{item.explanation_bn}</div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> আবার Placement Test দিন
          </button>
        </div>
      )}

      {/* Part A: Grammar & Vocabulary */}
      <div className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${cardSurface}`}>
        <h3 className="text-base font-bold">Part A — Grammar &amp; Vocabulary (১০টি প্রশ্ন)</h3>
        <div className="space-y-3.5">
          {data.part_a.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <div className="text-sm font-medium">
                {idx + 1}. {q.prompt}
              </div>
              <div className="flex flex-wrap gap-2">
                {q.options.map(opt => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        selected
                          ? 'bg-sky-600 text-white border-sky-600'
                          : isDark
                          ? 'border-white/15 hover:bg-white/[0.06] text-zinc-200'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Part B: Reading */}
      <div className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${cardSurface}`}>
        <h3 className="text-base font-bold">Part B — Reading Comprehension</h3>
        <div
          className={`rounded-xl p-4 text-sm leading-relaxed border ${
            isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          “{data.part_b.passage_en}”
        </div>
        <div className="space-y-3">
          {data.part_b.questions.map((q, idx) => (
            <div key={q.id} className="space-y-1.5">
              <label className="text-xs font-semibold block">
                {idx + 1}. {q.prompt}
              </label>
              <input
                type="text"
                value={answers[q.id] || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="ইংরেজিতে সংক্ষিপ্ত উত্তর লিখুন..."
                className="w-full px-3.5 py-2 rounded-xl border text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Part C: Listening (TTS) */}
      <div className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">Part C — Listening (TTS Audio)</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => speakEnglish(data.part_c.script_en, { rate: 0.95 })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
            >
              <Volume2 className="w-4 h-4" /> শুনুন (Normal)
            </button>
            <button
              type="button"
              onClick={() => speakEnglish(data.part_c.script_en, { rate: 0.72 })}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                isDark ? 'border-white/15 hover:bg-white/[0.06]' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              ধীরে শুনুন (0.72x)
            </button>
          </div>
        </div>
        <p className={`text-xs ${mutedText}`}>
          আগে অডিও শুনে উত্তর দেওয়ার চেষ্টা করুন। জমা দেওয়ার পর সম্পূর্ণ script দেখতে পাবেন।
        </p>
        {showListeningScript && (
          <div
            className={`rounded-xl p-4 text-sm leading-relaxed border ${
              isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[11px] font-bold uppercase text-sky-500 mb-1">Listening Script</div>
            “{data.part_c.script_en}”
          </div>
        )}
        <div className="space-y-3">
          {data.part_c.questions.map((q, idx) => (
            <div key={q.id} className="space-y-1.5">
              <label className="text-xs font-semibold block">
                {idx + 1}. {q.prompt}
              </label>
              <input
                type="text"
                value={answers[q.id] || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="শুনে উত্তর লিখুন..."
                className="w-full px-3.5 py-2 rounded-xl border text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Part D: Writing */}
      <div className={`rounded-2xl border p-5 sm:p-6 space-y-3 ${cardSurface}`}>
        <h3 className="text-base font-bold">Part D — Writing</h3>
        <p className="text-xs sm:text-sm font-medium">{data.part_d.prompt_bn}</p>
        <p className={`text-xs ${mutedText}`}>{data.part_d.prompt_en}</p>
        <textarea
          rows={4}
          value={writingText}
          onChange={e => setWritingText(e.target.value)}
          placeholder="এখানে ইংরেজিতে লিখুন..."
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
        />
      </div>

      {/* Part E: Speaking */}
      <div className={`rounded-2xl border p-5 sm:p-6 space-y-3 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">Part E — Speaking</h3>
          <button
            type="button"
            onClick={toggleMic}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              isRecording
                ? 'bg-rose-600 text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isRecording ? 'রেকর্ডিং থামান' : 'মাইক্রোফোনে বলুন'}</span>
          </button>
        </div>
        <p className="text-xs sm:text-sm font-medium">{data.part_e.prompt_bn}</p>
        <p className={`text-xs ${mutedText}`}>{data.part_e.prompt_en}</p>
        {micNote && <div className="text-xs text-amber-500">{micNote}</div>}
        <textarea
          rows={3}
          value={speakingText}
          onChange={e => setSpeakingText(e.target.value)}
          placeholder="মাইক্রোফোনে বললে এখানে লেখা উঠবে, অথবা সরাসরি আপনার spoken response টাইপ করুন..."
          className="w-full px-3.5 py-2.5 rounded-xl border text-sm"
        />
      </div>

      {error && <div className="text-sm text-rose-500 font-medium">{error}</div>}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold text-sm cursor-pointer"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{submitting ? 'AI মূল্যায়ন করছে...' : 'জমা দিন ও স্তর নির্ধারণ করুন'}</span>
        </button>
      </div>
    </div>
  );
};
