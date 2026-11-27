import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type {
  CEFRLevel,
  EnglishLearningProgress,
  WordMasteryRecord,
  BatchProgressRecord,
  LessonProgressRecord,
  LevelTestProgressRecord,
  ErrorLogEntry,
  SavedPhrase,
  LastSessionPointer,
  VocabBatchSummary,
} from '../types/englishLearning';

const LOCAL_STORAGE_KEY = 'ccd_english_zero_to_c2_progress_v1';

export function createDefaultProgress(): EnglishLearningProgress {
  return {
    version: 1,
    currentLevel: 'Pre-A1',
    preferredBatchSize: 5,
    words: {},
    batches: {},
    lessons: {},
    levelTests: {},
    errorLog: [],
    savedPhrases: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadLocalEnglishProgress(): EnglishLearningProgress {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return createDefaultProgress();
    const parsed = JSON.parse(raw) as Partial<EnglishLearningProgress>;
    return {
      ...createDefaultProgress(),
      ...parsed,
      words: parsed.words || {},
      batches: parsed.batches || {},
      lessons: parsed.lessons || {},
      levelTests: parsed.levelTests || {},
      errorLog: Array.isArray(parsed.errorLog) ? parsed.errorLog : [],
      savedPhrases: Array.isArray(parsed.savedPhrases) ? parsed.savedPhrases : [],
    };
  } catch {
    return createDefaultProgress();
  }
}

function saveLocalEnglishProgress(progress: EnglishLearningProgress): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore quota errors
  }
}

export async function loadSyncedEnglishProgress(uid?: string | null): Promise<EnglishLearningProgress> {
  const local = loadLocalEnglishProgress();
  const effectiveUid = uid || auth.currentUser?.uid;
  if (!effectiveUid) return local;

  try {
    const snap = await getDoc(doc(db, 'users', effectiveUid, 'englishLearning', 'progress'));
    if (!snap.exists()) {
      // Seed cloud from local if local has activity
      if (Object.keys(local.words).length > 0 || Object.keys(local.batches).length > 0 || local.placement) {
        await saveSyncedEnglishProgress(local, effectiveUid);
      }
      return local;
    }
    const remote = snap.data() as EnglishLearningProgress;
    const localTime = new Date(local.updatedAt || 0).getTime();
    const remoteTime = new Date(remote.updatedAt || 0).getTime();
    if (remoteTime >= localTime) {
      const merged: EnglishLearningProgress = {
        ...createDefaultProgress(),
        ...remote,
        words: remote.words || {},
        batches: remote.batches || {},
        lessons: remote.lessons || {},
        levelTests: remote.levelTests || {},
        errorLog: Array.isArray(remote.errorLog) ? remote.errorLog : [],
        savedPhrases: Array.isArray(remote.savedPhrases) ? remote.savedPhrases : [],
      };
      saveLocalEnglishProgress(merged);
      return merged;
    }
    await saveSyncedEnglishProgress(local, effectiveUid);
    return local;
  } catch {
    return local;
  }
}

