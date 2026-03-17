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
  "Stop waiting to feel ready. You won't.",
  "The version of you that makes excuses and the version that doesn't — same amount of time in the day.",
  "Comfort is the enemy of every goal you've ever set.",
  "You don't rise to the level of your motivation. You fall to the level of your habits.",
  "Nobody remembers the days you didn't train.",
  "The work doesn't care how you feel about it.",
  "Every time you skip, you're voting for the person you don't want to be.",
  "Discipline is just doing the thing even when the reason to skip sounds reasonable.",
  "Your competition trained today. Did you?",
  "The hardest rep is the one where you almost talked yourself out of the gym.",
  "You will never regret a session. You will always regret skipping one.",
  "Motivation is a feeling. Showing up is a decision.",
  "One day you'll wish you'd started sooner. Today is that day.",
  "You don't need a perfect plan. You need to not quit.",
  "The body keeps the score. So does the log.",
  "Soreness is just your body confirming you did something.",
  "There is no version of the body you want that doesn't involve this part.",
  "Stop negotiating with yourself. You already know what to do.",
  "The excuses you make today are the ceiling you set for tomorrow.",
  "Small weights, consistent effort, over years — that's the whole secret.",
  "You can be sore tomorrow or regret it forever. Pick one.",
  "Hard is temporary. Skipping makes it permanent.",
  "Nobody got strong by thinking about it.",
  "Progress compounds. So does skipping.",
  "Your future self has an opinion about what you do today.",
  "The gym doesn't get easier. You get harder.",
  "What you do when you don't feel like it is what defines the result.",
  "Tired is not the same as broken. Train anyway.",
  "A bad session beats no session every single time.",
  "You already paid for the gym. The question is whether you're paying yourself back.",
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
};

export interface QuickLogResult {
  exerciseName: string;
  weight: number;
  sets: number;
  reps: number;
  warmUp: boolean;
}

/**
 * Parse flexible natural language set logging.
 *
 * Supported formats:
 *   "bench 80 8"           → 1 set, 80kg, 8 reps
 *   "bench 80kg 8 reps"    → same
 *   "bench 80 for 8"       → same
 *   "bench 80 4x8"         → 4 sets, 80kg, 8 reps
 *   "warm up bench 60 10"  → 1 warm-up set, 60kg, 10 reps
 *   "wu bench 60 10"       → same
 *   "w bench 60 10"        → same
 */
export function parseQuickLog(text: string): QuickLogResult | null {
  let raw = text.trim().toLowerCase();
  if (!raw) return null;

  // ── Detect and strip warm-up prefix ──────────────────────────────────────
  let warmUp = false;
  const warmUpPrefixes = ['warm up ', 'warmup ', 'warm-up ', 'wu ', 'w/u '];
  for (const prefix of warmUpPrefixes) {
    if (raw.startsWith(prefix)) {
      warmUp = true;
      raw = raw.slice(prefix.length).trim();
      break;
    }
  }
  // Single "w " prefix — only treat as warm-up if followed by an exercise word
  if (!warmUp && raw.startsWith('w ')) {
    warmUp = true;
    raw = raw.slice(2).trim();
  }

  // ── Strip filler words ────────────────────────────────────────────────────
  // "bench 80 for 8 reps" → remove "for" and "reps"
  raw = raw.replace(/\bfor\b/g, '').replace(/\breps?\b/g, '').replace(/\bkg\b/g, '').replace(/\s+/g, ' ').trim();

  const parts = raw.split(/\s+/);
  if (parts.length < 2) return null;

  // ── Try NxN multi-set format first ────────────────────────────────────────
  // e.g. "bench 80 4x8"
  const lastPart = parts[parts.length - 1];
  const sxrMatch = lastPart.match(/^(\d+)x(\d+)$/);
  if (sxrMatch) {
    const sets = parseInt(sxrMatch[1]);
    const reps = parseInt(sxrMatch[2]);
    if (sets <= 0 || sets > 20 || reps <= 0 || reps > 100) return null;

    const weightStr = parts[parts.length - 2];
    const weight = parseFloat(weightStr);
    if (isNaN(weight) || weight < 0 || weight > 1000) return null;

    const exerciseInput = parts.slice(0, parts.length - 2).join(' ').trim();
    if (!exerciseInput) return null;
    const exerciseName = resolveExerciseName(exerciseInput);
    if (!exerciseName) return null;

    return { exerciseName, weight, sets, reps, warmUp };
  }

  // ── Single-set format: exercise weight reps ───────────────────────────────
  // Last token is reps, second-to-last is weight, rest is exercise
  if (parts.length >= 3) {
    const reps = parseInt(parts[parts.length - 1]);
    const weight = parseFloat(parts[parts.length - 2]);

    if (!isNaN(reps) && reps > 0 && reps <= 100 && !isNaN(weight) && weight >= 0 && weight <= 1000) {
      const exerciseInput = parts.slice(0, parts.length - 2).join(' ').trim();
      if (exerciseInput) {
        const exerciseName = resolveExerciseName(exerciseInput);
        if (exerciseName) return { exerciseName, weight, sets: 1, reps, warmUp };
      }
    }
  }

  return null;
}

function resolveExerciseName(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (EXERCISE_ALIASES[lower]) return EXERCISE_ALIASES[lower];

  // Partial key contains input or vice versa
  for (const [key, name] of Object.entries(EXERCISE_ALIASES)) {
    if (lower === key) return name;
    if (lower.includes(key) || key.includes(lower)) return name;
  }

  return null;
}
