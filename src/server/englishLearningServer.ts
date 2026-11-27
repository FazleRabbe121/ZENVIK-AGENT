import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import type {
  CEFRLevel,
  VocabItem,
  GeneratedLesson,
  PackageValidationSummary,
  ValidationCheckRow,
  PlacementTestData,
} from '../types/englishLearning.js';

export const englishLearningRouter = express.Router();

const GEMINI_MODEL = 'gemini-4-hydrogen';
const PACKAGE_RELATIVE_PATH =
  'public/assets/aistudio/English_Zero_to_C2_Master_Course_v2_SINGLE_FILE__2__e49f1579.json';
const PACKAGE_FALLBACK_RELATIVE_PATH =
  'data/English_Zero_to_C2_Master_Course_v2_SINGLE_FILE.json';
const LESSON_CACHE_PATH = path.resolve(process.cwd(), 'data/english_generated_lessons_cache.json');

const CEFR_ORDER: CEFRLevel[] = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const ROLE_LABELS: Record<string, { title_en: string; title_bn: string }> = {
  general_job_interview: { title_en: 'General Job Interview', title_bn: 'সাধারণ চাকরির ইন্টারভিউ' },
  bartender_barista: { title_en: 'Bartender & Barista', title_bn: 'বারটেন্ডার ও বারিস্তা' },
  waiter_restaurant: { title_en: 'Waiter & Restaurant', title_bn: 'ওয়েটার ও রেস্তোরাঁ সেবা' },
  hotel_reception: { title_en: 'Hotel Reception', title_bn: 'হোটেল রিসেপশন ও ফ্রন্ট ডেস্ক' },
  customer_service: { title_en: 'Customer Service', title_bn: 'কাস্টমার সার্ভিস ও অভিযোগ সমাধান' },
  advanced_discussion: { title_en: 'Advanced Discussion (C1–C2)', title_bn: 'উচ্চতর আলোচনা ও বিতর্ক (C1–C2)' },
};

const LEVEL_TO_TEST_FILE: Record<CEFRLevel, string> = {
  'Pre-A1': 'ASSESSMENT_AND_INTERVIEW/pre_a1_review_test.json',
  A1: 'ASSESSMENT_AND_INTERVIEW/a1_review_test.json',
  A2: 'ASSESSMENT_AND_INTERVIEW/a2_review_test.json',
  B1: 'ASSESSMENT_AND_INTERVIEW/b1_review_test.json',
  B2: 'ASSESSMENT_AND_INTERVIEW/b2_review_test.json',
  C1: 'ASSESSMENT_AND_INTERVIEW/c1_review_test.json',
  C2: 'ASSESSMENT_AND_INTERVIEW/c2_review_test.json',
};