export async function saveSyncedEnglishProgress(
  progress: EnglishLearningProgress,
  uid?: string | null
): Promise<EnglishLearningProgress> {
  const stamped: EnglishLearningProgress = {
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  saveLocalEnglishProgress(stamped);

  const effectiveUid = uid || auth.currentUser?.uid;
  if (effectiveUid) {
    try {
      await setDoc(doc(db, 'users', effectiveUid, 'englishLearning', 'progress'), stamped, { merge: true });
    } catch {
      // offline fallback already saved to localStorage
    }
  }
  return stamped;
}

// ============================================================================
// SPACED REPETITION (SM-2 adapted) & INTERLEAVING ENGINE
// ============================================================================

export function updateWordMastery(
  progress: EnglishLearningProgress,
  itemId: string,
  level: CEFRLevel,
  isCorrect: boolean
): EnglishLearningProgress {
  const now = new Date();
  const prev: WordMasteryRecord = progress.words[itemId] || {
    itemId,
    level,
    status: 'new',
    attempts: 0,
    correctCount: 0,
    missCount: 0,
    streak: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: now.toISOString(),
  };

  let streak = prev.streak;
  let easeFactor = prev.easeFactor;
  let intervalDays = prev.intervalDays;
  let status = prev.status;

  if (isCorrect) {
    streak += 1;
    easeFactor = Math.min(3.0, Number((easeFactor + 0.1).toFixed(2)));
    if (streak === 1) intervalDays = 1;
    else if (streak === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * easeFactor);
    status = streak >= 2 ? 'mastered' : 'learning';
  } else {
    streak = 0;
    easeFactor = Math.max(1.3, Number((easeFactor - 0.25).toFixed(2)));
    intervalDays = 0; // Immediate return to adaptive review queue
    status = 'review_needed';
  }

  const nextReviewDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  const updatedRecord: WordMasteryRecord = {
    itemId,
    level,
    status,
    attempts: prev.attempts + 1,
    correctCount: prev.correctCount + (isCorrect ? 1 : 0),
    missCount: prev.missCount + (isCorrect ? 0 : 1),
    streak,
    easeFactor,
    intervalDays,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReviewDate.toISOString(),
  };

  return {
    ...progress,
    words: {
      ...progress.words,
      [itemId]: updatedRecord,
    },
  };
}

/**
 * Builds an interleaved adaptive review queue:
 * 1. Review-needed / missed items (highest priority)
 * 2. Due spaced-repetition items (nextReviewAt <= now)
 * 3. Interleaved older mastered or learning items for retrieval practice
 */
export function buildInterleavedReviewQueue(
  progress: EnglishLearningProgress,
  maxItems = 10
): WordMasteryRecord[] {
  const nowMs = Date.now();
  const records = Object.values(progress.words);

  const reviewNeeded = records
    .filter(r => r.status === 'review_needed')
    .sort((a, b) => b.missCount - a.missCount);

  const dueSpaced = records
    .filter(r => r.status !== 'review_needed' && new Date(r.nextReviewAt).getTime() <= nowMs)
    .sort((a, b) => new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime());

  const masteredPool = records
    .filter(r => r.status === 'mastered' && new Date(r.nextReviewAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.lastReviewedAt).getTime() - new Date(b.lastReviewedAt).getTime());

  const queue: WordMasteryRecord[] = [];
  const seen = new Set<string>();
  const add = (r: WordMasteryRecord) => {
    if (!seen.has(r.itemId) && queue.length < maxItems) {
      seen.add(r.itemId);
      queue.push(r);
    }
  };

  // Interleave pattern: 2 urgent/due -> 1 mastered reinforcement
  let uIdx = 0;
  let mIdx = 0;
  const urgent = [...reviewNeeded, ...dueSpaced];

  while (queue.length < maxItems && (uIdx < urgent.length || mIdx < masteredPool.length)) {
    if (uIdx < urgent.length) add(urgent[uIdx++]);
    if (uIdx < urgent.length) add(urgent[uIdx++]);
    if (mIdx < masteredPool.length) add(masteredPool[mIdx++]);
  }

  return queue;
}

// ============================================================================
// STRICT UNLOCK LOGIC (Quiz >= 80% AND Interview >= 80% unlocks next batch)
// ============================================================================

export function isBatchUnlocked(
  batch: VocabBatchSummary,
  levelBatches: VocabBatchSummary[],
  progress: EnglishLearningProgress
): boolean {
  const posInLevel = levelBatches.findIndex(b => b.batch_id === batch.batch_id);
  // First batch of every level is always unlocked so placed learners or Pre-A1 learners can start cleanly
  if (posInLevel <= 0) return true;
  const prevBatch = levelBatches[posInLevel - 1];
  const prevState = progress.batches[prevBatch.batch_id];
  return Boolean(prevState?.quizPassed && prevState?.interviewPassed);
}

export function recordBatchCardsStudied(
  progress: EnglishLearningProgress,
  batchId: string,
  level: CEFRLevel,
  itemIds: string[]
): EnglishLearningProgress {
  const now = new Date().toISOString();
  let next = { ...progress };

  // Mark unstudied items as 'learning'
  const wordsCopy = { ...next.words };
  for (const id of itemIds) {
    if (!wordsCopy[id]) {
      wordsCopy[id] = {
        itemId: id,
        level,
        status: 'learning',
        attempts: 0,
        correctCount: 0,
        missCount: 0,
        streak: 0,
        easeFactor: 2.5,
        intervalDays: 0,
        lastReviewedAt: now,
        nextReviewAt: now,
      };
    }
  }
  next.words = wordsCopy;

  const prev = next.batches[batchId];
  next.batches = {
    ...next.batches,
    [batchId]: {
      batchId,
      level,
      cardsStudied: true,
      quizAttempts: prev?.quizAttempts || 0,
      bestQuizScore: prev?.bestQuizScore || 0,
      bestQuizMax: prev?.bestQuizMax || itemIds.length,
      quizPassed: prev?.quizPassed || false,
      interviewAttempts: prev?.interviewAttempts || 0,
      bestInterviewScore: prev?.bestInterviewScore || 0,
      interviewPassed: prev?.interviewPassed || false,
      unlockedNext: prev?.unlockedNext || false,
      updatedAt: now,
    },
  };

  return next;
}

export function recordBatchQuizOutcome(
  progress: EnglishLearningProgress,
  batchId: string,
  level: CEFRLevel,
  score: number,
  maxScore: number,
  passed: boolean,
  itemResults: Array<{ itemId: string; correct: boolean }>
): EnglishLearningProgress {
  let next = { ...progress };
  for (const ir of itemResults) {
    next = updateWordMastery(next, ir.itemId, level, ir.correct);
  }
  const prev = next.batches[batchId];
  const quizPassed = Boolean(prev?.quizPassed || passed);
  const interviewPassed = Boolean(prev?.interviewPassed);

  const updatedBatch: BatchProgressRecord = {
    batchId,
    level,
    cardsStudied: true,
    quizAttempts: (prev?.quizAttempts || 0) + 1,
    bestQuizScore: Math.max(prev?.bestQuizScore || 0, score),
    bestQuizMax: maxScore,
    quizPassed,
    interviewAttempts: prev?.interviewAttempts || 0,
    bestInterviewScore: prev?.bestInterviewScore || 0,
    interviewPassed,
    unlockedNext: quizPassed && interviewPassed,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...next,
    batches: {
      ...next.batches,
      [batchId]: updatedBatch,
    },
  };
}

export function recordBatchInterviewOutcome(
  progress: EnglishLearningProgress,
  batchId: string,
  level: CEFRLevel,
  scoreOutOf20: number,
  passed: boolean,
  allItemIds: string[],
  remediationItemIds: string[]
): EnglishLearningProgress {
  let next = { ...progress };
  const weakSet = new Set(remediationItemIds);
  for (const id of allItemIds) {
    next = updateWordMastery(next, id, level, passed && !weakSet.has(id));
  }

  const prev = next.batches[batchId];
  const quizPassed = Boolean(prev?.quizPassed);
  const interviewPassed = Boolean(prev?.interviewPassed || passed);

  const updatedBatch: BatchProgressRecord = {
    batchId,
    level,
    cardsStudied: true,
    quizAttempts: prev?.quizAttempts || 0,
    bestQuizScore: prev?.bestQuizScore || 0,
    bestQuizMax: prev?.bestQuizMax || allItemIds.length,
    quizPassed,
    interviewAttempts: (prev?.interviewAttempts || 0) + 1,
    bestInterviewScore: Math.max(prev?.bestInterviewScore || 0, scoreOutOf20),
    interviewPassed,
    unlockedNext: quizPassed && interviewPassed,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...next,
    batches: {
      ...next.batches,
      [batchId]: updatedBatch,
    },
  };
}

export function recordLessonProgress(
  progress: EnglishLearningProgress,
  lessonId: string,
  level: CEFRLevel,
  patch: Partial<LessonProgressRecord>
): EnglishLearningProgress {
  const now = new Date().toISOString();
  const prev: LessonProgressRecord = progress.lessons[lessonId] || {
    lessonId,
    level,
    openedAt: now,
    miniQuizScore: 0,
    miniQuizMax: 5,
    miniQuizPassed: false,
    speakingCompleted: false,
    speakingScore: 0,
    writingCompleted: false,
    writingScore: 0,
    mastered: false,
    updatedAt: now,
  };

  const merged: LessonProgressRecord = {
    ...prev,
    ...patch,
    updatedAt: now,
  };
  merged.mastered = Boolean(
    merged.miniQuizPassed && merged.speakingCompleted && merged.writingCompleted
  );

  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: merged,
    },
  };
}

