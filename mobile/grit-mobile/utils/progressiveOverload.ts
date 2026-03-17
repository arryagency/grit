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
  const lastWeight = getTopWeight(last);

  // No completed sets with real weight — can't suggest anything meaningful
  if (lastWeight === 0) return null;

  const lastHit = allRepsHit(last);

  if (history.length >= 3) {
    const w0 = getTopWeight(history[0]);
    const w1 = getTopWeight(history[1]);
    const w2 = getTopWeight(history[2]);
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
    const prevWeight = getTopWeight(prev);
    const prevHit = prevWeight > 0 && allRepsHit(prev);

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
}

export function parseQuickLog(text: string): QuickLogResult | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  // Last part must be NxN (e.g., "4x8" or "3x5")
  const last = parts[parts.length - 1].toLowerCase();
  const sxrMatch = last.match(/^(\d+)x(\d+)$/);
  if (!sxrMatch) return null;

  const sets = parseInt(sxrMatch[1]);
  const reps = parseInt(sxrMatch[2]);
  if (sets <= 0 || sets > 20 || reps <= 0 || reps > 100) return null;

  // Second-to-last is weight
  const weightStr = parts[parts.length - 2];
  const weight = parseFloat(weightStr);
  if (isNaN(weight) || weight < 0 || weight > 1000) return null;

  // Everything before weight is the exercise name
  const exerciseInput = parts.slice(0, parts.length - 2).join(' ').toLowerCase().trim();
  if (!exerciseInput) return null;

  const exerciseName = resolveExerciseName(exerciseInput);
  if (!exerciseName) return null;

  return { exerciseName, weight, sets, reps };
}

function resolveExerciseName(input: string): string | null {
  // Direct alias map lookup
  if (EXERCISE_ALIASES[input]) return EXERCISE_ALIASES[input];

  // Partial alias match
  for (const [key, name] of Object.entries(EXERCISE_ALIASES)) {
    if (input.includes(key) || key.includes(input)) return name;
  }

  return null;
}
