import { OnePerIntelligence } from 'one-per-intelligence';
import { extractHashtags, normalizeTag, type JournalAttachment } from './journal';

// On-device understanding for free-form journal messages: which habit (if any)
// a message logs, and a few topic tags. Uses Apple's on-device Foundation
// Model when available, otherwise a keyword matcher. Nothing leaves the phone.

export type AnalyzableHabit = { id: number; title: string; subtitle?: string | null };

export interface MessageAnalysis {
  habitId: number | null;
  tags: string[];
  source: 'apple' | 'keywords';
}

const MAX_AUTO_TAGS = 3;
const MODEL_TIMEOUT_MS = 6000;

// ── Text helpers ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  ('a an the and or but of to in on at for with my me i im i\'m it is was were be been am are this that ' +
    'today day daily minutes minute min mins hour hours some more less every each just did do done got go went ' +
    'about from by up out into after before then so very really')
    .split(' '),
);

function stem(word: string): string {
  return word
    .replace(/(?:ing|ed|es|s)$/u, '')
    .replace(/(.)\1$/u, '$1') // running -> runn -> run
    .replace(/e$/u, '');       // meditate / meditated -> meditat
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

/** Words that, when a habit's text contains the key, also signal that habit. */
const HABIT_SYNONYMS: Record<string, string[]> = {
  run: ['ran', 'jog', 'jogged', 'jogging', 'km', 'k', '5k', '10k', 'marathon', 'miles', 'mile', 'sprint'],
  walk: ['walked', 'steps', 'stroll', 'hike', 'hiked', 'hiking'],
  read: ['read', 'book', 'books', 'pages', 'page', 'chapter', 'novel', 'kindle'],
  meditat: ['meditate', 'meditated', 'meditation', 'mindful', 'mindfulness', 'breathwork', 'breathing', 'headspace', 'calm'],
  workout: ['gym', 'lift', 'lifted', 'lifting', 'exercise', 'exercised', 'training', 'trained', 'pushups', 'squats', 'weights', 'hiit', 'crossfit'],
  exercis: ['gym', 'workout', 'lift', 'lifting', 'training', 'pushups', 'squats', 'weights', 'hiit'],
  gym: ['workout', 'lift', 'lifting', 'weights', 'training'],
  yoga: ['stretch', 'stretched', 'stretching', 'asana', 'pilates'],
  stretch: ['yoga', 'mobility', 'stretched'],
  water: ['drank', 'drink', 'hydrate', 'hydrated', 'liters', 'litres', 'glasses', 'bottle'],
  journal: ['wrote', 'writing', 'diary', 'reflect', 'reflected', 'reflection'],
  writ: ['wrote', 'words', 'draft', 'essay', 'blog'],
  sleep: ['slept', 'bed', 'bedtime', 'nap', 'asleep'],
  study: ['studied', 'learn', 'learned', 'learning', 'course', 'lesson', 'flashcards', 'anki'],
  learn: ['studied', 'study', 'course', 'lesson', 'practice', 'practiced'],
  code: ['coded', 'coding', 'programming', 'programmed', 'shipped', 'commit', 'leetcode'],
  practic: ['practiced', 'practise', 'rehearse', 'rehearsed'],
  guitar: ['played', 'chords', 'strum'],
  piano: ['played', 'scales'],
  cook: ['cooked', 'meal', 'recipe', 'dinner', 'lunch', 'breakfast'],
  clean: ['cleaned', 'tidied', 'tidy', 'declutter', 'vacuumed'],
  gratitud: ['grateful', 'thankful', 'gratitude'],
  phone: ['screen', 'social', 'scrolling', 'doomscroll', 'instagram', 'tiktok'],
  swim: ['swam', 'laps', 'pool'],
  bike: ['cycled', 'cycling', 'ride', 'rode'],
  cycl: ['bike', 'biked', 'ride', 'rode'],
  pray: ['prayed', 'prayer'],
  vitamin: ['supplements', 'pills', 'took'],
  sun: ['sunlight', 'outside', 'outdoors'],
};

// Plans, wishes and to-dos shouldn't tick a habit.
const FUTURE_OR_INTENT =
  /\b(tomorrow|tonight|later|next (?:week|time|month)|will|gonna|going to|plan(?:ning)? to|need to|have to|should|want to|wanna|todo|to-do|remind|skip(?:ped)?|didn'?t|did not|missed|no time)\b/i;

// ── Keyword matcher ──────────────────────────────────────────────────────────

function keywordHabit(text: string, habits: AnalyzableHabit[]): number | null {
  if (FUTURE_OR_INTENT.test(text) || text.trim().endsWith('?')) return null;
  const words = tokens(text);
  if (!words.length) return null;
  const stems = new Set(words.map(stem));
  const raw = new Set(words);

  let best: { id: number; score: number } | null = null;
  let runnerUp = 0;
  for (const habit of habits) {
    const habitWords = tokens(`${habit.title} ${habit.subtitle ?? ''}`);
    let score = 0;
    for (const hw of habitWords) {
      if (stems.has(stem(hw))) score += hw.length >= 4 ? 2 : 1;
    }
    const habitText = habitWords.join(' ');
    for (const [key, synonyms] of Object.entries(HABIT_SYNONYMS)) {
      if (!habitText.includes(key)) continue;
      if (synonyms.some((s) => raw.has(s) || stems.has(stem(s)))) score += 2;
    }
    if (score > (best?.score ?? 0)) {
      runnerUp = best?.score ?? 0;
      best = { id: habit.id, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  // Need a clear, unambiguous winner.
  return best && best.score >= 2 && best.score > runnerUp ? best.id : null;
}

/** Broad topics with the words that suggest them. */
const TOPICS: Record<string, string[]> = {
  fitness: ['run', 'ran', 'gym', 'workout', 'lift', 'exercise', 'yoga', 'swim', 'bike', 'hike', 'steps', 'squats', 'pushups', 'km', 'cardio'],
  health: ['sleep', 'slept', 'doctor', 'sick', 'water', 'drank', 'hydrate', 'liters', 'litres', 'vitamin', 'diet', 'weight', 'headache', 'medicine', 'meds'],
  food: ['ate', 'eat', 'dinner', 'lunch', 'breakfast', 'recipe', 'cook', 'cooked', 'restaurant', 'coffee', 'meal'],
  reading: ['book', 'books', 'read', 'chapter', 'pages', 'novel', 'author', 'kindle'],
  learning: ['learn', 'learned', 'course', 'study', 'studied', 'lesson', 'tutorial', 'lecture', 'duolingo', 'spanish', 'french', 'english', 'german', 'japanese', 'chinese', 'vietnamese', 'korean', 'language', 'vocabulary'],
  work: ['work', 'meeting', 'client', 'deadline', 'boss', 'project', 'office', 'email', 'presentation', 'team'],
  ideas: ['idea', 'ideas', 'maybe', 'what if', 'could build', 'brainstorm', 'concept'],
  money: ['money', 'budget', 'spent', 'pay', 'paid', 'salary', 'invest', 'savings', 'bill', 'rent', '$'],
  family: ['mom', 'dad', 'mother', 'father', 'kids', 'son', 'daughter', 'wife', 'husband', 'family', 'parents', 'brother', 'sister'],
  friends: ['friend', 'friends', 'party', 'hangout', 'birthday'],
  travel: ['trip', 'flight', 'travel', 'hotel', 'airport', 'vacation', 'beach'],
  mood: ['happy', 'sad', 'anxious', 'stressed', 'tired', 'grateful', 'excited', 'angry', 'calm', 'lonely', 'proud', 'feel', 'feeling'],
  mindfulness: ['meditate', 'meditation', 'breathe', 'breathing', 'mindful', 'gratitude', 'grateful'],
  shopping: ['buy', 'bought', 'order', 'ordered', 'amazon', 'groceries'],
  music: ['song', 'album', 'playlist', 'guitar', 'piano', 'concert'],
  movies: ['movie', 'film', 'series', 'episode', 'netflix', 'watched'],
  code: ['code', 'coding', 'bug', 'deploy', 'github', 'api', 'commit', 'programming'],
  goals: ['goal', 'goals', 'resolution', 'milestone', 'progress'],
  todo: ['todo', 'to-do', 'need to', 'remember to', "don't forget", 'must'],
};

function keywordTags(text: string, attachments: Pick<JournalAttachment, 'kind'>[]): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const words = new Set(tokens(text));
  const stems = new Set([...words].map(stem));
  const scored: [string, number][] = [];
  for (const [topic, cues] of Object.entries(TOPICS)) {
    let score = 0;
    for (const cue of cues) {
      const hit = cue.includes(' ') || cue === '$'
        ? lower.includes(cue)
        : words.has(cue) || (cue.length >= 4 && stems.has(stem(cue)));
      if (hit) score++;
    }
    if (score) scored.push([topic, score]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const tags = scored.map(([t]) => t);
  if (!tags.length && attachments.some((a) => a.kind === 'photo') && !text.trim()) tags.push('moments');
  return tags.slice(0, MAX_AUTO_TAGS);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isOnDeviceModelAvailable(): boolean {
  try {
    return !!OnePerIntelligence?.isAvailable();
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function cleanTags(raw: string[], text: string, knownTags: string[]): string[] {
  const own = new Set(extractHashtags(text));
  const known = new Set(knownTags);
  const out: string[] = [];
  for (const tag of raw) {
    const t = normalizeTag(tag);
    if (!t || t.length < 2 || own.has(t) || out.includes(t) || /^\d+$/.test(t)) continue;
    // Prefer an existing tag that differs only by a plural "s".
    const reuse = known.has(`${t}s`) ? `${t}s` : t.endsWith('s') && known.has(t.slice(0, -1)) ? t.slice(0, -1) : t;
    if (!out.includes(reuse)) out.push(reuse);
  }
  return out.slice(0, MAX_AUTO_TAGS);
}

/**
 * Suggests the habit a message logs and up to three topic tags.
 * `matchHabit: false` skips habit matching (e.g. the user picked one manually).
 */
export async function analyzeMessage(input: {
  text: string;
  habits: AnalyzableHabit[];
  knownTags: string[];
  attachments?: Pick<JournalAttachment, 'kind'>[];
  matchHabit?: boolean;
}): Promise<MessageAnalysis> {
  const text = input.text.trim();
  const matchHabit = input.matchHabit !== false;
  const attachments = input.attachments ?? [];

  if (text && isOnDeviceModelAvailable()) {
    try {
      const result = await withTimeout(
        OnePerIntelligence!.analyzeAsync(
          text,
          matchHabit ? input.habits.map((h) => ({ id: h.id, title: h.title, subtitle: h.subtitle ?? null })) : [],
          input.knownTags,
        ),
        MODEL_TIMEOUT_MS,
      );
      const habitId =
        matchHabit && input.habits.some((h) => h.id === result.habitId)
          ? result.habitId
          : null;
      return { habitId, tags: cleanTags(result.tags ?? [], text, input.knownTags), source: 'apple' };
    } catch (error) {
      console.warn('On-device analysis failed, using keywords:', error);
    }
  }

  return {
    habitId: matchHabit ? keywordHabit(text, input.habits) : null,
    tags: cleanTags(keywordTags(text, attachments), text, input.knownTags),
    source: 'keywords',
  };
}

/** Exposed for tests / quick sanity checks. */
export const __testing = { keywordHabit, keywordTags, cleanTags };
