import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  Compass,
  GraduationCap,
  Home,
  Layers,
  Loader2,
  Mic,
  TrendingUp,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { englishLearningApi } from '../services/englishLearningService';
import {
  loadLocalEnglishProgress,
  loadSyncedEnglishProgress,
  saveSyncedEnglishProgress,
  recordBatchCardsStudied,
  recordBatchQuizOutcome,
  recordBatchInterviewOutcome,
  recordLessonProgress,
  recordLevelTestOutcome,
  updateWordMastery,
  appendErrorLogs,
  toggleSavedPhrase,
  setLastSessionPointer,
} from '../services/englishProgressService';
import type {
  CEFRLevel,
  EnglishBootstrapResponse,
  EnglishLearningProgress,
  EnglishSubView,
  VocabItem,
  BatchQuizEvaluationResult,
  LessonProgressRecord,
  ReviewTestEvaluationResult,
} from '../types/englishLearning';
import { CourseHomePanel } from '../components/english/CourseHomePanel';
import { PlacementTestPanel } from '../components/english/PlacementTestPanel';
import { LevelLessonPanel } from '../components/english/LevelLessonPanel';
import { VocabMasterClassPanel } from '../components/english/VocabMasterClassPanel';
import { AIInterviewStudioPanel } from '../components/english/AIInterviewStudioPanel';
import { LevelReviewTestPanel } from '../components/english/LevelReviewTestPanel';
import { ProgressReviewPanel } from '../components/english/ProgressReviewPanel';

interface EnglishLearningViewProps {
  userId?: string | null;
}

