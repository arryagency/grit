import { WorkoutSession, ExerciseLog } from './storage';
import { isCompound } from '../constants/exercises';

export interface OverloadSuggestion {
  weight: number;
  reason: string;
  type: 'increase' | 'maintain' | 'deload';
}

function getLastNSessionsWithExercise(
  exerciseName: string,
  sessions: WorkoutSession[],
  n: number
): ExerciseLog[] {
  const lower = exerciseName.toLowerCase();
  const results: ExerciseLog[] = [];
  for (const session of sessions) {
    if (results.length >= n) break;
    const found = session.exercises.find((e) => e.name.toLowerCase() === lower);
    if (found) results.push(found);
  }
  return results;
}

function allRepsHit(exercise: ExerciseLog, targetReps: number = 8): boolean {
  const completedSets = exercise.sets.filter((s) => s.completed);
  if (completedSets.length === 0) return false;
  return completedSets.every((s) => s.reps >= targetReps);
}

function getTopWeight(exercise: ExerciseLog): number {
  const completed = exercise.sets.filter((s) => s.completed && s.weight > 0);
  if (completed.length === 0) return 0;
  return Math.max(...completed.map((s) => s.weight));
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function getSuggestion(
  exerciseName: string,
  sessions: WorkoutSession[]
): OverloadSuggestion | null {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const history = getLastNSessionsWithExercise(exerciseName, sorted, 3);
  if (history.length === 0) return null;

  const compound = isCompound(exerciseName);
  const increment = compound ? 2.5 : 1.25;
  const step = compound ? 2.5 : 1.25;

  const last = history[0];
  // Use working-set weight only (exclude warm-ups from suggestion)
  const lastWeight = getTopWeightWorkingSets(last) || getTopWeight(last);

  // No completed sets with real weight — can't suggest anything meaningful
  if (lastWeight === 0) return null;

  const lastHit = allRepsHitWorkingSets(last) || allRepsHit(last);

  if (history.length >= 3) {
    const w0 = getTopWeightWorkingSets(history[0]) || getTopWeight(history[0]);
    const w1 = getTopWeightWorkingSets(history[1]) || getTopWeight(history[1]);
    const w2 = getTopWeightWorkingSets(history[2]) || getTopWeight(history[2]);
    // Only flag stall if all three sessions have real weight
    if (w0 > 0 && w1 > 0 && w2 > 0 && w0 === w1 && w1 === w2 && !lastHit) {
      const deloadWeight = roundToNearest(lastWeight * 0.9, step);
      return {
        weight: Math.max(deloadWeight, step),
        reason: `Stalled 3 sessions. Deload to ${Math.max(deloadWeight, step)}kg — nail the reps, build back.`,
        type: 'deload',
      };
    }
  }

  if (history.length >= 2) {
    const prev = history[1];
    const prevWeight = getTopWeightWorkingSets(prev) || getTopWeight(prev);
    const prevHit = prevWeight > 0 && (allRepsHitWorkingSets(prev) || allRepsHit(prev));

    if (lastHit && prevHit) {
      const newWeight = roundToNearest(lastWeight + increment, step);
      return {
        weight: newWeight,
        reason: `Hit reps 2 sessions running. Add ${increment}kg.`,
        type: 'increase',
      };
    }
  }

  if (!lastHit) {
    return {
      weight: lastWeight,
      reason: 'Missed reps last session. Same weight, better technique.',
      type: 'maintain',
    };
  }

  return {
    weight: lastWeight,
    reason: 'Hit your reps again to earn the next increase.',
    type: 'maintain',
  };
}

export function getMotivationalLine(streak: number, daysSinceLast: number): string {
  // 999 is the sentinel for "no sessions yet" — never show it as a day count
  if (daysSinceLast >= 999) return 'Log your first session. Everything starts somewhere.';
  if (daysSinceLast === 0) return 'Good. Now make it count.';
  if (daysSinceLast >= 7) {
    return `${daysSinceLast} days gone. Stop making it a bigger thing than it is. Just start.`;
  }
  if (daysSinceLast >= 4) {
    return `You've been quiet for ${daysSinceLast} days. What's the actual reason?`;
  }
  if (daysSinceLast >= 2) {
    return `${daysSinceLast} days off. Time to get back in.`;
  }
  if (streak >= 30) return `${streak} sessions straight. That's what discipline looks like.`;
  if (streak >= 20) return `${streak} in a row. Don't break what you built.`;
  if (streak >= 10) return `${streak} sessions. Consistency is compounding.`;
  if (streak >= 5) return `${streak} sessions logged. Keep the pattern going.`;
  if (streak >= 1) return `${streak} session streak. Build on it.`;
  return 'Log your first session. Everything starts somewhere.';
}

const DAILY_QUOTES = [
  "Missing one gym session won't hurt you. But the attitude that allows you to miss one session without guilt is going to hurt you.",
  "The man who goes to the gym every single day regardless of how he feels will always beat the man who goes when he feels like it.",
  "The gym is perhaps the cheapest possible hourly activity money can buy. And some people STILL don't go.",
  "Your mind must be stronger than your feelings.",
  "People who train every day don't want to train every day. They're not motivated. They're disciplined.",
  "The temporary satisfaction of quitting is outweighed by the eternal suffering of being nobody.",
  "You're going to have to work when you don't feel like working. That's how it's going to have to be.",
  "Discipline is not a punishment. It's self-mastery.",
  "Reject weakness in any form.",
  "No one is coming to save you. Your life is 100% your responsibility.",
  "You are your habits. Do you want to be a loser or a winner? Decide.",
  "Don't compete. Dominate.",
  "Every action you take is molding who you are as a person.",
  "Do the impossible and you'll never doubt yourself ever again.",
  "High-energy people win.",
];

/** Returns a quote that's consistent within a calendar day but rotates daily. */
export function getQuoteOfTheDay(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

export function getSessionComment(
  exerciseCount: number,
  totalSets: number,
  totalVolume: number,
  durationMins: number,
  newPRsCount: number
): string {
  if (newPRsCount >= 3) {
    return `${newPRsCount} PRs in one session. Days like this are why you show up.`;
  }
  if (newPRsCount > 0) {
    return `New PR today. Remember this feeling — chase it next session.`;
  }
  if (totalSets >= 25) {
    return `${totalSets} sets. Heavy day. Eat and sleep. Recovery is part of the work.`;
  }
  if (durationMins > 0 && durationMins <= 40) {
    return `Done in ${durationMins} minutes. Efficient. Every minute in the gym should count.`;
  }
  if (totalVolume >= 15000) {
    return `${(totalVolume / 1000).toFixed(1)}t moved today. That's a serious session.`;
  }
  if (totalVolume >= 8000) {
    return `${Math.round(totalVolume / 1000)}t of work done. Solid. Come back and beat it.`;
  }
  if (exerciseCount >= 6) {
    return `${exerciseCount} exercises, ${totalSets} sets. Full session. Logged and counted.`;
  }
  return `${totalSets} sets done. Session logged. Progress is compounding.`;
}

// Also exclude warm-up sets from suggestion calculations
function allRepsHitWorkingSets(exercise: ExerciseLog, targetReps: number = 8): boolean {
  const working = exercise.sets.filter((s) => s.completed && !s.warmUp);
  if (working.length === 0) return false;
  return working.every((s) => s.reps >= targetReps);
}

function getTopWeightWorkingSets(exercise: ExerciseLog): number {
  const working = exercise.sets.filter((s) => s.completed && !s.warmUp && s.weight > 0);
  if (working.length === 0) return 0;
  return Math.max(...working.map((s) => s.weight));
}

// ─── Quick Log Parser ─────────────────────────────────────────────────────────

const EXERCISE_ALIASES: Record<string, string> = {
  bench: 'Bench Press',
  'bench press': 'Bench Press',
  incline: 'Incline Bench Press',
  'incline bench': 'Incline Bench Press',
  decline: 'Decline Bench Press',
  squat: 'Barbell Back Squat',
  'back squat': 'Barbell Back Squat',
  deadlift: 'Conventional Deadlift',
  dl: 'Conventional Deadlift',
  rdl: 'Romanian Deadlift',
  'romanian deadlift': 'Romanian Deadlift',
  sumo: 'Sumo Deadlift',
  ohp: 'Overhead Press',
  'overhead press': 'Overhead Press',
  'shoulder press': 'Overhead Press',
  'push press': 'Push Press',
  row: 'Barbell Row',
  'barbell row': 'Barbell Row',
  pullup: 'Pull-Up',
  'pull up': 'Pull-Up',
  'pull-up': 'Pull-Up',
  chinup: 'Chin-Up',
  'chin up': 'Chin-Up',
  dips: 'Dips',
  dip: 'Dips',
  'hip thrust': 'Hip Thrust',
  'bulgarian split squat': 'Bulgarian Split Squat',
  bss: 'Bulgarian Split Squat',
  'leg press': 'Leg Press',
  'hack squat': 'Hack Squat',
  curl: 'Bicep Curl',
  curls: 'Bicep Curl',
  'bicep curl': 'Bicep Curl',
  'hammer curl': 'Hammer Curl',
  hammer: 'Hammer Curl',
  'preacher curl': 'Preacher Curl',
  preacher: 'Preacher Curl',
  pushdown: 'Tricep Pushdown',
  'tricep pushdown': 'Tricep Pushdown',
  'skull crusher': 'Skull Crusher',
  skulls: 'Skull Crusher',
  'lateral raise': 'Lateral Raise',
  laterals: 'Lateral Raise',
  'lat pulldown': 'Lat Pulldown',
  pulldown: 'Lat Pulldown',
  'cable row': 'Seated Cable Row',
  'face pull': 'Face Pull',
  'leg curl': 'Leg Curl',
  'leg extension': 'Leg Extension',
  'calf raise': 'Calf Raise',
  calves: 'Calf Raise',
  shrug: 'Shrug',
  'arnold press': 'Arnold Press',
  arnold: 'Arnold Press',
  bp: 'Bench Press',
  sq: 'Barbell Back Squat',
  press: 'Bench Press',
  lunge: 'Lunge',
  lunges: 'Lunge',
  plank: 'Plank',
  'chest fly': 'Cable Fly',
  fly: 'Cable Fly',
  flies: 'Cable Fly',
  flyes: 'Cable Fly',
  cable: 'Cable Row',
  pullover: 'Cable Pullover',
  dumbbell: 'Dumbbell Press',
};

export interface QuickLogResult {
  exerciseName: string;
  weight: number;
  sets: number;
  reps: number;
}

/** Find the best (longest) matching exercise alias anywhere in lowercased text. */
function findExerciseInText(lower: string): { name: string; key: string } | null {
  let best: { name: string; key: string; len: number } | null = null;
  for (const [key, name] of Object.entries(EXERCISE_ALIASES)) {
    if (lower.includes(key)) {
      if (!best || key.length > best.len) {
        best = { name, key, len: key.length };
      }
    }
  }
  return best ? { name: best.name, key: best.key } : null;
}

/** Parse one segment of text into a single log entry. */
function parseSingleEntry(
  text: string,
  fallbackExercise: string | null = null,
  fallbackWeight: number | null = null,
  fallbackReps: number | null = null
): QuickLogResult | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;

  let working = lower;
  let taggedWeight: number | null = null;
  let taggedReps: number | null = null;
  let sets = 1;

  // 1. NxN multi-set: "4x8" or "4×8"
  const sxrMatch = working.match(/\b(\d+)\s*[x×]\s*(\d+)\b/);
  if (sxrMatch) {
    sets = parseInt(sxrMatch[1], 10);
    taggedReps = parseInt(sxrMatch[2], 10);
    working = working.replace(sxrMatch[0], ' ');
  }

  // 2. Explicit kg weight: "80kg" or "80 kg"
  const kgMatch = working.match(/\b(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kgMatch) {
    taggedWeight = parseFloat(kgMatch[1]);
    working = working.replace(kgMatch[0], ' ');
  }

  // 3. Explicit reps: "8 reps", "for 8", "reps each", "each" as qualifier
  if (!taggedReps) {
    const repsMatch =
      working.match(/\b(\d+)\s*reps?\b/i) ||
      working.match(/\bfor\s+(\d+)\b/i);
    if (repsMatch) {
      taggedReps = parseInt(repsMatch[1], 10);
      working = working.replace(repsMatch[0], ' ');
    }
  }

  // 4. Explicit sets count: "2 sets", "2 more sets", "do 3 sets" (only if no NxN already)
  if (!sxrMatch) {
    const setsMatch = working.match(/\b(\d+)\s+(?:more\s+)?sets?\b/i);
    if (setsMatch) {
      const n = parseInt(setsMatch[1], 10);
      if (n >= 1 && n <= 20) {
        sets = n;
        working = working.replace(setsMatch[0], ' ');
      }
    }
  }

  // 5. Find exercise (search original text for best alias match)
  let exercise =
    findExerciseInText(lower) ??
    (fallbackExercise ? { name: fallbackExercise, key: '' } : null);

  // If no known exercise found, try to extract a name from the text (unknown = custom)
  if (!exercise) {
    const stripped = lower
      .replace(/\b\d+(?:\.\d+)?\s*kg\b/gi, '')
      .replace(/\b\d+\s*[x×]\s*\d+\b/gi, '')
      .replace(/\b\d+\s*reps?\b/gi, '')
      .replace(/\b\d+\s+sets?\b/gi, '')
      .replace(/\bfor\b/gi, '')
      .replace(/\bi\s+(did|do|have|hit)\b/gi, '')
      .replace(/\b\d+\b/g, '')
      .trim()
      .replace(/\s+/g, ' ');
    if (stripped.length >= 2) {
      const capitalized = stripped.replace(/\b\w/g, (c) => c.toUpperCase());
      exercise = { name: capitalized, key: stripped };
    } else {
      return null;
    }
  }

  // Remove exercise key from working text
  if (exercise.key) {
    const escaped = exercise.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    working = working.replace(new RegExp(escaped, 'gi'), ' ');
  }

  // 6. Extract remaining numbers
  const nums = [...working.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));

  // 7. Assign weight and reps
  let weight = taggedWeight;
  let reps = taggedReps;

  if (weight === null && reps === null) {
    if (nums.length >= 2) {
      const [a, b] = [nums[0], nums[1]];
      if (a > 30 && b <= 30) { weight = a; reps = b; }
      else if (b > 30 && a <= 30) { weight = b; reps = a; }
      else { weight = a; reps = b; }
    } else {
      return null;
    }
  } else if (weight === null && nums.length >= 1) {
    weight = nums[0];
  } else if (reps === null && nums.length >= 1) {
    reps = nums[0];
  }

  // ── Quick-log memory ──────────────────────────────────────────────────────
  // "same weight but 7 reps" / "same" / "7 reps" (no weight given) all use
  // the last-logged weight for this exercise so the user never has to repeat it.
  const hasSame = /\bsame\b/i.test(lower);
  if (weight === null && fallbackWeight !== null) {
    // Use fallback when: "same" keyword present, OR reps were given but no weight
    if (hasSame || (reps !== null && nums.length === 0)) {
      weight = fallbackWeight;
    }
  }
  // Use fallback reps when "same" implies repeating the last set entirely
  if (reps === null && fallbackReps !== null && hasSame) {
    reps = fallbackReps;
  }

  if (weight === null || reps === null) return null;
  if (weight < 0 || weight > 1000) return null;
  if (reps <= 0 || reps > 100) return null;
  if (sets <= 0 || sets > 20) return null;

  return { exerciseName: exercise.name, weight, sets, reps };
}

/** Split a multi-entry message into individual segments on ", then" / "then" / ";" */
function splitEntries(text: string): string[] {
  return text
    .split(/,\s*then\s+|\s+then\s+|;\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse natural language workout log text into one or more set entries.
 * Pass `contextExercise` (the last logged exercise) as a fallback when
 * the text doesn't name an exercise — e.g. "2 more sets of 40kg 10 reps".
 */
export function parseQuickLog(
  text: string,
  contextExercise: string | null = null,
  contextWeight: number | null = null,
  contextReps: number | null = null
): QuickLogResult[] | null {
  const entries = splitEntries(text.trim());
  const results: QuickLogResult[] = [];
  let lastExercise: string | null = contextExercise;
  let lastWeight: number | null = contextWeight;
  let lastReps: number | null = contextReps;

  for (const entry of entries) {
    const parsed = parseSingleEntry(entry, lastExercise, lastWeight, lastReps);
    if (parsed) {
      results.push(parsed);
      lastExercise = parsed.exerciseName;
      lastWeight = parsed.weight;
      lastReps = parsed.reps;
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * When the parser can't produce a full result, determine the specific
 * missing piece so the caller can ask a targeted question.
 */
export function getMissingPieceQuestion(
  text: string,
  contextExercise: string | null
): string {
  const lower = text.trim().toLowerCase();
  const hasExercise =
    findExerciseInText(lower) !== null || contextExercise !== null;
  const hasKg = /\b\d+(?:\.\d+)?\s*kg\b/i.test(lower);
  const hasRepsWord = /\b\d+\s*reps?\b/i.test(lower);
  // Any number > 20 is likely a weight; any ≤ 30 could be reps
  const numbers = [...lower.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => parseFloat(m[1]));
  const likelyHasWeight = hasKg || numbers.some((n) => n > 20);
  const likelyHasReps = hasRepsWord || numbers.some((n) => n > 0 && n <= 30);

  if (!hasExercise) return 'Which exercise?';
  if (!likelyHasWeight) return 'What weight did you use?';
  if (!likelyHasReps) return 'How many reps?';
  return 'What weight did you use?'; // last resort — something was ambiguous
}
