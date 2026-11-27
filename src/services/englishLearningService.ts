import type {
  CEFRLevel,
  EnglishBootstrapResponse,
  VocabBatchSummary,
  VocabBatchDetail,
  VocabItem,
  GeneratedLesson,
  BatchQuizEvaluationResult,
  BatchInterviewTurnResponse,
  InterviewPackPublic,
  RoleInterviewEvaluation,
  PlacementTestData,
  PlacementEvaluationResult,
  ReviewTestPublic,
  ReviewTestEvaluationResult,
} from '../types/englishLearning';

const BASE = '/api/english-learning';

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const englishLearningApi = {
  getBootstrap: () => apiJson<EnglishBootstrapResponse>(`${BASE}/bootstrap`),

  getStage: (level: CEFRLevel) =>
    apiJson<{
      level: CEFRLevel;
      title: string;
      stageInfo: any;
      guideMd: string;
      learningPathMd: string;
      lessons: any[];
    }>(`${BASE}/stage/${encodeURIComponent(level)}`),

  getLesson: (lessonId: string) =>
    apiJson<{
      level: CEFRLevel;
      meta: any;
      sourceMd: string;
      generatedLesson: GeneratedLesson | null;
    }>(`${BASE}/lesson/${encodeURIComponent(lessonId)}`),

  generateLesson: (lessonId: string, forceRegenerate = false) =>
    apiJson<{ lesson: GeneratedLesson; cached: boolean }>(`${BASE}/ai/generate-lesson`, {
      method: 'POST',
      body: JSON.stringify({ lessonId, forceRegenerate }),
    }),

  evaluateLessonTask: (payload: {
    taskType: 'speaking' | 'writing';
    level: CEFRLevel;
    promptBn: string;
    userAnswer: string;
    modelAnswerEn: string;
    modelAnswerBn: string;
  }) =>
    apiJson<{
      rubric: Record<string, number>;
      total: number;
      max: number;
      passed: boolean;
      feedback_bn: string;
      priority_corrections: Array<{ original: string; natural: string; reason_bn: string }>;
      natural_version_en: string;
      next_tip_bn: string;
      model_answer_en: string;
      model_answer_bn: string;
    }>(`${BASE}/ai/evaluate-lesson-task`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getBatches: (params?: { level?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.level) qs.set('level', params.level);
    if (params?.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiJson<{ total: number; batches: VocabBatchSummary[] }>(`${BASE}/batches${suffix}`);
  },

  getBatchDetail: (batchId: string, size: 5 | 6 | 7 = 5) =>
    apiJson<VocabBatchDetail>(`${BASE}/batch/${encodeURIComponent(batchId)}?size=${size}`),

  getVocabByIds: (ids: string[]) =>
    apiJson<{ total: number; items: VocabItem[] }>(
      `${BASE}/vocab?ids=${encodeURIComponent(ids.join(','))}`
    ),

  searchVocab: (params: { level?: string; type?: string; q?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.level) qs.set('level', params.level);
    if (params.type) qs.set('type', params.type);
    if (params.q) qs.set('q', params.q);
    if (params.limit) qs.set('limit', String(params.limit));
    return apiJson<{ total: number; items: VocabItem[] }>(`${BASE}/vocab?${qs.toString()}`);
  },

  evaluateBatchQuiz: (
    batchId: string,
    answers: Array<{ source_item_id: string; prompt_bn: string; user_answer: string }>
  ) =>
    apiJson<BatchQuizEvaluationResult>(`${BASE}/ai/evaluate-batch-quiz`, {
      method: 'POST',
      body: JSON.stringify({ batchId, answers }),
    }),

  batchInterviewTurn: (payload: {
    batchId: string;
    itemIds: string[];
    history: Array<{ stage: string; prompt_bn: string; prompt_en?: string; user_answer: string }>;
    userResponse?: string;
  }) =>
    apiJson<BatchInterviewTurnResponse>(`${BASE}/ai/batch-interview-turn`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getInterviewPack: (role: string) =>
    apiJson<InterviewPackPublic>(`${BASE}/interview-pack/${encodeURIComponent(role)}`),

  evaluateRoleInterview: (payload: {
    role: string;
    questionId?: string;
    customPromptEn?: string;
    userAnswer: string;
    level?: CEFRLevel;
  }) =>
    apiJson<RoleInterviewEvaluation>(`${BASE}/ai/role-interview-evaluate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPlacementTest: () => apiJson<PlacementTestData>(`${BASE}/placement`),

  evaluatePlacement: (payload: {
    answers: Record<string, string>;
    writingText: string;
    speakingText: string;
  }) =>
    apiJson<PlacementEvaluationResult>(`${BASE}/ai/placement-evaluate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getReviewTest: (level: CEFRLevel) =>
    apiJson<ReviewTestPublic>(`${BASE}/test/${encodeURIComponent(level)}`),

  evaluateLevelTest: (payload: {
    level: CEFRLevel;
    answers: Record<string, string>;
    writingText: string;
    speakingText: string;
  }) =>
    apiJson<ReviewTestEvaluationResult>(`${BASE}/ai/evaluate-level-test`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
