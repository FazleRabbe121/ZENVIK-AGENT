export type CEFRLevel = 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: CEFRLevel[] = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type EnglishSubView =
  | 'home'
  | 'placement'
  | 'lessons'
  | 'vocabulary'
  | 'interview'
  | 'level-test'
  | 'progress';

export interface VocabItem {
  id: string;
  item_type: 'word' | 'sentence_chunk' | 'collocation';
  level: CEFRLevel;
  topic: string;
  situation: string;
  english: string;
  bangla_meaning: string;
  approx_pronunciation_bn: string;
  ipa: string | null;
  register: string;
  alternative_phrase: string | null;
  usage_note: string;
  pos: string;
  example_en: string;
  example_bn: string;
  tags: string[];
  has_data_quality_notice?: boolean;
  data_quality_note_bn?: string;
}

export interface BatchQuizQuestion {
  prompt_bn: string;
  expected_answer_bn?: string;
  expected_answer_en?: string;
  source_item_id: string;
  scoring?: string;
}

export interface BatchInterviewSpec {
  closed_questions: Array<{
    prompt_bn: string;
    expected_answer_bn?: string;
    expected_answer_en?: string;
    item_id: string;
  }>;
  open_question: {
    prompt_bn: string;
    expected: string;
  };
  rubric: {
    meaning: number;
    contextual_use: number;
    grammar: number;
    pronunciation_intelligibility: number;
    fluency: number;
    pass_minimum: number;
  };
}

export interface VocabBatchSummary {
  batch_id: string;
  index: number;
  level: CEFRLevel;
  topic: string;
  item_ids: string[];
  preview_english: string[];
}

export interface VocabBatchDetail {
  batch_id: string;
  index: number;
  level: CEFRLevel;
  topic: string;
  item_ids: string[];
  items: VocabItem[];
  learning_sequence: string[];
  quiz: {
    questions: Array<{
      index: number;
      prompt_bn: string;
      source_item_id: string;
      scoring?: string;
    }>;
    pass_score: number;
    total_score: number;
    pass_percent: number;
    retakes: string;
  };
  interview: {
    closed_questions: Array<{
      prompt_bn: string;
      item_id: string;
    }>;
    open_question: {
      prompt_bn: string;
    };
    rubric: BatchInterviewSpec['rubric'];
  };
}

export interface SyllabusLesson {
  lesson_id: string;
  source_file: string;
  title: string;
  mastery_gate: {
    quiz_accuracy: number;
    speaking_required: boolean;
    writing_required: boolean;
  };
}

export interface SyllabusLevel {
  level: CEFRLevel;
  title_bn?: string;
  title?: string;
  folder?: string;
  lesson_count?: number;
  lessons: SyllabusLesson[];
}

export interface GeneratedLesson {
  lesson_id: string;
  level: CEFRLevel;
  topic: string;
  title_bn: string;
  objectives: string[];
  explanation_sections: Array<{
    heading_bn: string;
    explanation_bn: string;
    why_when_bn: string;
    pattern: string;
    bengali_contrast: string;
    common_bengali_speaker_error: string;
  }>;
  examples: Array<{
    english: string;
    bangla_meaning: string;
    usage_note_bn: string;
  }>;
  dialogue: Array<{
    speaker: string;
    english: string;
    bangla_meaning: string;
  }>;
  vocabulary: Array<{
    english: string;
    bangla_meaning: string;
    approx_pronunciation_bn: string;
    ipa: string | null;
    example_en: string;
    example_bn: string;
  }>;
  exercises: Array<{
    type:
      | 'fill_in'
      | 'mcq'
      | 'correction'
      | 'reorder'
      | 'translation_en_to_bn'
      | 'translation_bn_to_en'
      | 'short_answer'
      | 'matching';
    prompt: string;
    options?: string[];
    answer: string;
    explanation_bn: string;
  }>;
  answer_key_complete: boolean;
  speaking_task: {
    prompt_bn: string;
    model_answer_en: string;
    model_answer_bn: string;
    rubric: {
      task_completion: number;
      grammar: number;
      vocabulary: number;
      pronunciation: number;
      fluency: number;
    };
  };
  writing_task: {
    prompt_bn: string;
    model_answer_en: string;
    model_answer_bn: string;
    rubric: {
      task_completion: number;
      grammar: number;
      vocabulary: number;
      coherence: number;
      register: number;
    };
  };
  mini_quiz: Array<{
    prompt: string;
    options?: string[];
    answer: string;
    explanation_bn: string;
  }>;
  listening: {
    script_en: string;
    script_bn: string;
    questions: Array<{
      prompt: string;
      answer: string;
      explanation_bn: string;
    }>;
  };
  reading: {
    passage_en: string;
    passage_bn: string;
    questions: Array<{
      prompt: string;
      answer: string;
      explanation_bn: string;
    }>;
  };
  generated_at?: string;
}

