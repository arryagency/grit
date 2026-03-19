export const COMPOUND_EXERCISES = [
  'Barbell Back Squat',
  'Barbell Front Squat',
  'Conventional Deadlift',
  'Romanian Deadlift',
  'Sumo Deadlift',
  'Bench Press',
  'Incline Bench Press',
  'Decline Bench Press',
  'Overhead Press',
  'Push Press',
  'Barbell Row',
  'Pendlay Row',
  'Pull-Up',
  'Chin-Up',
  'Dips',
  'Hip Thrust',
  'Bulgarian Split Squat',
  'Hack Squat',
  'Leg Press',
  'Good Morning',
];

export const ISOLATION_EXERCISES = [
  'Bicep Curl',
  'Hammer Curl',
  'Preacher Curl',
  'Tricep Pushdown',
  'Skull Crusher',
  'Tricep Overhead Extension',
  'Lateral Raise',
  'Front Raise',
  'Face Pull',
  'Cable Fly',
  'Pec Deck',
  'Leg Curl',
  'Leg Extension',
  'Calf Raise',
  'Seated Calf Raise',
  'Lat Pulldown',
  'Seated Cable Row',
  'Single Arm Row',
  'Incline Dumbbell Curl',
  'Concentration Curl',
  'Dumbbell Fly',
  'Cable Crossover',
  'Chest Dip',
  'Shrug',
  'Upright Row',
  'Arnold Press',
  'Dumbbell Shoulder Press',
  'Rear Delt Fly',
  'Glute Kickback',
  'Hip Abduction',
  'Crunch',
  'Cable Crunch',
  'Plank',
  'Russian Twist',
  'Leg Raise',
];

export const ALL_EXERCISES = [...COMPOUND_EXERCISES, ...ISOLATION_EXERCISES].sort();

export const COMPOUND_NAMES = new Set(COMPOUND_EXERCISES.map((e) => e.toLowerCase()));

export function isCompound(exerciseName: string): boolean {
  return COMPOUND_NAMES.has(exerciseName.toLowerCase());
}

// Key lifts tracked on progress screen
export const KEY_LIFTS = [
  { name: 'Squat', aliases: ['barbell back squat', 'squat', 'back squat', 'barbell squat'] },
  { name: 'Bench Press', aliases: ['bench press', 'bench', 'barbell bench'] },
  { name: 'Deadlift', aliases: ['conventional deadlift', 'deadlift', 'sumo deadlift'] },
];

export function matchKeyLift(exerciseName: string): string | null {
  const lower = exerciseName.toLowerCase();
  for (const lift of KEY_LIFTS) {
    if (lift.aliases.some((a) => lower.includes(a) || a.includes(lower))) {
      return lift.name;
    }
  }
  return null;
}