export function recordLevelTestOutcome(
  progress: EnglishLearningProgress,
  level: CEFRLevel,
  outcome: {
    objective: number;
    writing: number;
    speaking: number;
    total: number;
    passed: boolean;
  }
): EnglishLearningProgress {
  const prev = progress.levelTests[level];
  const rec: LevelTestProgressRecord = {
    level,
    attempts: (prev?.attempts || 0) + 1,
    bestTotal: Math.max(prev?.bestTotal || 0, outcome.total),
    bestObjective: Math.max(prev?.bestObjective || 0, outcome.objective),
    bestWriting: Math.max(prev?.bestWriting || 0, outcome.writing),
    bestSpeaking: Math.max(prev?.bestSpeaking || 0, outcome.speaking),
    passed: Boolean(prev?.passed || outcome.passed),
    lastAttemptAt: new Date().toISOString(),
  };

  return {
    ...progress,
    levelTests: {
      ...progress.levelTests,
      [level]: rec,
    },
  };
}

export function appendErrorLogs(
  progress: EnglishLearningProgress,
  entries: Omit<ErrorLogEntry, 'id' | 'createdAt'>[]
): EnglishLearningProgress {
  if (entries.length === 0) return progress;
  const now = new Date().toISOString();
  const stamped: ErrorLogEntry[] = entries.map((e, i) => ({
    ...e,
    id: `err_${Date.now()}_${i}`,
    createdAt: now,
  }));
  return {
    ...progress,
    errorLog: [...stamped, ...progress.errorLog].slice(0, 120),
  };
}

export function toggleSavedPhrase(
  progress: EnglishLearningProgress,
  phrase: Omit<SavedPhrase, 'savedAt'>
): EnglishLearningProgress {
  const exists = progress.savedPhrases.some(p => p.id === phrase.id);
  const nextList = exists
    ? progress.savedPhrases.filter(p => p.id !== phrase.id)
    : [{ ...phrase, savedAt: new Date().toISOString() }, ...progress.savedPhrases];
  return {
    ...progress,
    savedPhrases: nextList,
  };
}

export function setLastSessionPointer(
  progress: EnglishLearningProgress,
  pointer: Omit<LastSessionPointer, 'updatedAt'>
): EnglishLearningProgress {
  return {
    ...progress,
    lastSession: {
      ...pointer,
      updatedAt: new Date().toISOString(),
    },
  };
}