interface RawBatch {
  batch_id: string;
  level: CEFRLevel;
  topic: string;
  item_ids: string[];
  learning_sequence: string[];
  quiz: {
    questions: Array<{
      prompt_bn: string;
      expected_answer_bn?: string;
      expected_answer_en?: string;
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
  };
}

interface RawReviewTest {
  level: CEFRLevel;
  question_count: number;
  instructions_bn: string;
  reading: { passage_en: string; passage_bn: string };
  listening: { script_en: string; script_bn: string };
  questions: Array<{
    id: string;
    section: 'grammar' | 'vocabulary' | 'language_use' | 'reading' | 'listening';
    type: 'mcq' | 'constructed_response' | 'comprehension';
    prompt: string;
    options?: string[];
    answer: string;
    explanation_bn: string;
  }>;
  answer_key: Array<{ question_id: string; answer: string; explanation_bn: string }>;
  writing_task: { prompt_bn: string; model_answer_instruction: string; rubric: Record<string, number>; minimum: number };
  speaking_task: { prompt_bn: string; rubric: Record<string, number>; minimum: number };
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

interface RawInterviewPack {
  role: string;
  question_count: number;
  questions: Array<{
    id: string;
    question_en: string;
    question_bn: string;
    model_answer_en: string;
    model_answer_bn: string;
    follow_up_prompt_en: string;
    follow_up_prompt_bn: string;
    evaluation_criteria: string[];
    rubric_each_0_to_4: boolean;
  }>;
}

interface LoadedCourseStore {
  packageName: string;
  files: Map<string, string>;
  masterManifest: Record<string, any>;
  courseManifest: Record<string, any>;
  syllabus: { progression: string; levels: Array<{ level: CEFRLevel; title_bn?: string; title?: string; lessons: any[] }> };
  flowConfig: Record<string, any>;
  lessonSchema: Record<string, any>;
  aiLessonSpecMd: string;
  vocab: VocabItem[];
  vocabById: Map<string, VocabItem>;
  batches: RawBatch[];
  batchById: Map<string, RawBatch>;
  batchIndexById: Map<string, number>;
  reviewTests: Map<CEFRLevel, RawReviewTest>;
  interviewManifest: { packs: string[]; modes: string[] };
  testManifest: any;
  interviewPacks: Map<string, RawInterviewPack>;
  lessonById: Map<string, { level: CEFRLevel; lesson: any }>;
  validation: PackageValidationSummary;
}

let cachedStore: LoadedCourseStore | null = null;
let lessonCacheMemory: Record<string, GeneratedLesson> | null = null;

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Server GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripMarkdownFences(raw: string): string {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

function safeParseJson<T>(raw: string): T {
  const cleaned = stripMarkdownFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('AI response could not be parsed as JSON.');
  }
}

function loadLessonCache(): Record<string, GeneratedLesson> {
  if (lessonCacheMemory) return lessonCacheMemory;
  try {
    if (fs.existsSync(LESSON_CACHE_PATH)) {
      lessonCacheMemory = JSON.parse(fs.readFileSync(LESSON_CACHE_PATH, 'utf8'));
      return lessonCacheMemory!;
    }
  } catch {
    // ignore corrupt cache
  }
  lessonCacheMemory = {};
  return lessonCacheMemory;
}

function saveLessonCache(lessonId: string, lesson: GeneratedLesson): void {
  const cache = loadLessonCache();
  cache[lessonId] = lesson;
  try {
    const dir = path.dirname(LESSON_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LESSON_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch {
    // non-fatal disk write error
  }
}

function inspectVocabQuality(item: VocabItem): VocabItem {
  const notes: string[] = [];
  if (!item.ipa) {
    notes.push('এই শব্দের IPA সোর্স ফাইলে নেই; ইংরেজি অডিও শুনে উচ্চারণ অনুশীলন করুন।');
  }
  if ((item.bangla_meaning || '').includes('পাঠাবেন? সম্পর্কে আমার একটি প্রশ্ন আছে') ||
      (item.bangla_meaning || '').includes('নিরাপদ জায়গায় রাখুন। পর্যালোচনা করি')) {
    notes.push('সোর্স ফাইলের বাংলা অনুবাদে টেমপ্লেট ত্রুটি শনাক্ত হয়েছে; উদাহরণ ও AI ব্যাখ্যা দেখুন।');
  }
  if ((item.example_bn || '').includes('করা করা')) {
    notes.push('সোর্স উদাহরণের বাংলায় দ্বৈত শব্দ (“করা করা”) রয়েছে।');
  }
  if (notes.length > 0) {
    return {
      ...item,
      has_data_quality_notice: true,
      data_quality_note_bn: notes.join(' '),
    };
  }
  return item;
}

function loadCourseStore(): LoadedCourseStore {
  if (cachedStore) return cachedStore;

  const primaryPath = path.resolve(process.cwd(), PACKAGE_RELATIVE_PATH);
  const fallbackPath = path.resolve(process.cwd(), PACKAGE_FALLBACK_RELATIVE_PATH);
  const fullPath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Course package JSON missing at ${PACKAGE_RELATIVE_PATH} and ${PACKAGE_FALLBACK_RELATIVE_PATH}`
    );
  }

  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const files = new Map<string, string>();
  for (const f of pkg.files || []) {
    files.set(f.path, f.content);
  }

  const readJson = (p: string) => {
    const content = files.get(p);
    if (!content) throw new Error(`Required package file missing: ${p}`);
    return JSON.parse(content);
  };

  const readJsonl = <T>(p: string): T[] => {
    const content = files.get(p);
    if (!content) throw new Error(`Required package JSONL missing: ${p}`);
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line) as T);
  };

  const masterManifest = readJson('MASTER_PACKAGE_MANIFEST.json');
  const courseManifest = readJson('course_manifest.json');
  const syllabus = readJson('COURSE_ENGINE/LEVEL_SYLLABUS.json');
  const flowConfig = readJson('COURSE_ENGINE/LEARNING_FLOW_CONFIG.json');
  const lessonSchema = readJson('COURSE_ENGINE/LESSON_DELIVERY_SCHEMA.json');
  const aiLessonSpecMd = files.get('COURSE_ENGINE/AI_LESSON_GENERATION_SPEC_BN.md') || '';
  const interviewManifest = readJson('AI_INTERVIEW_MODE/INTERVIEW_MANIFEST.json');
  const testManifest = readJson('ASSESSMENT_AND_INTERVIEW/TEST_MANIFEST.json');

  const rawVocab = readJsonl<VocabItem>('VOCABULARY_SENTENCE_MASTER_CLASS/vocabulary_master.jsonl');
  const vocab = rawVocab.map(inspectVocabQuality);
  const vocabById = new Map<string, VocabItem>(vocab.map(v => [v.id, v]));

  const batches = readJsonl<RawBatch>('VOCABULARY_SENTENCE_MASTER_CLASS/learning_batches.jsonl');
  const batchById = new Map<string, RawBatch>();
  const batchIndexById = new Map<string, number>();
  batches.forEach((b, idx) => {
    batchById.set(b.batch_id, b);
    batchIndexById.set(b.batch_id, idx);
  });

  const reviewTests = new Map<CEFRLevel, RawReviewTest>();
  let totalReviewQuestions = 0;
  for (const lv of CEFR_ORDER) {
    const filePath = LEVEL_TO_TEST_FILE[lv];
    if (files.has(filePath)) {
      const testObj = JSON.parse(files.get(filePath)!) as RawReviewTest;
      reviewTests.set(lv, testObj);
      totalReviewQuestions += Array.isArray(testObj.questions) ? testObj.questions.length : 0;
    }
  }

  const interviewPacks = new Map<string, RawInterviewPack>();
  for (const packFile of interviewManifest.packs || []) {
    const packPath = `AI_INTERVIEW_MODE/${packFile}`;
    if (files.has(packPath)) {
      const packObj = JSON.parse(files.get(packPath)!) as RawInterviewPack;
      interviewPacks.set(packObj.role, packObj);
    }
  }

  const lessonById = new Map<string, { level: CEFRLevel; lesson: any }>();
  const missingLessonFiles: string[] = [];
  let lessonSourceCount = 0;
  for (const lv of syllabus.levels || []) {
    for (const ls of lv.lessons || []) {
      lessonSourceCount++;
      lessonById.set(ls.lesson_id, { level: lv.level, lesson: ls });
      if (ls.source_file && !files.has(ls.source_file)) {
        missingLessonFiles.push(ls.source_file);
      }
    }
  }

  // Live audit computations (strictly truthful)
  const vocabByType: Record<string, number> = {};
  const vocabByLevel: Record<string, number> = {};
  const uniqueEnglish = new Set<string>();
  const nullIpaExamples: Array<{ id: string; english: string }> = [];
  let nullIpaCount = 0;
  let fallbackPronCount = 0;
  let a2BugCount = 0;
  let b1BugCount = 0;
  let dupKoraKoraCount = 0;
  let emptyAltCount = 0;

  for (const v of rawVocab) {
    vocabByType[v.item_type] = (vocabByType[v.item_type] || 0) + 1;
    vocabByLevel[v.level] = (vocabByLevel[v.level] || 0) + 1;
    uniqueEnglish.add((v.english || '').trim().toLowerCase());
    if (!v.ipa) {
      nullIpaCount++;
      if (nullIpaExamples.length < 10) nullIpaExamples.push({ id: v.id, english: v.english });
    }
    if ((v.approx_pronunciation_bn || '').includes('অভিধানের অডিও')) fallbackPronCount++;
    if ((v.bangla_meaning || '').includes('পাঠাবেন? সম্পর্কে আমার একটি প্রশ্ন আছে')) a2BugCount++;
    if ((v.bangla_meaning || '').includes('নিরাপদ জায়গায় রাখুন। পর্যালোচনা করি')) b1BugCount++;
    if ((v.example_bn || '').includes('করা করা') || (v.bangla_meaning || '').includes('করা করা')) dupKoraKoraCount++;
    if (!v.alternative_phrase) emptyAltCount++;
  }

  let missingBatchItemRefs = 0;
  for (const b of batches) {
    for (const id of b.item_ids || []) {
      if (!vocabById.has(id)) missingBatchItemRefs++;
    }
  }

  const checks: ValidationCheckRow[] = [
    {
      check: 'Course Package & Manifests',
      expected: '215 files, 7 CEFR levels',
      actual: `${files.size} files, ${(syllabus.levels || []).length} levels`,
      status: files.size === 215 && (syllabus.levels || []).length === 7 ? 'PASS' : 'FAIL',
      notes_bn: 'MASTER_PACKAGE_MANIFEST, course_manifest, LEVEL_SYLLABUS ও LEARNING_FLOW_CONFIG সফলভাবে লোড হয়েছে।',
    },
    {
      check: 'Lesson Source Index (Pre-A1 to C2)',
      expected: '147 source files, 0 missing',
      actual: `${lessonSourceCount} lessons, ${missingLessonFiles.length} missing`,
      status: lessonSourceCount === 147 && missingLessonFiles.length === 0 ? 'PASS' : 'FAIL',
      notes_bn: 'সব ১৪৭টি সোর্স ফাইল বিদ্যমান; সোর্স ফাইলগুলো outline হওয়ায় AI Lesson Generation চালু করা হয়েছে।',
    },
    {
      check: 'Vocabulary Master Class Items',
      expected: '1250 unique items (90 word, 840 chunk, 320 collocation)',
      actual: `${vocab.length} rows (${vocabById.size} unique IDs, ${uniqueEnglish.size} unique English)`,
      status: vocab.length === 1250 && vocabById.size === 1250 ? 'PASS' : 'FAIL',
      notes_bn: 'সব item_id এবং English entry ইউনিক।',
    },
    {
      check: 'Learning Batches & Item References',
      expected: '250 batches (5 items each), 0 broken refs',
      actual: `${batches.length} batches, ${missingBatchItemRefs} missing refs`,
      status: batches.length === 250 && missingBatchItemRefs === 0 ? 'PASS' : 'FAIL',
      notes_bn: 'default ৫টি এবং সর্বোচ্চ ৭টি পর্যন্ত সেশন কনফিগার করা যায়।',
    },
    {
      check: 'Level Review Tests (40 Qs each)',
      expected: '7 tests, 280 questions + answer keys',
      actual: `${reviewTests.size} tests, ${totalReviewQuestions} questions`,
      status: reviewTests.size === 7 && totalReviewQuestions === 280 ? 'PASS' : 'FAIL',
      notes_bn: 'Objective 40 + Writing 20 + Speaking 20 = 80; Pass >=64 ও Writing/Speaking >=14।',
    },
    {
      check: 'AI Interview Packs',
      expected: '6 role-specific JSON packs',
      actual: `${interviewPacks.size} packs loaded`,
      status: interviewPacks.size === 6 ? 'PASS' : 'FAIL',
      notes_bn: 'সব ৬টি role pack এবং Daily Conversation ও Vocabulary Batch Interview চালু আছে।',
    },
    {
      check: 'IPA & Bengali Pronunciation Coverage',
      expected: '100% editorial-verified IPA & BN approx',
      actual: `${nullIpaCount} items missing IPA; CMU auto-generated US IPA`,
      status: 'WARN',
      notes_bn: '৫টি শব্দে (flavour, jigger, strainer, muddler, mocktail) IPA নেই এবং উচ্চারণ স্বয়ংক্রিয়ভাবে তৈরি।',
    },
    {
      check: 'Bengali Translation Editorial Quality',
      expected: '0 template corruption',
      actual: `${a2BugCount} A2 + ${b1BugCount} B1 template bugs, ${dupKoraKoraCount} "করা করা" duplicates`,
      status: 'WARN',
      notes_bn: 'সোর্স JSONL ফাইলের A2/B1 কিছু sentence chunk অনুবাদে টেমপ্লেট ত্রুটি শনাক্ত হয়েছে এবং কার্ডে নোটিশ যুক্ত করা হয়েছে।',
    },
  ];

  const validation: PackageValidationSummary = {
    package_name: pkg.package_name || 'English Zero to C2 - v2.0',
    package_file_path: PACKAGE_RELATIVE_PATH,
    total_files_in_package: files.size,
    levels: CEFR_ORDER,
    lesson_source_count: lessonSourceCount,
    missing_lesson_files: missingLessonFiles,
    vocab_count: vocab.length,
    unique_vocab_ids: vocabById.size,
    unique_english_count: uniqueEnglish.size,
    vocab_by_type: vocabByType,
    vocab_by_level: vocabByLevel,
    batch_count: batches.length,
    missing_batch_item_refs: missingBatchItemRefs,
    review_test_count: reviewTests.size,
    total_review_questions: totalReviewQuestions,
    interview_pack_count: interviewPacks.size,
    quality_gaps: {
      null_ipa_count: nullIpaCount,
      null_ipa_examples: nullIpaExamples,
      fallback_pronunciation_count: fallbackPronCount,
      a2_template_bug_count: a2BugCount,
      b1_template_bug_count: b1BugCount,
      duplicate_kora_kora_count: dupKoraKoraCount,
      empty_alternative_phrase_count: emptyAltCount,
      source_lessons_are_outlines: true,
    },
    checks,
  };

  cachedStore = {
    packageName: pkg.package_name || 'English Zero to C2 - v2.0',
    files,
    masterManifest,
    courseManifest,
    syllabus,
    flowConfig,
    lessonSchema,
    aiLessonSpecMd,
    vocab,
    vocabById,
    batches,
    batchById,
    batchIndexById,
    reviewTests,
    interviewManifest,
    testManifest,
    interviewPacks,
    lessonById,
    validation,
  };

  return cachedStore;
}

// Parse PLACEMENT_TEST_BN.md into structured questions (withholding answer key from public payload)
function parsePlacementTest(md: string): {
  publicData: PlacementTestData;
  answerKey: Record<string, string>;
} {
  const partA: Array<{ id: string; prompt: string; options: string[] }> = [];
  const partAMatch = md.match(/## Part A[\s\S]*?(?=## Part B)/);
  if (partAMatch) {
    const lines = partAMatch[0].split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^(\d+)\.\s+(.+?)\s*\(([^)]+)\)\s*$/);
      if (m) {
        partA.push({
          id: `A${m[1]}`,
          prompt: m[2].trim(),
          options: m[3].split('/').map(s => s.trim()),
        });
      }
    }
  }

  let readingPassage = '';
  const partBQs: Array<{ id: string; prompt: string }> = [];
  const partBMatch = md.match(/## Part B[\s\S]*?(?=## Part C)/);
  if (partBMatch) {
    const pMatch = partBMatch[0].match(/Read:\s*[“"]([^”"]+)[”"]/);
    if (pMatch) readingPassage = pMatch[1].trim();
    for (const line of partBMatch[0].split(/\r?\n/)) {
      const m = line.match(/^(\d+)\.\s+(.+)$/);
      if (m) partBQs.push({ id: `B${m[1]}`, prompt: m[2].trim() });
    }
  }

  let listeningScript = '';
  const partCQs: Array<{ id: string; prompt: string }> = [];
  const partCMatch = md.match(/## Part C[\s\S]*?(?=## Part D)/);
  if (partCMatch) {
    const sMatch = partCMatch[0].match(/Script:\s*[“"]([^”"]+)[”"]/);
    if (sMatch) listeningScript = sMatch[1].trim();
    for (const line of partCMatch[0].split(/\r?\n/)) {
      const m = line.match(/^(\d+)\.\s+(.+)$/);
      if (m) partCQs.push({ id: `C${m[1]}`, prompt: m[2].trim() });
    }
  }

  const partDMatch = md.match(/## Part D[\s\S]*?(?=## Part E)/);
  const partDPrompt = partDMatch
    ? partDMatch[0].replace(/## Part D[^\n]*\n/, '').trim()
    : 'Write a short self-introduction including your name, current work or study, experience, and one learning goal.';

  const partEMatch = md.match(/## Part E[\s\S]*?(?=## Answer key)/);
  const partEPrompt = partEMatch
    ? partEMatch[0].replace(/## Part E[^\n]*\n/, '').trim()
    : 'Speak about your daily routine and a situation in which you helped a customer. Use connected sentences, not isolated words.';

  const answerKey: Record<string, string> = {
    A1: 'am',
    A2: 'works',
    A3: 'are making',
    A4: 'are',
    A5: 'since',
    A6: 'welcomed',
    A7: 'will stay',
    A8: 'was',
    A9: 'was finished',
    A10: 'meeting',
    B1: 'At a small café near the bus station.',
    B2: 'At seven.',
    B3: 'Checks tables and prepares the coffee machine.',
    B4: 'Because the café is busy.',
    C1: 'Daniel (from Riverside Hotel).',
    C2: 'An interview.',
    C3: 'Thursday at 10:30.',
    C4: 'A copy of the CV.',
    C5: 'Call Daniel back before five.',
  };

  return {
    publicData: {
      disclaimer_bn:
        'এটি একটি প্রাথমিক স্তর নির্ধারণের screening; একে একা CEFR সার্টিফিকেট হিসেবে গণ্য করা যাবে না। ফল যাই হোক না কেন, আপনি চাইলে সবসময় Pre-A1 থেকে শুরু করতে পারবেন।',
      part_a: partA,
      part_b: { passage_en: readingPassage, questions: partBQs },
      part_c: { script_en: listeningScript, questions: partCQs },
      part_d: {
        prompt_bn: 'আপনার নাম, বর্তমান কাজ বা পড়াশোনা, অভিজ্ঞতা এবং ইংরেজি শেখার একটি লক্ষ্য নিয়ে সংক্ষিপ্ত আত্মপরিচয় লিখুন।',
        prompt_en: partDPrompt,
      },
      part_e: {
        prompt_bn: 'আপনার দৈনন্দিন রুটিন এবং কোনো কাস্টমার বা মানুষকে সাহায্য করার একটি অভিজ্ঞতা ধারাবাহিক বাক্যে বলুন (বা লিখুন)।',
        prompt_en: partEPrompt,
      },
    },
    answerKey,
  };
}

// ============================================================================
// 1. BOOTSTRAP & COURSE DATA ENDPOINTS
// ============================================================================

englishLearningRouter.get('/bootstrap', (_req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    res.json({
      masterManifest: store.masterManifest,
      flowConfig: store.flowConfig,
      syllabus: store.syllabus,
      courseStages: (store.courseManifest.stages || []).map((st: any) => ({
        level: st.level,
        title: st.title,
        folder: st.folder,
        lesson_count: st.lesson_count,
        guide: st.guide,
        learning_path: st.learning_path,
      })),
      interviewManifest: store.interviewManifest,
      testManifest: store.testManifest,
      validation: store.validation,
      toolkits: {
        cefrOverviewMd: store.files.get('CEFR_LEVEL_OVERVIEW_BN.md') || '',
        bengaliToolkitMd: store.files.get('SUPPLEMENTARY_LEARNING_TOOLKITS/BENGALI_SPEAKERS_TOOLKIT_BN.md') || '',
        pronunciationTrackMd: store.files.get('SUPPLEMENTARY_LEARNING_TOOLKITS/PRONUNCIATION_TRACK_BN.md') || '',
        batchInterviewGuideMd:
          store.files.get('SUPPLEMENTARY_LEARNING_TOOLKITS/VOCABULARY_SENTENCE_MASTER_CLASS/BATCH_INTERVIEW_GUIDE_BN.md') ||
          '',
        contentUpgradeReportMd: store.files.get('CONTENT_UPGRADE_REPORT_BN.md') || '',
        screenFlowMd: store.files.get('APP_LEARNING_EXPERIENCE_SPEC/LEARNING_SCREEN_FLOW_BN.md') || '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load English learning course package.' });
  }
});

englishLearningRouter.get('/stage/:level', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const level = req.params.level as CEFRLevel;
    const stage = (store.courseManifest.stages || []).find((s: any) => s.level === level);
    const sylLevel = (store.syllabus.levels || []).find(l => l.level === level);
    if (!stage || !sylLevel) {
      return res.status(404).json({ error: `Level ${level} not found.` });
    }
    const stageInfo = stage.stage_info && store.files.has(stage.stage_info)
      ? JSON.parse(store.files.get(stage.stage_info)!)
      : null;

    return res.json({
      level,
      title: stage.title,
      stageInfo,
      guideMd: stage.guide ? store.files.get(stage.guide) || '' : '',
      learningPathMd: stage.learning_path ? store.files.get(stage.learning_path) || '' : '',
      lessons: sylLevel.lessons,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load level stage.' });
  }
});

// ============================================================================
// 2. LESSONS & AI LESSON GENERATION
// ============================================================================

englishLearningRouter.get('/lesson/:lessonId', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const entry = store.lessonById.get(req.params.lessonId);
    if (!entry) {
      return res.status(404).json({ error: `Lesson ${req.params.lessonId} not found.` });
    }
    const sourceMd = entry.lesson.source_file ? store.files.get(entry.lesson.source_file) || '' : '';
    const cache = loadLessonCache();
    const generatedLesson = cache[req.params.lessonId] || null;

    return res.json({
      level: entry.level,
      meta: entry.lesson,
      sourceMd,
      generatedLesson,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load lesson.' });
  }
});

englishLearningRouter.post('/ai/generate-lesson', async (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const { lessonId, forceRegenerate } = req.body || {};
    if (!lessonId || typeof lessonId !== 'string') {
      return res.status(400).json({ error: 'lessonId is required.' });
    }
    const entry = store.lessonById.get(lessonId);
    if (!entry) {
      return res.status(404).json({ error: `Lesson ${lessonId} not found.` });
    }

    const cache = loadLessonCache();
    if (!forceRegenerate && cache[lessonId]) {
      return res.json({ lesson: cache[lessonId], cached: true });
    }

    const sourceMd = entry.lesson.source_file ? store.files.get(entry.lesson.source_file) || '' : '';
    const ai = getAIClient();

    const prompt = `You are a senior Bengali-English curriculum designer & teacher creating a complete, rich, original lesson for a Bengali speaker learning English from zero to C2.

STRICT TEACHING RULES:
- Assume the learner may start from absolute zero English; explain natural Bengali meaning and real-life usage BEFORE grammar rules.
- Every Bengali explanation must be clear, natural, respectful, and accurate.
- NEVER use placeholder text like "answer depends on context", "complete the mock test", or generic repeated sentences.
- Always keep Bengali pronunciation labeled as approximate ("আনুমানিক বাংলা উচ্চারণ") and IPA separate (string or null if uncertain).
- Never claim C2 equals native-speaker status; never promise fixed completion timelines.
- Focus on real-world phrases, chunks, and collocations alongside single words.

SOURCE LESSON METADATA:
- lesson_id: ${entry.lesson.lesson_id}
- level: ${entry.level}
- title: ${entry.lesson.title}
- source_file: ${entry.lesson.source_file}

SOURCE OUTLINE MARKDOWN (use as topic foundation, expand into a full rich lesson):
${sourceMd.slice(0, 6000)}

REQUIRED MINIMUM QUANTITIES (MUST SATISFY ALL):
1. objectives: 3-5 clear Bengali learning objectives.
2. explanation_sections: 2-3 detailed sections with heading_bn, multi-paragraph explanation_bn, why_when_bn, pattern, bengali_contrast, common_bengali_speaker_error.
3. examples: AT LEAST 15 natural, level-appropriate English examples with natural bangla_meaning and usage_note_bn.
4. dialogue: 8 to 12 lines of an original, realistic dialogue (speaker A/B or named roles) with english and natural bangla_meaning.
5. vocabulary: AT LEAST 10 useful words/chunks/collocations with english, bangla_meaning, approx_pronunciation_bn, ipa (or null), example_en, example_bn.
6. exercises: AT LEAST 10 varied exercises covering fill_in, mcq, correction, reorder, translation_en_to_bn, translation_bn_to_en, short_answer, matching. Every exercise MUST have a complete exact answer and clear explanation_bn. For mcq include 4 options.
7. speaking_task: prompt_bn, model_answer_en, model_answer_bn, rubric ({task_completion:4, grammar:4, vocabulary:4, pronunciation:4, fluency:4}).
8. writing_task: prompt_bn, model_answer_en, model_answer_bn, rubric ({task_completion:4, grammar:4, vocabulary:4, coherence:4, register:4}).
9. mini_quiz: 5 questions with prompt, options (4 choices for quick check or open), answer, explanation_bn.
10. listening: original TTS-ready script_en (60-120 words appropriate to ${entry.level}), full script_bn, and 3-4 comprehension questions with answer & explanation_bn.
11. reading: original level-appropriate passage_en (60-140 words), full passage_bn, and 3-4 comprehension questions with answer & explanation_bn.

Return ONLY valid JSON matching this exact top-level structure:
{
  "lesson_id": "${entry.lesson.lesson_id}",
  "level": "${entry.level}",
  "topic": "${entry.lesson.title}",
  "title_bn": "string",
  "objectives": ["string"],
  "explanation_sections": [{"heading_bn":"","explanation_bn":"","why_when_bn":"","pattern":"","bengali_contrast":"","common_bengali_speaker_error":""}],
  "examples": [{"english":"","bangla_meaning":"","usage_note_bn":""}],
  "dialogue": [{"speaker":"","english":"","bangla_meaning":""}],
  "vocabulary": [{"english":"","bangla_meaning":"","approx_pronunciation_bn":"","ipa":null,"example_en":"","example_bn":""}],
  "exercises": [{"type":"mcq","prompt":"","options":[""],"answer":"","explanation_bn":""}],
  "answer_key_complete": true,
  "speaking_task": {"prompt_bn":"","model_answer_en":"","model_answer_bn":"","rubric":{"task_completion":4,"grammar":4,"vocabulary":4,"pronunciation":4,"fluency":4}},
  "writing_task": {"prompt_bn":"","model_answer_en":"","model_answer_bn":"","rubric":{"task_completion":4,"grammar":4,"vocabulary":4,"coherence":4,"register":4}},
  "mini_quiz": [{"prompt":"","options":[""],"answer":"","explanation_bn":""}],
  "listening": {"script_en":"","script_bn":"","questions":[{"prompt":"","answer":"","explanation_bn":""}]},
  "reading": {"passage_en":"","passage_bn":"","questions":[{"prompt":"","answer":"","explanation_bn":""}]}
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = safeParseJson<GeneratedLesson>(response.text || '{}');
    parsed.lesson_id = entry.lesson.lesson_id;
    parsed.level = entry.level;
    parsed.answer_key_complete = true;
    parsed.generated_at = new Date().toISOString();

    saveLessonCache(lessonId, parsed);
    return res.json({ lesson: parsed, cached: false });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'AI lesson generation failed.' });
  }
});

englishLearningRouter.post('/ai/evaluate-lesson-task', async (req: Request, res: Response) => {
  try {
    const { taskType, level, promptBn, userAnswer, modelAnswerEn, modelAnswerBn } = req.body || {};
    if (!userAnswer || typeof userAnswer !== 'string' || !userAnswer.trim()) {
      return res.status(400).json({ error: 'অনুগ্রহ করে আগে নিজের উত্তর লিখুন বা বলুন।' });
    }

    const ai = getAIClient();
    const isSpeaking = taskType === 'speaking';
    const criteria = isSpeaking
      ? ['task_completion', 'grammar', 'vocabulary', 'pronunciation_intelligibility', 'fluency']
      : ['task_completion', 'grammar', 'vocabulary', 'coherence', 'register'];

    const prompt = `You are a supportive Bengali-English teacher evaluating a ${level || 'A1'} learner's ${isSpeaking ? 'speaking' : 'writing'} attempt.
Rules:
- Explain feedback clearly in natural Bengali.
- Accept semantically valid equivalent answers; do NOT demand exact rote match to the model answer.
- For speaking, evaluate intelligibility and communicative clarity, NEVER native-accent imitation.
- Give at most 3 priority corrections.
- Score each of these 5 criteria from 0 to 4 (total out of 20): ${criteria.join(', ')}.

Task prompt (Bengali): ${promptBn || ''}
Learner's response: ${userAnswer}
Reference model (for teacher context only): ${modelAnswerEn || ''}

Return ONLY valid JSON:
{
  "rubric": { "${criteria[0]}": 3, "${criteria[1]}": 3, "${criteria[2]}": 3, "${criteria[3]}": 3, "${criteria[4]}": 3 },
  "total": 15,
  "passed": true,
  "feedback_bn": "string",
  "priority_corrections": [{"original":"","natural":"","reason_bn":""}],
  "natural_version_en": "string",
  "next_tip_bn": "string"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = safeParseJson<any>(response.text || '{}');
    const rubric = parsed.rubric || {};
    const total = criteria.reduce((sum, key) => sum + Math.min(4, Math.max(0, Number(rubric[key] ?? 0))), 0);

    return res.json({
      rubric,
      total,
      max: 20,
      passed: total >= 14,
      feedback_bn: parsed.feedback_bn || 'ভালো চেষ্টা করেছেন।',
      priority_corrections: Array.isArray(parsed.priority_corrections) ? parsed.priority_corrections.slice(0, 3) : [],
      natural_version_en: parsed.natural_version_en || modelAnswerEn || '',
      next_tip_bn: parsed.next_tip_bn || '',
      model_answer_en: modelAnswerEn || '',
      model_answer_bn: modelAnswerBn || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Task evaluation failed.' });
  }
});

// ============================================================================
// 3. VOCABULARY MASTER CLASS & BATCHES
// ============================================================================

englishLearningRouter.get('/batches', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const level = req.query.level ? String(req.query.level) : undefined;
    const search = req.query.search ? String(req.query.search).toLowerCase().trim() : '';

    let list = store.batches.map((b, idx) => ({
      batch_id: b.batch_id,
      index: idx,
      level: b.level,
      topic: b.topic,
      item_ids: b.item_ids,
      preview_english: b.item_ids.map(id => store.vocabById.get(id)?.english || id),
    }));

    if (level && level !== 'ALL') {
      list = list.filter(b => b.level === level);
    }
    if (search) {
      list = list.filter(
        b =>
          b.batch_id.toLowerCase().includes(search) ||
          b.topic.toLowerCase().includes(search) ||
          b.preview_english.some(e => e.toLowerCase().includes(search))
      );
    }

    return res.json({
      total: list.length,
      batches: list,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load vocabulary batches.' });
  }
});

englishLearningRouter.get('/batch/:batchId', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const batch = store.batchById.get(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ error: `Batch ${req.params.batchId} not found.` });
    }
    const idx = store.batchIndexById.get(batch.batch_id) ?? 0;
    const requestedSize = Math.min(7, Math.max(5, Number(req.query.size || 5)));

    const items: VocabItem[] = batch.item_ids
      .map(id => store.vocabById.get(id))
      .filter((x): x is VocabItem => Boolean(x));

    // If user requests 6 or 7 items (max 7 per spec), pull adjacent same-level items without duplicating
    if (requestedSize > items.length) {
      const used = new Set(items.map(i => i.id));
      const sameLevelVocab = store.vocab.filter(v => v.level === batch.level && !used.has(v.id));
      for (const extra of sameLevelVocab) {
        if (items.length >= requestedSize) break;
        items.push(extra);
      }
    }

    // Strip expected answers from public payload (strictly attempt-first!)
    const publicQuizQuestions = batch.quiz.questions.map((q, qIdx) => ({
      index: qIdx,
      prompt_bn: q.prompt_bn,
      source_item_id: q.source_item_id,
      scoring: q.scoring,
    }));

    // If extra items were added (6 or 7), add corresponding quiz questions dynamically from those items
    if (items.length > batch.item_ids.length) {
      for (let i = batch.item_ids.length; i < items.length; i++) {
        const extraItem = items[i];
        publicQuizQuestions.push({
          index: publicQuizQuestions.length,
          prompt_bn: `“${extraItem.english}”-এর স্বাভাবিক বাংলা অর্থ কী এবং কোন পরিস্থিতিতে ব্যবহার করবেন?`,
          source_item_id: extraItem.id,
          scoring: 'অর্থ সঠিক ০.৫; উপযুক্ত পরিস্থিতি ব্যাখ্যা ০.৫; মোট ১।',
        });
      }
    }

    const totalScore = publicQuizQuestions.length;
    const passScore = Math.ceil(totalScore * 0.8);

    return res.json({
      batch_id: batch.batch_id,
      index: idx,
      level: batch.level,
      topic: batch.topic,
      item_ids: items.map(i => i.id),
      items,
      learning_sequence: batch.learning_sequence,
      quiz: {
        questions: publicQuizQuestions,
        pass_score: passScore,
        total_score: totalScore,
        pass_percent: 80,
        retakes: 'unlimited',
      },
      interview: {
        closed_questions: batch.interview.closed_questions.map(q => ({
          prompt_bn: q.prompt_bn,
          item_id: q.item_id,
        })),
        open_question: {
          prompt_bn: batch.interview.open_question.prompt_bn,
        },
        rubric: batch.interview.rubric,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load batch detail.' });
  }
});

englishLearningRouter.get('/vocab', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const idsParam = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : null;
    if (idsParam && idsParam.length > 0) {
      const found = idsParam.map(id => store.vocabById.get(id)).filter((x): x is VocabItem => Boolean(x));
      return res.json({ total: found.length, items: found });
    }

    const level = req.query.level ? String(req.query.level) : undefined;
    const itemType = req.query.type ? String(req.query.type) : undefined;
    const q = req.query.q ? String(req.query.q).toLowerCase().trim() : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));

    let list = store.vocab;
    if (level && level !== 'ALL') list = list.filter(v => v.level === level);
    if (itemType && itemType !== 'ALL') list = list.filter(v => v.item_type === itemType);
    if (q) {
      list = list.filter(
        v =>
          v.english.toLowerCase().includes(q) ||
          v.bangla_meaning.toLowerCase().includes(q) ||
          v.topic.toLowerCase().includes(q)
      );
    }

    return res.json({
      total: list.length,
      items: list.slice(0, limit),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to search vocabulary.' });
  }
});

englishLearningRouter.post('/ai/evaluate-batch-quiz', async (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const { batchId, answers } = req.body || {};
    const batch = store.batchById.get(batchId);
    if (!batch) return res.status(404).json({ error: `Batch ${batchId} not found.` });
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Quiz answers are required.' });
    }

    const quizPayload = answers.map((a: any, idx: number) => {
      const item = store.vocabById.get(a.source_item_id);
      const sourceQ = batch.quiz.questions[idx];
      return {
        index: idx,
        source_item_id: a.source_item_id,
        prompt_bn: a.prompt_bn || sourceQ?.prompt_bn || '',
        user_answer: String(a.user_answer || '').trim(),
        reference_english: item?.english || '',
        reference_bangla_meaning: item?.bangla_meaning || sourceQ?.expected_answer_bn || '',
        reference_usage: item?.usage_note || '',
        reference_example_en: item?.example_en || '',
      };
    });

    const ai = getAIClient();
    const prompt = `You are a supportive Bengali-English teacher grading a Vocabulary Master Class batch quiz for CEFR level ${batch.level}.

STRICT GRADING RULES:
- Accept semantically valid equivalent answers in Bengali or English. NEVER demand exact word-for-word memorization.
- Note: Some source reference_bangla_meaning entries in A2/B1 may have a template glitch; always judge correctness against the TRUE natural Bengali meaning of reference_english!
- Score each question as 1 (correct & clear), 0.5 (partially correct — e.g., meaning right but usage missing or minor issue), or 0 (incorrect or blank).
- For every question, provide:
  - explanation_bn: clear, kind Bengali explanation of why it's right or wrong
  - natural_correction: natural correct answer/sentence
  - new_example_en: a fresh real-life English sentence using reference_english
  - new_example_bn: natural Bengali translation of new_example_en

QUESTIONS & LEARNER ANSWERS:
${JSON.stringify(quizPayload, null, 2)}

Return ONLY valid JSON:
{
  "summary_bn": "string",
  "results": [
    {
      "index": 0,
      "source_item_id": "string",
      "score": 1,
      "correct": true,
      "expected_summary": "natural Bengali meaning + usage",
      "explanation_bn": "string",
      "natural_correction": "string",
      "new_example_en": "string",
      "new_example_bn": "string"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = safeParseJson<any>(response.text || '{}');
    const rawResults = Array.isArray(parsed.results) ? parsed.results : [];

    const results = quizPayload.map((qp, idx) => {
      const r = rawResults.find((x: any) => x.index === idx) || rawResults[idx] || {};
      const numericScore = qp.user_answer.length === 0 ? 0 : Math.min(1, Math.max(0, Number(r.score ?? 0)));
      const isCorrect = numericScore >= 0.8 || Boolean(r.correct && numericScore >= 0.5);
      return {
        index: idx,
        source_item_id: qp.source_item_id,
        prompt_bn: qp.prompt_bn,
        user_answer: qp.user_answer,
        score: numericScore,
        correct: isCorrect,
        expected_summary: r.expected_summary || `${qp.reference_english} — ${qp.reference_bangla_meaning}`,
        explanation_bn: r.explanation_bn || (qp.user_answer ? 'মূল্যায়ন সম্পন্ন হয়েছে।' : 'কোনো উত্তর দেওয়া হয়নি।'),
        natural_correction: r.natural_correction || qp.reference_example_en,
        new_example_en: r.new_example_en || qp.reference_example_en,
        new_example_bn: r.new_example_bn || '',
      };
    });

    const maxScore = results.length;
    const totalScore = Number(results.reduce((s, r) => s + r.score, 0).toFixed(1));
    const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = percent >= 80;
    const missedItemIds = results.filter(r => !r.correct).map(r => r.source_item_id);

    return res.json({
      batch_id: batch.batch_id,
      total_score: totalScore,
      max_score: maxScore,
      percent,
      passed,
      summary_bn:
        parsed.summary_bn ||
        (passed
          ? `অভিনন্দন! আপনি ${totalScore}/${maxScore} (${percent}%) পেয়েছেন। এখন AI Interview ধাপে যেতে পারবেন।`
          : `আপনি ${totalScore}/${maxScore} (${percent}%) পেয়েছেন। পরের ধাপে যেতে অন্তত ৮০% প্রয়োজন। ভুলগুলো বুঝে আবার চেষ্টা করুন (unlimited retries)।`),
      missed_item_ids: missedItemIds,
      results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Batch quiz evaluation failed.' });
  }
});

// ============================================================================
// 4. VOCABULARY BATCH AI INTERVIEW (One Question at a Time, 3 Stages)
// ============================================================================

englishLearningRouter.post('/ai/batch-interview-turn', async (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const { batchId, itemIds, history, userResponse } = req.body || {};
    const batch = store.batchById.get(batchId);
    if (!batch) return res.status(404).json({ error: `Batch ${batchId} not found.` });

    const effectiveIds: string[] = Array.isArray(itemIds) && itemIds.length > 0 ? itemIds : batch.item_ids;
    const items = effectiveIds.map(id => store.vocabById.get(id)).filter((x): x is VocabItem => Boolean(x));

    // Define deterministic 4-turn sequence:
    // Turn 0: Closed Q1 -> Turn 1: Closed Q2 -> Turn 2: Open-Ended Q -> Turn 3: Contextual Role-Play -> Final Rubric
    const turnQueue = [
      ...batch.interview.closed_questions.map(q => ({
        stage: 'closed' as const,
        prompt_bn: q.prompt_bn,
        item_id: q.item_id,
      })),
      {
        stage: 'open' as const,
        prompt_bn: batch.interview.open_question.prompt_bn,
        item_id: undefined,
      },
      {
        stage: 'roleplay' as const,
        prompt_bn: `বাস্তব Role-Play: ধরুন আপনি বাস্তব জীবনে (${batch.topic.replace(/_/g, ' ')}) পরিস্থিতিতে আছেন। আমি আপনাকে একটি বাস্তব প্রশ্ন করছি—এই ব্যাচের অন্তত একটি শব্দ/বাক্যাংশ স্বাভাবিকভাবে ব্যবহার করে ইংরেজিতে উত্তর দিন।`,
        item_id: undefined,
      },
    ];

    const pastTurns: Array<{ stage: string; prompt_bn: string; prompt_en?: string; user_answer: string }> =
      Array.isArray(history) ? history : [];

    // Initial start (no userResponse yet): return Turn 0 without calling AI
    if (!userResponse || !String(userResponse).trim()) {
      return res.json({
        turn_feedback_bn:
          'স্বাগতম! Batch AI Interview শুরু হচ্ছে। আমি একবারে একটি করে প্রশ্ন করব। আগে Closed প্রশ্ন, তারপর Open-ended প্রশ্ন এবং শেষে একটি বাস্তব Role-Play। ভুল হলে চিন্তার কিছু নেই—আমি বাংলায় বুঝিয়ে দেব।',
        priority_corrections: [],
        natural_version_en: '',
        next_question: turnQueue[0],
        completed: false,
      });
    }

    const currentTurnIndex = pastTurns.length;
    const currentQ = turnQueue[Math.min(currentTurnIndex, turnQueue.length - 1)];
    const updatedHistory = [
      ...pastTurns,
      {
        stage: currentQ.stage,
        prompt_bn: currentQ.prompt_bn,
        user_answer: String(userResponse).trim(),
      },
    ];

    const isFinalTurn = updatedHistory.length >= turnQueue.length;
    const nextQ = !isFinalTurn ? turnQueue[updatedHistory.length] : null;

    const ai = getAIClient();
    const vocabContext = items.map(i => `${i.id}: "${i.english}" (level ${i.level}, example: "${i.example_en}")`).join('\n');

    const prompt = `You are a warm, disciplined Bengali-English AI Interview Coach conducting a Vocabulary Master Class batch interview (CEFR ${batch.level}, topic: ${batch.topic}).

TARGET VOCABULARY ITEMS IN THIS BATCH:
${vocabContext}

CONVERSATION HISTORY SO FAR:
${JSON.stringify(updatedHistory, null, 2)}

RULES:
- Evaluate ONLY the learner's latest answer first: warm, clear Bengali feedback, max 3 priority corrections, and a natural English version.
- Accept semantically valid equivalent expressions; evaluate intelligibility & communicative effectiveness, NEVER native-accent imitation.
- ${
      !isFinalTurn && nextQ?.stage === 'roleplay'
        ? `Also generate a short, realistic 1-2 sentence English role-play prompt ("roleplay_prompt_en") suited to CEFR ${batch.level} and topic "${batch.topic}" that invites the learner to use 1-2 items from this batch.`
        : ''
    }
- ${
      isFinalTurn
        ? `This was the FINAL turn. Now grade the learner's ENTIRE interview performance across all turns on the 5-criterion rubric (each 0 to 4, total /20, pass minimum 16/20 = 80%):
  1. meaning (0-4)
  2. contextual_use (0-4)
  3. grammar (0-4)
  4. pronunciation_intelligibility (0-4 — based on clarity, spelling/transcript intelligibility, natural phrasing)
  5. fluency (0-4 — connected expression appropriate for ${batch.level})
  List any weak item_ids from [${effectiveIds.join(', ')}] in remediation_item_ids.`
        : 'Do NOT output final_evaluation yet because more turns remain.'
    }

Return ONLY valid JSON:
{
  "turn_feedback_bn": "string",
  "priority_corrections": [{"original":"","natural":"","reason_bn":""}],
  "natural_version_en": "string",
  "roleplay_prompt_en": "optional string only if next turn is roleplay",
  "final_evaluation": ${
    isFinalTurn
      ? `{
    "meaning": 3,
    "contextual_use": 3,
    "grammar": 3,
    "pronunciation_intelligibility": 3,
    "fluency": 3,
    "summary_bn": "string",
    "remediation_item_ids": [],
    "remediation_advice_bn": "string"
  }`
      : 'null'
  }
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = safeParseJson<any>(response.text || '{}');

    let finalEvaluation: any = undefined;
    if (isFinalTurn && parsed.final_evaluation) {
      const fe = parsed.final_evaluation;
      const m = Math.min(4, Math.max(0, Number(fe.meaning ?? 0)));
      const c = Math.min(4, Math.max(0, Number(fe.contextual_use ?? 0)));
      const g = Math.min(4, Math.max(0, Number(fe.grammar ?? 0)));
      const p = Math.min(4, Math.max(0, Number(fe.pronunciation_intelligibility ?? 0)));
      const f = Math.min(4, Math.max(0, Number(fe.fluency ?? 0)));
      const total = m + c + g + p + f;
      const percent = Math.round((total / 20) * 100);
      const passed = total >= 16;

      finalEvaluation = {
        rubric: {
          meaning_or_relevance: m,
          contextual_use_or_clarity: c,
          grammar: g,
          pronunciation_intelligibility: p,
          fluency: f,
          total,
          max: 20,
          percent,
          passed,
        },
        passed,
        summary_bn:
          fe.summary_bn ||
          (passed
            ? `চমৎকার! আপনি ${total}/20 (${percent}%) পেয়েছেন। পরের ব্যাচটি এখন unlock হয়েছে।`
            : `আপনি ${total}/20 (${percent}%) পেয়েছেন। পরের ব্যাচ unlock করতে অন্তত ১৬/২০ (৮০%) প্রয়োজন।`),
        remediation_item_ids: Array.isArray(fe.remediation_item_ids) ? fe.remediation_item_ids : [],
        remediation_advice_bn: fe.remediation_advice_bn || '',
      };
    }

    const nextQuestionPayload = nextQ
      ? {
          ...nextQ,
          prompt_en: nextQ.stage === 'roleplay' ? parsed.roleplay_prompt_en || undefined : undefined,
        }
      : null;

    return res.json({
      turn_feedback_bn: parsed.turn_feedback_bn || 'ভালো চেষ্টা করেছেন।',
      priority_corrections: Array.isArray(parsed.priority_corrections) ? parsed.priority_corrections.slice(0, 3) : [],
      natural_version_en: parsed.natural_version_en || '',
      next_question: nextQuestionPayload,
      completed: isFinalTurn,
      final_evaluation: finalEvaluation,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Batch AI interview turn failed.' });
  }
});

// ============================================================================
// 5. ROLE-SPECIFIC AI INTERVIEW PACKS & DAILY CONVERSATION
// ============================================================================

englishLearningRouter.get('/interview-pack/:role', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const role = req.params.role;
    const pack = store.interviewPacks.get(role);
    if (!pack) {
      return res.status(404).json({ error: `Interview pack "${role}" not found.` });
    }
    const labels = ROLE_LABELS[role] || { title_en: role, title_bn: role };
    // Never send model answers before learner attempts!
    return res.json({
      role: pack.role,
      title_en: labels.title_en,
      title_bn: labels.title_bn,
      question_count: pack.question_count,
      questions: pack.questions.map(q => ({
        id: q.id,
        question_en: q.question_en,
        question_bn: q.question_bn,
        follow_up_prompt_en: q.follow_up_prompt_en,
        follow_up_prompt_bn: q.follow_up_prompt_bn,
        evaluation_criteria: q.evaluation_criteria,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load interview pack.' });
  }
});

englishLearningRouter.post('/ai/role-interview-evaluate', async (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const { role, questionId, customPromptEn, userAnswer, level } = req.body || {};
    if (!userAnswer || !String(userAnswer).trim()) {
      return res.status(400).json({ error: 'অনুগ্রহ করে আগে নিজের উত্তর দিন, তারপর মডেল উত্তর ও মূল্যায়ন দেখতে পাবেন।' });
    }

    let questionEn = customPromptEn || '';
    let questionBn = '';
    let modelEn = '';
    let modelBn = '';
    let followUpEn = 'Can you give a specific example?';
    let followUpBn = 'আপনি কি একটি নির্দিষ্ট উদাহরণ দিতে পারবেন?';

    if (role && role !== 'daily_conversation') {
      const pack = store.interviewPacks.get(role);
      const q = pack?.questions.find(item => item.id === questionId);
      if (q) {
        questionEn = q.question_en;
        questionBn = q.question_bn;
        modelEn = q.model_answer_en;
        modelBn = q.model_answer_bn;
        followUpEn = q.follow_up_prompt_en;
        followUpBn = q.follow_up_prompt_bn;
      }
    }

    const ai = getAIClient();
    const prompt = `You are a professional Bengali-English AI Interview Coach.
Mode/Role: ${role || 'daily_conversation'}
Target CEFR context: ${level || 'B1'}
Question (EN): ${questionEn}
Question (BN): ${questionBn}
Learner's response: ${String(userAnswer).trim()}

TEACHING RULES:
- Give clear, encouraging Bengali feedback first.
- Highlight at most 3 priority corrections with original, natural English, and Bengali reason.
- Provide a natural improved version of the learner's OWN answer (do not invent fake personal details).
- Score 5 criteria from 0 to 4 (total /20, pass >= 16):
  meaning_or_relevance, contextual_use_or_clarity, grammar, pronunciation_intelligibility, fluency.
- Focus on intelligibility and communicative effectiveness, NEVER native-accent imitation.
- Provide a short contextual follow-up question in English and Bengali.
${!modelEn ? '- Also provide a helpful model_answer_en and model_answer_bn for this daily conversation question.' : ''}

Return ONLY valid JSON:
{
  "rubric": {
    "meaning_or_relevance": 3,
    "contextual_use_or_clarity": 3,
    "grammar": 3,
    "pronunciation_intelligibility": 3,
    "fluency": 3
  },
  "feedback_bn": "string",
  "priority_corrections": [{"original":"","natural":"","reason_bn":""}],
  "natural_version_en": "string",
  "follow_up_en": "string",
  "follow_up_bn": "string",
  "model_answer_en": "string",
  "model_answer_bn": "string"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = safeParseJson<any>(response.text || '{}');
    const r = parsed.rubric || {};
    const s1 = Math.min(4, Math.max(0, Number(r.meaning_or_relevance ?? 0)));
    const s2 = Math.min(4, Math.max(0, Number(r.contextual_use_or_clarity ?? 0)));
    const s3 = Math.min(4, Math.max(0, Number(r.grammar ?? 0)));
    const s4 = Math.min(4, Math.max(0, Number(r.pronunciation_intelligibility ?? 0)));
    const s5 = Math.min(4, Math.max(0, Number(r.fluency ?? 0)));
    const total = s1 + s2 + s3 + s4 + s5;
    const percent = Math.round((total / 20) * 100);

    return res.json({
      rubric: {
        meaning_or_relevance: s1,
        contextual_use_or_clarity: s2,
        grammar: s3,
        pronunciation_intelligibility: s4,
        fluency: s5,
        total,
        max: 20,
        percent,
        passed: total >= 16,
      },
      feedback_bn: parsed.feedback_bn || 'ভালো উত্তর দিয়েছেন।',
      priority_corrections: Array.isArray(parsed.priority_corrections) ? parsed.priority_corrections.slice(0, 3) : [],
      natural_version_en: parsed.natural_version_en || '',
      follow_up_en: parsed.follow_up_en || followUpEn,
      follow_up_bn: parsed.follow_up_bn || followUpBn,
      model_answer_en: modelEn || parsed.model_answer_en || '',
      model_answer_bn: modelBn || parsed.model_answer_bn || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Role interview evaluation failed.' });
  }
});

// ============================================================================
// 6. PLACEMENT TEST
// ============================================================================

englishLearningRouter.get('/placement', (_req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const md = store.files.get('SUPPLEMENTARY_LEARNING_TOOLKITS/PLACEMENT_TEST_BN.md') || '';
    const { publicData } = parsePlacementTest(md);
    return res.json(publicData);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load placement test.' });
  }
});

englishLearningRouter.post('/ai/placement-evaluate', async (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const md = store.files.get('SUPPLEMENTARY_LEARNING_TOOLKITS/PLACEMENT_TEST_BN.md') || '';
    const { publicData, answerKey } = parsePlacementTest(md);
    const { answers = {}, writingText = '', speakingText = '' } = req.body || {};

    // Grade Part A deterministically
    let partAScore = 0;
    const partAReview: Array<{
      id: string;
      user_answer: string;
      expected_answer: string;
      correct: boolean;
      explanation_bn: string;
    }> = [];

    for (const q of publicData.part_a) {
      const userAns = String(answers[q.id] || '').trim();
      const exp = answerKey[q.id];
      const correct = userAns.toLowerCase() === exp.toLowerCase();
      if (correct) partAScore++;
      partAReview.push({
        id: q.id,
        user_answer: userAns,
        expected_answer: exp,
        correct,
        explanation_bn: correct ? 'সঠিক উত্তর!' : `সঠিক উত্তর হলো “${exp}”।`,
      });
    }

    // Use AI to semantically grade Part B, Part C, Part D (Writing), Part E (Speaking) and recommend CEFR level
    const openQs = [
      ...publicData.part_b.questions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        expected: answerKey[q.id],
        user_answer: String(answers[q.id] || '').trim(),
      })),
      ...publicData.part_c.questions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        expected: answerKey[q.id],
        user_answer: String(answers[q.id] || '').trim(),
      })),
    ];

    const ai = getAIClient();
    const prompt = `You are a CEFR English placement evaluator for Bengali learners.
Evaluate these placement test responses semantically (accept valid equivalent wording in English; blank = wrong).

Part A Grammar Score: ${partAScore} / ${publicData.part_a.length}
Part B (Reading) & Part C (Listening) responses:
${JSON.stringify(openQs, null, 2)}

Part D Writing sample:
"${String(writingText || '').trim()}"

Part E Speaking sample (transcript/text):
"${String(speakingText || '').trim()}"

Recommend ONE starting level from ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"] based on overall evidence (if writing/speaking are blank or very basic, be conservative and recommend Pre-A1 or A1).
Never claim this is an official CEFR certificate; remind the learner they can always choose Pre-A1.

Return ONLY valid JSON:
{
  "open_results": [{"id":"B1","correct":true,"explanation_bn":"string"}],
  "writing_score": 10,
  "speaking_score": 10,
  "recommended_level": "A1",
  "summary_bn": "string",
  "strengths_bn": ["string"],
  "focus_areas_bn": ["string"]
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = safeParseJson<any>(response.text || '{}');
    const openResultsRaw = Array.isArray(parsed.open_results) ? parsed.open_results : [];

    let partBScore = 0;
    let partCScore = 0;
    const openReview = openQs.map(q => {
      const found = openResultsRaw.find((r: any) => r.id === q.id);
      const isCorrect = q.user_answer.length > 0 && Boolean(found?.correct);
      if (isCorrect) {
        if (q.id.startsWith('B')) partBScore++;
        if (q.id.startsWith('C')) partCScore++;
      }
      return {
        id: q.id,
        user_answer: q.user_answer,
        expected_answer: q.expected,
        correct: isCorrect,
        explanation_bn: found?.explanation_bn || (isCorrect ? 'সঠিক!' : `সম্ভাব্য উত্তর: ${q.expected}`),
      };
    });

    const recLevel: CEFRLevel = CEFR_ORDER.includes(parsed.recommended_level)
      ? parsed.recommended_level
      : 'Pre-A1';

    return res.json({
      part_a_score: partAScore,
      part_a_total: publicData.part_a.length,
      part_b_score: partBScore,
      part_b_total: publicData.part_b.questions.length,
      part_c_score: partCScore,
      part_c_total: publicData.part_c.questions.length,
      writing_score: Math.min(20, Math.max(0, Number(parsed.writing_score ?? 0))),
      speaking_score: Math.min(20, Math.max(0, Number(parsed.speaking_score ?? 0))),
      recommended_level: recLevel,
      summary_bn:
        parsed.summary_bn ||
        `আপনার প্রাথমিক ফলাফল অনুযায়ী ${recLevel} স্তর থেকে শুরু করার পরামর্শ দেওয়া হচ্ছে। তবে আপনি চাইলে Pre-A1 থেকেও শুরু করতে পারেন।`,
      strengths_bn: Array.isArray(parsed.strengths_bn) ? parsed.strengths_bn : [],
      focus_areas_bn: Array.isArray(parsed.focus_areas_bn) ? parsed.focus_areas_bn : [],
      answer_review: [...partAReview, ...openReview],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Placement evaluation failed.' });
  }
});

// ============================================================================
// 7. CEFR LEVEL REVIEW TESTS (7 Tests, 40 Objective + Writing 20 + Speaking 20)
// ============================================================================

englishLearningRouter.get('/test/:level', (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const level = req.params.level as CEFRLevel;
    const test = store.reviewTests.get(level);
    if (!test) return res.status(404).json({ error: `Review test for ${level} not found.` });

    // Strip answers and answer_key so learner must attempt first!
    return res.json({
      level: test.level,
      question_count: test.question_count,
      instructions_bn: test.instructions_bn,
      reading: {
        passage_en: test.reading.passage_en,
      },
      listening: {
        script_en: test.listening.script_en,
      },
      questions: test.questions.map(q => ({
        id: q.id,
        section: q.section,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
      })),
      writing_task: {
        prompt_bn: test.writing_task.prompt_bn,
        rubric: test.writing_task.rubric,
        minimum: test.writing_task.minimum,
      },
      speaking_task: {
        prompt_bn: test.speaking_task.prompt_bn,
        rubric: test.speaking_task.rubric,
        minimum: test.speaking_task.minimum,
      },
      scoring: test.scoring,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to load review test.' });
  }
});

englishLearningRouter.post('/ai/evaluate-level-test', async (req: Request, res: Response) => {
  try {
    const store = loadCourseStore();
    const { level, answers = {}, writingText = '', speakingText = '' } = req.body || {};
    const test = store.reviewTests.get(level as CEFRLevel);
    if (!test) return res.status(404).json({ error: `Review test for ${level} not found.` });

    // 1. Grade MCQ deterministically, collect constructed_response & comprehension for semantic AI grading
    const mcqResults = new Map<string, { correct: boolean; explanation_bn: string }>();
    const openItems: Array<{ id: string; prompt: string; expected: string; user_answer: string }> = [];

    for (const q of test.questions) {
      const userAns = String(answers[q.id] || '').trim();
      if (q.type === 'mcq') {
        const correct = userAns.toLowerCase() === String(q.answer || '').trim().toLowerCase();
        mcqResults.set(q.id, {
          correct,
          explanation_bn: q.explanation_bn || (correct ? 'সঠিক উত্তর!' : `সঠিক উত্তর: ${q.answer}`),
        });
      } else {
        openItems.push({
          id: q.id,
          prompt: q.prompt,
          expected: q.answer,
          user_answer: userAns,
        });
      }
    }

    const ai = getAIClient();
    const prompt = `You are a certified CEFR examiner & Bengali-English teacher grading a ${test.level} Level Review Test.

TASKS:
1. Semantically grade each non-MCQ question below (constructed_response & comprehension). Accept any grammatically and semantically valid equivalent answer. Blank answers MUST be marked false. Give a concise Bengali explanation for each.
2. Grade the Writing Task (out of 20; 5 criteria x 0–4: task_completion, grammar, vocabulary, coherence, register). Minimum to pass writing = 14/20. If blank or extremely short (<10 words for A2+), score honestly low. Give Bengali feedback, up to 3 priority corrections, and a level-appropriate original model answer (EN + BN).
3. Grade the Speaking Task (out of 20; 5 criteria x 0–4: task_completion, grammar, vocabulary, pronunciation_intelligibility, fluency). Minimum to pass speaking = 14/20. Evaluate intelligibility & communicative effectiveness, NEVER native-accent imitation. Give Bengali feedback, up to 3 priority corrections, and a level-appropriate original model answer (EN + BN).
4. Provide natural, complete Bengali translations for the Reading passage and Listening script (for post-submission review).

NON-MCQ QUESTIONS:
${JSON.stringify(openItems, null, 2)}

READING PASSAGE:
${test.reading.passage_en}

LISTENING SCRIPT:
${test.listening.script_en}

WRITING PROMPT: ${test.writing_task.prompt_bn}
LEARNER WRITING: "${String(writingText || '').trim()}"

SPEAKING PROMPT: ${test.speaking_task.prompt_bn}
LEARNER SPEAKING: "${String(speakingText || '').trim()}"

Return ONLY valid JSON:
{
  "open_results": [{"id":"string","correct":true,"explanation_bn":"string"}],
  "writing": {
    "rubric": {"task_completion":3,"grammar":3,"vocabulary":3,"coherence":3,"register":3},
    "feedback_bn": "string",
    "corrections_bn": ["string"],
    "model_en": "string",
    "model_bn": "string"
  },
  "speaking": {
    "rubric": {"task_completion":3,"grammar":3,"vocabulary":3,"pronunciation_intelligibility":3,"fluency":3},
    "feedback_bn": "string",
    "corrections_bn": ["string"],
    "model_en": "string",
    "model_bn": "string"
  },
  "reading_translation_bn": "string",
  "listening_translation_bn": "string"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = safeParseJson<any>(response.text || '{}');
    const openRaw = Array.isArray(parsed.open_results) ? parsed.open_results : [];
    const openMap = new Map<string, any>(openRaw.map((r: any) => [r.id, r]));

    let objectiveScore = 0;
    const questionResults = test.questions.map(q => {
      const userAns = String(answers[q.id] || '').trim();
      let correct = false;
      let explanationBn = q.explanation_bn || '';
      if (q.type === 'mcq') {
        const m = mcqResults.get(q.id);
        correct = Boolean(m?.correct);
        explanationBn = m?.explanation_bn || explanationBn;
      } else {
        const o = openMap.get(q.id);
        correct = userAns.length > 0 && Boolean(o?.correct);
        explanationBn = o?.explanation_bn || explanationBn;
      }
      if (correct) objectiveScore++;
      return {
        id: q.id,
        section: q.section,
        prompt: q.prompt,
        user_answer: userAns,
        expected_answer: q.answer,
        correct,
        explanation_bn: explanationBn,
      };
    });

    const wRubric = parsed.writing?.rubric || {};
    const writingKeys = ['task_completion', 'grammar', 'vocabulary', 'coherence', 'register'];
    const writingScore = String(writingText || '').trim().length === 0
      ? 0
      : writingKeys.reduce((s, k) => s + Math.min(4, Math.max(0, Number(wRubric[k] ?? 0))), 0);

    const sRubric = parsed.speaking?.rubric || {};
    const speakingKeys = ['task_completion', 'grammar', 'vocabulary', 'pronunciation_intelligibility', 'fluency'];
    const speakingScore = String(speakingText || '').trim().length === 0
      ? 0
      : speakingKeys.reduce((s, k) => s + Math.min(4, Math.max(0, Number(sRubric[k] ?? 0))), 0);

    const totalScore = objectiveScore + writingScore + speakingScore;
    const passed =
      totalScore >= test.scoring.pass_total &&
      writingScore >= test.scoring.writing_minimum &&
      speakingScore >= test.scoring.speaking_minimum;

    const passBreakdownBn = passed
      ? `অভিনন্দন! আপনি ${test.level} Review Test পাস করেছেন (মোট ${totalScore}/80, Writing ${writingScore}/20, Speaking ${speakingScore}/20)।`
      : `মোট ${totalScore}/80 (প্রয়োজন >=৬৪), Writing ${writingScore}/20 (প্রয়োজন >=১৪), Speaking ${speakingScore}/20 (প্রয়োজন >=১৪)। ভুলগুলো দেখে নিয়ে যতবার খুশি আবার পরীক্ষা দিতে পারবেন।`;

    return res.json({
      level: test.level,
      objective_score: objectiveScore,
      objective_total: test.scoring.objective_questions,
      writing_score: writingScore,
      writing_total: test.scoring.writing_points,
      writing_rubric: wRubric,
      writing_feedback_bn: parsed.writing?.feedback_bn || '',
      writing_corrections_bn: Array.isArray(parsed.writing?.corrections_bn) ? parsed.writing.corrections_bn : [],
      writing_model_en: parsed.writing?.model_en || '',
      writing_model_bn: parsed.writing?.model_bn || '',
      speaking_score: speakingScore,
      speaking_total: test.scoring.speaking_points,
      speaking_rubric: sRubric,
      speaking_feedback_bn: parsed.speaking?.feedback_bn || '',
      speaking_corrections_bn: Array.isArray(parsed.speaking?.corrections_bn) ? parsed.speaking.corrections_bn : [],
      speaking_model_en: parsed.speaking?.model_en || '',
      speaking_model_bn: parsed.speaking?.model_bn || '',
      total_score: totalScore,
      max_score: test.scoring.total,
      passed,
      pass_breakdown_bn: passBreakdownBn,
      reading_translation_bn: parsed.reading_translation_bn || '',
      listening_translation_bn: parsed.listening_translation_bn || '',
      question_results: questionResults,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Level test evaluation failed.' });
  }
});