export interface ReviewTestQuestionPublic {
  id: string;
  section: 'grammar' | 'vocabulary' | 'language_use' | 'reading' | 'listening';
  type: 'mcq' | 'constructed_response' | 'comprehension';
  prompt: string;
  options?: string[];
}

export interface ReviewTestPublic {
  level: CEFRLevel;
  question_count: number;
  instructions_bn: string;
  reading: {
    passage_en: string;
  };
  listening: {
    script_en: string;
  };
  questions: ReviewTestQuestionPublic[];
  writing_task: {
    prompt_bn: string;
    rubric: Record<string, number>;
    minimum: number;
  };
  speaking_task: {
    prompt_bn: string;
    rubric: Record<string, number>;
    minimum: number;
  };
  scoring: {
    objective_questions: number;
    writing_points: number;
    speaking_points: number;
    total: number;
    pass_total: number;
    writing_minimum: number;
    speaking_minimum: number;
    retakes: string;
  };
}

export interface ReviewTestEvaluationResult {
  level: CEFRLevel;
  objective_score: number;
  objective_total: number;
  writing_score: number;
  writing_total: number;
  writing_rubric: Record<string, number>;
  writing_feedback_bn: string;
  writing_corrections_bn: string[];
  writing_model_en: string;
  writing_model_bn: string;
  speaking_score: number;
  speaking_total: number;
  speaking_rubric: Record<string, number>;
  speaking_feedback_bn: string;
  speaking_corrections_bn: string[];
  speaking_model_en: string;
  speaking_model_bn: string;
  total_score: number;
  max_score: number;
  passed: boolean;
  pass_breakdown_bn: string;
  reading_translation_bn: string;
  listening_translation_bn: string;
  question_results: Array<{
    id: string;
    section: string;
    prompt: string;
    user_answer: string;
    expected_answer: string;
    correct: boolean;
    explanation_bn: string;
  }>;
}

export interface InterviewPackQuestionPublic {
  id: string;
  question_en: string;
  question_bn: string;
  follow_up_prompt_en: string;
  follow_up_prompt_bn: string;
  evaluation_criteria: string[];
}

export interface InterviewPackPublic {
  role: string;
  title_bn: string;
  title_en: string;
  question_count: number;
  questions: InterviewPackQuestionPublic[];
}

export interface InterviewRubricScores {
  meaning_or_relevance: number;
  contextual_use_or_clarity: number;
  grammar: number;
  pronunciation_intelligibility: number;
  fluency: number;
  total: number;
  max: number;
  percent: number;
  passed: boolean;
}

export interface RoleInterviewEvaluation {
  rubric: InterviewRubricScores;
  feedback_bn: string;
  priority_corrections: Array<{
    original: string;
    natural: string;
    reason_bn: string;
  }>;
  natural_version_en: string;
  follow_up_en: string;
  follow_up_bn: string;
  model_answer_en: string;
  model_answer_bn: string;
}

export interface BatchQuizEvaluationResult {
  batch_id: string;
  total_score: number;
  max_score: number;
  percent: number;
  passed: boolean;
  summary_bn: string;
  missed_item_ids: string[];
  results: Array<{
    index: number;
    source_item_id: string;
    prompt_bn: string;
    user_answer: string;
    score: number;
    correct: boolean;
    expected_summary: string;
    explanation_bn: string;
    natural_correction: string;
    new_example_en: string;
    new_example_bn: string;
  }>;
}

export interface BatchInterviewTurnResponse {
  turn_feedback_bn: string;
  priority_corrections: Array<{
    original: string;
    natural: string;
    reason_bn: string;
  }>;
  natural_version_en: string;
  model_hint_en?: string;
  model_hint_bn?: string;
  next_question?: {
    stage: 'closed' | 'open' | 'roleplay';
    prompt_bn: string;
    prompt_en?: string;
    item_id?: string;
  } | null;
  completed: boolean;
  final_evaluation?: {
    rubric: InterviewRubricScores;
    passed: boolean;
    summary_bn: string;
    remediation_item_ids: string[];
    remediation_advice_bn: string;
  };
}

export interface PlacementTestData {
  disclaimer_bn: string;
  part_a: Array<{ id: string; prompt: string; options: string[] }>;
  part_b: { passage_en: string; questions: Array<{ id: string; prompt: string }> };
  part_c: { script_en: string; questions: Array<{ id: string; prompt: string }> };
  part_d: { prompt_bn: string; prompt_en: string };
  part_e: { prompt_bn: string; prompt_en: string };
}

export interface PlacementEvaluationResult {
  part_a_score: number;
  part_a_total: number;
  part_b_score: number;
  part_b_total: number;
  part_c_score: number;
  part_c_total: number;
  writing_score: number;
  speaking_score: number;
  recommended_level: CEFRLevel;
  summary_bn: string;
  strengths_bn: string[];
  focus_areas_bn: string[];
  answer_review: Array<{
    id: string;
    user_answer: string;
    expected_answer: string;
    correct: boolean;
    explanation_bn: string;
  }>;
}