export const EnglishLearningView: React.FC<EnglishLearningViewProps> = ({ userId }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [bootstrap, setBootstrap] = useState<EnglishBootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState<EnglishLearningProgress>(() => loadLocalEnglishProgress());
  const [subView, setSubView] = useState<EnglishSubView>('home');
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>(() => loadLocalEnglishProgress().currentLevel);
  const [targetLessonId, setTargetLessonId] = useState<string | undefined>(undefined);
  const [targetBatchId, setTargetBatchId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([englishLearningApi.getBootstrap(), loadSyncedEnglishProgress(userId)])
      .then(([boot, syncedProgress]) => {
        if (!active) return;
        setBootstrap(boot);
        setProgress(syncedProgress);
        setSelectedLevel(syncedProgress.currentLevel);
      })
      .catch(err => {
        if (active) setError(err?.message || 'English Learning Module লোড করা যায়নি।');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const commitProgress = (updater: (prev: EnglishLearningProgress) => EnglishLearningProgress) => {
    setProgress(prev => {
      const next = updater(prev);
      saveSyncedEnglishProgress(next, userId).catch(() => {});
      return next;
    });
  };

  const handleNavigate = (
    nextView: EnglishSubView,
    opts?: { level?: CEFRLevel; lessonId?: string; batchId?: string }
  ) => {
    if (opts?.level) setSelectedLevel(opts.level);
    setTargetLessonId(opts?.lessonId);
    setTargetBatchId(opts?.batchId);
    setSubView(nextView);
  };

  const handleApplyPlacement = (recommended: CEFRLevel, chosenStart: CEFRLevel, summaryBn: string) => {
    setSelectedLevel(chosenStart);
    commitProgress(prev => ({
      ...prev,
      currentLevel: chosenStart,
      placement: {
        completedAt: new Date().toISOString(),
        recommendedLevel: recommended,
        selectedStartLevel: chosenStart,
        summaryBn,
      },
      lastSession: {
        subView: 'lessons',
        level: chosenStart,
        labelBn: `${chosenStart} স্তর থেকে শুরু`,
        updatedAt: new Date().toISOString(),
      },
    }));
    setSubView('home');
  };

  const handleCardsStudied = (batchId: string, level: CEFRLevel, itemIds: string[]) => {
    commitProgress(prev => recordBatchCardsStudied(prev, batchId, level, itemIds));
  };

  const handleQuizCompleted = (
    batchId: string,
    level: CEFRLevel,
    result: BatchQuizEvaluationResult
  ) => {
    commitProgress(prev => {
      let next = recordBatchQuizOutcome(
        prev,
        batchId,
        level,
        result.total_score,
        result.max_score,
        result.passed,
        result.results.map(r => ({ itemId: r.source_item_id, correct: r.correct }))
      );
      const wrongLogs = result.results
        .filter(r => !r.correct)
        .map(r => ({
          source: 'batch_quiz' as const,
          level,
          itemId: r.source_item_id,
          prompt: r.prompt_bn,
          userAnswer: r.user_answer,
          naturalCorrection: r.natural_correction,
          reasonBn: r.explanation_bn,
        }));
      next = appendErrorLogs(next, wrongLogs);
      return next;
    });
  };

  const handleInterviewCompleted = (
    batchId: string,
    level: CEFRLevel,
    scoreOutOf20: number,
    passed: boolean,
    allItemIds: string[],
    remediationItemIds: string[],
    corrections: Array<{ original: string; natural: string; reason_bn: string }>
  ) => {
    commitProgress(prev => {
      let next = recordBatchInterviewOutcome(
        prev,
        batchId,
        level,
        scoreOutOf20,
        passed,
        allItemIds,
        remediationItemIds
      );
      if (corrections.length > 0) {
        next = appendErrorLogs(
          next,
          corrections.slice(0, 5).map(c => ({
            source: 'batch_interview' as const,
            level,
            prompt: `Batch Interview (${batchId})`,
            userAnswer: c.original,
            naturalCorrection: c.natural,
            reasonBn: c.reason_bn,
          }))
        );
      }
      return next;
    });
  };

  const handleToggleSavePhrase = (item: VocabItem) => {
    commitProgress(prev =>
      toggleSavedPhrase(prev, {
        id: item.id,
        english: item.english,
        banglaMeaning: item.bangla_meaning,
        approxPronunciationBn: item.approx_pronunciation_bn,
        ipa: item.ipa,
        exampleEn: item.example_en,
        exampleBn: item.example_bn,
        level: item.level,
      })
    );
  };

  const handleUpdateLessonProgress = (
    lessonId: string,
    level: CEFRLevel,
    patch: Partial<LessonProgressRecord>
  ) => {
    commitProgress(prev => recordLessonProgress(prev, lessonId, level, patch));
  };

  const handleTestEvaluated = (res: ReviewTestEvaluationResult) => {
    commitProgress(prev => {
      let next = recordLevelTestOutcome(prev, res.level, {
        objective: res.objective_score,
        writing: res.writing_score,
        speaking: res.speaking_score,
        total: res.total_score,
        passed: res.passed,
      });
      const missed = res.question_results
        .filter(q => !q.correct)
        .slice(0, 8)
        .map(q => ({
          source: 'level_test' as const,
          level: res.level,
          prompt: q.prompt,
          userAnswer: q.user_answer,
          naturalCorrection: q.expected_answer,
          reasonBn: q.explanation_bn,
        }));
      next = appendErrorLogs(next, missed);
      return next;
    });
  };

  const navItems: Array<{ id: EnglishSubView; label: string; icon: any }> = [
    { id: 'home', label: 'Course Home', icon: Home },
    { id: 'placement', label: 'Placement', icon: Compass },
    { id: 'lessons', label: 'পাঠ (Lessons)', icon: BookOpen },
    { id: 'vocabulary', label: 'Vocabulary Class', icon: Layers },
    { id: 'interview', label: 'AI Interview', icon: Mic },
    { id: 'level-test', label: 'Level Test', icon: ClipboardCheck },
    { id: 'progress', label: 'রিভিউ ও রিপোর্ট', icon: TrendingUp },
  ];

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
        <div className={`text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
          English Zero-to-C2 কোর্স প্যাকেজ লোড হচ্ছে...
        </div>
      </div>
    );
  }

  if (error || !bootstrap) {
    return (
      <div
        className={`rounded-2xl border p-6 max-w-2xl mx-auto my-8 text-sm ${
          isDark
            ? 'bg-[#1a1d24] border-rose-500/30 text-rose-400'
            : 'bg-white border-rose-200 text-rose-600'
        }`}
      >
        <div className="font-bold mb-1">English Learning Module লোড ব্যর্থ হয়েছে</div>
        <div>{error || 'সোর্স প্যাকেজ পাওয়া যায়নি।'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12" style={{ fontFamily: "'Noto Sans Bengali', 'Plus Jakarta Sans', sans-serif" }}>
      {/* Module Sticky Navigation Bar */}
      <div
        className={`rounded-2xl border px-3 py-2.5 flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'bg-[#17191f] border-white/[0.08]' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2 px-1">
          <div className="p-1.5 rounded-xl bg-sky-600 text-white">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className={`text-xs font-extrabold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              English Zero-to-C2
            </div>
            <div className="text-[10px] text-sky-500 font-semibold">
              Pre-A1 → C2 · Master Class &amp; AI Interview
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = subView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  active
                    ? isDark
                      ? 'bg-white text-slate-950'
                      : 'bg-slate-900 text-white'
                    : isDark
                    ? 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Screen */}
      {subView === 'home' && (
        <CourseHomePanel
          bootstrap={bootstrap}
          progress={progress}
          onNavigate={handleNavigate}
          onSelectLevel={lv => {
            setSelectedLevel(lv);
            commitProgress(prev => ({ ...prev, currentLevel: lv }));
          }}
        />
      )}

      {subView === 'placement' && (
        <PlacementTestPanel onApplyStartLevel={handleApplyPlacement} />
      )}

      {subView === 'lessons' && (
        <LevelLessonPanel
          bootstrap={bootstrap}
          selectedLevel={selectedLevel}
          initialLessonId={targetLessonId}
          progress={progress}
          onChangeLevel={lv => {
            setSelectedLevel(lv);
            setTargetLessonId(undefined);
            commitProgress(prev => ({ ...prev, currentLevel: lv }));
          }}
          onUpdateLessonProgress={handleUpdateLessonProgress}
          onTrackSession={(level, lessonId, labelBn) =>
            commitProgress(prev =>
              setLastSessionPointer(prev, { subView: 'lessons', level, lessonId, labelBn })
            )
          }
        />
      )}

      {subView === 'vocabulary' && (
        <VocabMasterClassPanel
          selectedLevel={selectedLevel}
          initialBatchId={targetBatchId}
          progress={progress}
          onChangeLevel={lv => {
            setSelectedLevel(lv);
            setTargetBatchId(undefined);
            commitProgress(prev => ({ ...prev, currentLevel: lv }));
          }}
          onChangeBatchSize={size =>
            commitProgress(prev => ({ ...prev, preferredBatchSize: size }))
          }
          onCardsStudied={handleCardsStudied}
          onQuizCompleted={handleQuizCompleted}
          onInterviewCompleted={handleInterviewCompleted}
          onToggleSavePhrase={handleToggleSavePhrase}
          onTrackSession={(level, batchId, labelBn) =>
            commitProgress(prev =>
              setLastSessionPointer(prev, { subView: 'vocabulary', level, batchId, labelBn })
            )
          }
        />
      )}

      {subView === 'interview' && (
        <AIInterviewStudioPanel
          currentLevel={selectedLevel}
          onLogCorrections={(role, prompt, userAnswer, corrections) =>
            commitProgress(prev =>
              appendErrorLogs(
                prev,
                corrections.map(c => ({
                  source: 'role_interview' as const,
                  level: selectedLevel,
                  prompt: `[${role}] ${prompt}`,
                  userAnswer: c.original || userAnswer,
                  naturalCorrection: c.natural,
                  reasonBn: c.reason_bn,
                }))
              )
            )
          }
        />
      )}

      {subView === 'level-test' && (
        <LevelReviewTestPanel
          selectedLevel={selectedLevel}
          progress={progress}
          onChangeLevel={lv => setSelectedLevel(lv)}
          onTestEvaluated={handleTestEvaluated}
        />
      )}

      {subView === 'progress' && (
        <ProgressReviewPanel
          bootstrap={bootstrap}
          progress={progress}
          onRecordReviewOutcome={(itemId, level, remembered) =>
            commitProgress(prev => updateWordMastery(prev, itemId, level, remembered))
          }
          onRemoveSavedPhrase={id =>
            commitProgress(prev => ({
              ...prev,
              savedPhrases: prev.savedPhrases.filter(p => p.id !== id),
            }))
          }
        />
      )}
    </div>
  );
};