export interface ValidationCheckRow {
  check: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  notes_bn: string;
}

export interface PackageValidationSummary {
  package_name: string;
  package_file_path: string;
  total_files_in_package: number;
  levels: CEFRLevel[];
  lesson_source_count: number;
  missing_lesson_files: string[];
  vocab_count: number;
  unique_vocab_ids: number;
  unique_english_count: number;
  vocab_by_type: Record<string, number>;
  vocab_by_level: Record<string, number>;
  batch_count: number;
  missing_batch_item_refs: number;
  review_test_count: number;
  total_review_questions: number;
  interview_pack_count: number;
  quality_gaps: {
    null_ipa_count: number;
    null_ipa_examples: Array<{ id: string; english: string }>;
    fallback_pronunciation_count: number;
    a2_template_bug_count: number;
    b1_template_bug_count: number;
    duplicate_kora_kora_count: number;
    empty_alternative_phrase_count: number;
    source_lessons_are_outlines: boolean;
  };
  checks: ValidationCheckRow[];
}

export interface EnglishBootstrapResponse {
  masterManifest: Record<string, any>;
  flowConfig: Record<string, any>;
  syllabus: {
    progression: string;
    levels: SyllabusLevel[];
  };
  courseStages: Array<{
    level: CEFRLevel;
    title: string;
    folder: string;
    lesson_count: number;
    guide?: string;
    learning_path?: string;
  }>;
  interviewManifest: {
    packs: string[];
    modes: string[];
  };
  testManifest: {
    levels: CEFRLevel[];
    questions_per_level: number;
    total_questions: number;
    retakes: string;
    passing_rule: string;
  };
  validation: PackageValidationSummary;
  toolkits: {
    cefrOverviewMd: string;
    bengaliToolkitMd: string;
    pronunciationTrackMd: string;
    batchInterviewGuideMd: string;
    contentUpgradeReportMd: string;
    screenFlowMd: string;
  };
}

// Progress & Spaced Repetition Persistence
export type WordMasteryStatus = 'new' | 'learning' | 'review_needed' | 'mastered';

export interface WordMasteryRecord {
  itemId: string;
  level: CEFRLevel;
  status: WordMasteryStatus;
  attempts: number;
  correctCount: number;
  missCount: number;
  streak: number;
  easeFactor: number;
  intervalDays: number;
  lastReviewedAt: string;
  nextReviewAt: string;
}

export interface BatchProgressRecord {
  batchId: string;
  level: CEFRLevel;
  cardsStudied: boolean;
  quizAttempts: number;
  bestQuizScore: number;
  bestQuizMax: number;
  quizPassed: boolean;
  interviewAttempts: number;
  bestInterviewScore: number;
  interviewPassed: boolean;
  unlockedNext: boolean;
  updatedAt: string;
}

export interface LessonProgressRecord {
  lessonId: string;
  level: CEFRLevel;
  openedAt: string;
  miniQuizScore: number;
  miniQuizMax: number;
  miniQuizPassed: boolean;
  speakingCompleted: boolean;
  speakingScore: number;
  writingCompleted: boolean;
  writingScore: number;
  mastered: boolean;
  updatedAt: string;
}

export interface LevelTestProgressRecord {
  level: CEFRLevel;
  attempts: number;
  bestTotal: number;
  bestObjective: number;
  bestWriting: number;
  bestSpeaking: number;
  passed: boolean;
  lastAttemptAt: string;
}

export interface ErrorLogEntry {
  id: string;
  source: 'batch_quiz' | 'batch_interview' | 'lesson' | 'level_test' | 'role_interview';
  level?: CEFRLevel;
  itemId?: string;
  prompt: string;
  userAnswer: string;
  naturalCorrection: string;
  reasonBn: string;
  createdAt: string;
}

export interface SavedPhrase {
  id: string;
  english: string;
  banglaMeaning: string;
  approxPronunciationBn?: string;
  ipa?: string | null;
  exampleEn?: string;
  exampleBn?: string;
  level?: CEFRLevel;
  savedAt: string;
}

export interface LastSessionPointer {
  subView: EnglishSubView;
  level?: CEFRLevel;
  lessonId?: string;
  batchId?: string;
  interviewRole?: string;
  labelBn: string;
  updatedAt: string;
}

export interface EnglishLearningProgress {
  version: number;
  placement?: {
    completedAt: string;
    recommendedLevel: CEFRLevel;
    selectedStartLevel: CEFRLevel;
    summaryBn: string;
  };
  currentLevel: CEFRLevel;
  preferredBatchSize: 5 | 6 | 7;
  words: Record<string, WordMasteryRecord>;
  batches: Record<string, BatchProgressRecord>;
  lessons: Record<string, LessonProgressRecord>;
  levelTests: Record<string, LevelTestProgressRecord>;
  errorLog: ErrorLogEntry[];
  savedPhrases: SavedPhrase[];
  lastSession?: LastSessionPointer;
  updatedAt: string;
}
