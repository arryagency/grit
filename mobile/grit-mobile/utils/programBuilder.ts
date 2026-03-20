export type Goal = 'muscle' | 'strength' | 'fat-loss' | 'fitness';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type TrainingDays = 2 | 3 | 4 | 5 | 6;
export type Gender = 'male' | 'female';

export interface ProgramInput {
  goal: Goal;
  experience: Experience;
  daysPerWeek: TrainingDays;
  trainingDays?: number[]; // specific days 0=Sun...6=Sat; overrides template default
  gender: Gender;
  equipment?: string; // e.g. 'Bodyweight only'
}

export interface ProgramExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  muscleGroup: string;
}

export interface ProgramSession {
  label: string;
  shortLabel: string;
  exercises: ProgramExercise[];
}

export interface ScheduleDay {
  dayName: string;
  sessionLabel: string | null;
  sessionShort: string | null;
  isRest: boolean;
}

export interface Program {
  title: string;
  splitName: string;
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  gender: Gender;
  rationale: string;
  schedule: ScheduleDay[]; // 7 items, Mon–Sun
  trainingDayIndices: number[]; // 1=Mon … 6=Sat (0=Sun never used)
  sessions: ProgramSession[];
  progression: string;
  deload: string;
  fatLossNote?: string;
  keyNote: string;
  stats: {
    sessionsPerWeek: number;
    estimatedDuration: string;
    muscleGroups: string[];
  };
}

// ─── Muscle Group Map ────────────────────────────────────────────────

const MUSCLE: Record<string, string> = {
  'Barbell Back Squat': 'QUADS',
  'Sumo Squat': 'QUADS',
  'Dumbbell Chest Press': 'CHEST',
  'Cable Kickback': 'GLUTES',
  'Bench Press': 'CHEST',
  'Barbell Row': 'BACK',
  'Overhead Press': 'SHOULDERS',
  'Romanian Deadlift': 'HAMSTRINGS',
  'Plank': 'CORE',
  'Deadlift': 'BACK',
  'Incline Dumbbell Press': 'CHEST',
  'Incline Bench Press': 'CHEST',
  'Lat Pulldown': 'BACK',
  'Dumbbell Shoulder Press': 'SHOULDERS',
  'Leg Press': 'QUADS',
  'Cable Row': 'BACK',
  'Pull-Up': 'BACK',
  'Weighted Pull-Up': 'BACK',
  'Face Pull': 'REAR DELT',
  'Hammer Curl': 'BICEPS',
  'Dumbbell Curl': 'BICEPS',
  'Bicep Curl': 'BICEPS',
  'Concentration Curl': 'BICEPS',
  'Preacher Curl': 'BICEPS',
  'Tricep Pushdown': 'TRICEPS',
  'Overhead Tricep Extension': 'TRICEPS',
  'Skull Crusher': 'TRICEPS',
  'Tricep Dip': 'TRICEPS',
  'Lateral Raise': 'SHOULDERS',
  'Cable Lateral Raise': 'SHOULDERS',
  'Leg Curl': 'HAMSTRINGS',
  'Leg Extension': 'QUADS',
  'Calf Raise': 'CALVES',
  'Hip Thrust': 'GLUTES',
  'Bulgarian Split Squat': 'QUADS',
  'Hack Squat': 'QUADS',
  'Cable Pullover': 'BACK',
  'Cable Fly': 'CHEST',
  'Reverse Fly': 'REAR DELT',
  'Glute Bridge': 'GLUTES',
  'Push-Up': 'CHEST',
  'Wide Push-Up': 'CHEST',
  'Pike Push-Up': 'SHOULDERS',
  'Dip': 'TRICEPS',
  'Inverted Row': 'BACK',
  'Bodyweight Squat': 'QUADS',
  'Jump Squat': 'QUADS',
  'Lunge': 'QUADS',
  'Nordic Curl': 'HAMSTRINGS',
  'Mountain Climber': 'CORE',
  'Superman Hold': 'BACK',
};

function getMuscleGroup(name: string): string {
  return MUSCLE[name] ?? 'FULL BODY';
}

// ─── Internal Exercise Type ──────────────────────────────────────────

interface Ex {
  name: string;
  sets: number;
  reps: string;
  compound: boolean;
  mainLift?: boolean;
}

interface Session {
  label: string;
  exercises: Ex[];
}

// ─── Rep / Rest Helpers ──────────────────────────────────────────────

function shiftRepsBase(reps: string, n: number): string {
  if (reps.includes('-')) {
    const [lo, hi] = reps.split('-').map(Number);
    return `${lo + n}-${hi + n}`;
  }
  const v = parseInt(reps);
  return isNaN(v) ? reps : `${v + n}`;
}

function shiftReps(reps: string, n: number): string {
  if (reps.includes('sec')) return reps;
  if (reps.includes(' each')) return shiftRepsBase(reps.replace(' each', ''), n) + ' each';
  return shiftRepsBase(reps, n);
}

function calcReps(ex: Ex, goal: Goal, female: boolean): string {
  let reps = ex.reps;
  if (!reps.includes('sec')) {
    if (goal === 'strength') {
      reps = ex.mainLift ? '3-6' : ex.compound ? '6-10' : '8-12';
    } else if (goal === 'fitness') {
      reps = shiftReps(reps, 2);
    }
    if (female) reps = shiftReps(reps, 2);
  }
  return reps;
}

function calcRest(ex: Ex, goal: Goal, female: boolean): string {
  let rest: string;
  if (goal === 'strength') {
    rest = ex.compound ? '3-5 min' : '2 min';
  } else if (goal === 'fitness') {
    rest = '90-120 sec';
  } else {
    rest = ex.compound ? '2-3 min' : '60-90 sec';
  }
  if (female) {
    const map: Record<string, string> = {
      '3-5 min': '2-3 min',
      '2-3 min': '90 sec',
      '2 min': '90 sec',
      '60-90 sec': '45-60 sec',
      '90-120 sec': '60-90 sec',
    };
    rest = map[rest] ?? rest;
  }
  return rest;
}

// ─── Session Data ────────────────────────────────────────────────────

const BEG_FB_A: Session = { label: 'Full Body A', exercises: [
  { name: 'Barbell Back Squat',     sets: 3, reps: '5-8',   compound: true,  mainLift: true },
  { name: 'Bench Press',            sets: 3, reps: '5-8',   compound: true,  mainLift: true },
  { name: 'Barbell Row',            sets: 3, reps: '5-8',   compound: true,  mainLift: true },
  { name: 'Overhead Press',         sets: 3, reps: '5-8',   compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 2, reps: '8-10',  compound: true  },
  { name: 'Plank',                  sets: 3, reps: '30-45 sec', compound: false },
]};

const BEG_FB_B: Session = { label: 'Full Body B', exercises: [
  { name: 'Deadlift',               sets: 3, reps: '5',     compound: true,  mainLift: true },
  { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10',  compound: true  },
  { name: 'Lat Pulldown',           sets: 3, reps: '8-10',  compound: true  },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '8-10',  compound: true  },
  { name: 'Leg Press',              sets: 3, reps: '8-10',  compound: true  },
  { name: 'Cable Row',              sets: 3, reps: '8-10',  compound: false },
]};

const INT_FB_A: Session = { label: 'Full Body A', exercises: [
  { name: 'Barbell Back Squat',     sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Bench Press',            sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Barbell Row',            sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Overhead Press',         sets: 3, reps: '6-8',   compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 3, reps: '8-10',  compound: true  },
  { name: 'Pull-Up',                sets: 3, reps: '6-10',  compound: true  },
  { name: 'Lateral Raise',          sets: 3, reps: '15-20', compound: false },
]};

const INT_FB_B: Session = { label: 'Full Body B', exercises: [
  { name: 'Deadlift',               sets: 4, reps: '4-5',   compound: true,  mainLift: true },
  { name: 'Incline Bench Press',    sets: 4, reps: '8-10',  compound: true  },
  { name: 'Lat Pulldown',           sets: 4, reps: '8-10',  compound: true  },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '10-12', compound: true  },
  { name: 'Leg Press',              sets: 4, reps: '8-10',  compound: true  },
  { name: 'Hip Thrust',             sets: 3, reps: '10-12', compound: true  },
  { name: 'Cable Row',              sets: 3, reps: '12-15', compound: false },
  { name: 'Face Pull',              sets: 3, reps: '15-20', compound: false },
]};

const BEG_UA: Session = { label: 'Upper A', exercises: [
  { name: 'Bench Press',            sets: 4, reps: '5',     compound: true,  mainLift: true },
  { name: 'Barbell Row',            sets: 4, reps: '5',     compound: true,  mainLift: true },
  { name: 'Overhead Press',         sets: 3, reps: '5-8',   compound: true,  mainLift: true },
  { name: 'Lat Pulldown',           sets: 3, reps: '8-10',  compound: true  },
  { name: 'Dumbbell Curl',          sets: 2, reps: '10-12', compound: false },
  { name: 'Tricep Pushdown',        sets: 2, reps: '10-12', compound: false },
]};

const BEG_LA: Session = { label: 'Lower A', exercises: [
  { name: 'Barbell Back Squat',     sets: 4, reps: '5',     compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 3, reps: '8-10',  compound: true  },
  { name: 'Leg Press',              sets: 3, reps: '10',    compound: true  },
  { name: 'Leg Curl',               sets: 3, reps: '10-12', compound: false },
  { name: 'Calf Raise',             sets: 4, reps: '12-15', compound: false },
]};

const BEG_UB: Session = { label: 'Upper B', exercises: [
  { name: 'Incline Dumbbell Press', sets: 3, reps: '8-12',  compound: true  },
  { name: 'Cable Row',              sets: 3, reps: '10-12', compound: false },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '10-12', compound: true  },
  { name: 'Pull-Up',                sets: 3, reps: '8-12',  compound: true  },
  { name: 'Face Pull',              sets: 3, reps: '15',    compound: false },
  { name: 'Hammer Curl',            sets: 2, reps: '12',    compound: false },
]};

const BEG_LB: Session = { label: 'Lower B', exercises: [
  { name: 'Deadlift',               sets: 3, reps: '5',     compound: true,  mainLift: true },
  { name: 'Leg Press',              sets: 4, reps: '10-12', compound: true  },
  { name: 'Bulgarian Split Squat',  sets: 3, reps: '10 each', compound: true },
  { name: 'Leg Extension',          sets: 3, reps: '12-15', compound: false },
  { name: 'Leg Curl',               sets: 3, reps: '12-15', compound: false },
]};

const INT_UA: Session = { label: 'Upper A', exercises: [
  { name: 'Bench Press',            sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Barbell Row',            sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Overhead Press',         sets: 3, reps: '6-8',   compound: true,  mainLift: true },
  { name: 'Weighted Pull-Up',       sets: 3, reps: '6-8',   compound: true  },
  { name: 'Lateral Raise',          sets: 3, reps: '15-20', compound: false },
  { name: 'Tricep Dip',             sets: 3, reps: '8-10',  compound: false },
]};

const INT_LA: Session = { label: 'Lower A', exercises: [
  { name: 'Barbell Back Squat',     sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 4, reps: '6-8',   compound: true  },
  { name: 'Hack Squat',             sets: 3, reps: '8-10',  compound: true  },
  { name: 'Leg Curl',               sets: 3, reps: '10-12', compound: false },
  { name: 'Calf Raise',             sets: 4, reps: '10-12', compound: false },
]};

const INT_UB: Session = { label: 'Upper B', exercises: [
  { name: 'Incline Bench Press',    sets: 4, reps: '8-12',  compound: true  },
  { name: 'Cable Row',              sets: 4, reps: '10-12', compound: false },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '10-12', compound: true  },
  { name: 'Cable Pullover',         sets: 3, reps: '12-15', compound: false },
  { name: 'Cable Lateral Raise',    sets: 4, reps: '15-20', compound: false },
  { name: 'Bicep Curl',             sets: 3, reps: '12-15', compound: false },
  { name: 'Skull Crusher',          sets: 3, reps: '12-15', compound: false },
]};

const INT_LB: Session = { label: 'Lower B', exercises: [
  { name: 'Leg Press',              sets: 4, reps: '10-15', compound: true  },
  { name: 'Bulgarian Split Squat',  sets: 4, reps: '10-12 each', compound: true },
  { name: 'Hip Thrust',             sets: 4, reps: '10-12', compound: true  },
  { name: 'Leg Extension',          sets: 3, reps: '15-20', compound: false },
  { name: 'Leg Curl',               sets: 3, reps: '12-15', compound: false },
  { name: 'Calf Raise',             sets: 4, reps: '15-20', compound: false },
]};

const INT_PUSH: Session = { label: 'Push', exercises: [
  { name: 'Bench Press',            sets: 4, reps: '6-10',  compound: true,  mainLift: true },
  { name: 'Overhead Press',         sets: 3, reps: '8-12',  compound: true,  mainLift: true },
  { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', compound: true  },
  { name: 'Cable Lateral Raise',    sets: 4, reps: '15-20', compound: false },
  { name: 'Tricep Pushdown',        sets: 3, reps: '12-15', compound: false },
  { name: 'Overhead Tricep Extension', sets: 3, reps: '12-15', compound: false },
]};

const INT_PULL: Session = { label: 'Pull', exercises: [
  { name: 'Barbell Row',            sets: 4, reps: '6-10',  compound: true,  mainLift: true },
  { name: 'Pull-Up',                sets: 4, reps: '6-10',  compound: true  },
  { name: 'Face Pull',              sets: 3, reps: '15-20', compound: false },
  { name: 'Cable Row',              sets: 3, reps: '12-15', compound: false },
  { name: 'Bicep Curl',             sets: 4, reps: '12-15', compound: false },
  { name: 'Hammer Curl',            sets: 3, reps: '12-15', compound: false },
]};

const INT_LEGS_5: Session = { label: 'Legs', exercises: [
  { name: 'Barbell Back Squat',     sets: 4, reps: '6-10',  compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 4, reps: '8-12',  compound: true  },
  { name: 'Leg Press',              sets: 3, reps: '10-15', compound: true  },
  { name: 'Leg Curl',               sets: 3, reps: '12-15', compound: false },
  { name: 'Leg Extension',          sets: 3, reps: '15-20', compound: false },
  { name: 'Calf Raise',             sets: 4, reps: '15-20', compound: false },
]};

const INT_UPPER_5: Session = { label: 'Upper', exercises: [
  { name: 'Incline Bench Press',    sets: 4, reps: '8-12',  compound: true  },
  { name: 'Weighted Pull-Up',       sets: 4, reps: '6-10',  compound: true  },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '10-12', compound: true  },
  { name: 'Cable Row',              sets: 3, reps: '12-15', compound: false },
  { name: 'Lateral Raise',          sets: 3, reps: '15-20', compound: false },
  { name: 'Tricep Dip',             sets: 3, reps: '8-12',  compound: false },
]};

const INT_LOWER_5: Session = { label: 'Lower', exercises: [
  { name: 'Deadlift',               sets: 4, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Hack Squat',             sets: 4, reps: '8-12',  compound: true  },
  { name: 'Hip Thrust',             sets: 4, reps: '10-12', compound: true  },
  { name: 'Bulgarian Split Squat',  sets: 3, reps: '10-12 each', compound: true },
  { name: 'Leg Curl',               sets: 3, reps: '12-15', compound: false },
]};

const PPL6_PA: Session = { label: 'Push A', exercises: [
  { name: 'Bench Press',            sets: 5, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Overhead Press',         sets: 4, reps: '6-8',   compound: true,  mainLift: true },
  { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10',  compound: true  },
  { name: 'Lateral Raise',          sets: 4, reps: '15',    compound: false },
  { name: 'Tricep Pushdown',        sets: 3, reps: '10-12', compound: false },
]};

const PPL6_PLA: Session = { label: 'Pull A', exercises: [
  { name: 'Deadlift',               sets: 4, reps: '4-5',   compound: true,  mainLift: true },
  { name: 'Barbell Row',            sets: 4, reps: '5-6',   compound: true,  mainLift: true },
  { name: 'Pull-Up',                sets: 3, reps: '6-8',   compound: true  },
  { name: 'Face Pull',              sets: 3, reps: '15',    compound: false },
  { name: 'Bicep Curl',             sets: 3, reps: '10-12', compound: false },
]};

const PPL6_LA: Session = { label: 'Legs A', exercises: [
  { name: 'Barbell Back Squat',     sets: 5, reps: '4-6',   compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 4, reps: '6-8',   compound: true  },
  { name: 'Leg Press',              sets: 3, reps: '8-10',  compound: true  },
  { name: 'Leg Curl',               sets: 3, reps: '10-12', compound: false },
  { name: 'Calf Raise',             sets: 4, reps: '10-12', compound: false },
]};

const PPL6_PB: Session = { label: 'Push B', exercises: [
  { name: 'Incline Bench Press',    sets: 4, reps: '10-12', compound: true  },
  { name: 'Dumbbell Shoulder Press',sets: 4, reps: '10-12', compound: true  },
  { name: 'Cable Fly',              sets: 3, reps: '15-20', compound: false },
  { name: 'Cable Lateral Raise',    sets: 4, reps: '15-20', compound: false },
  { name: 'Skull Crusher',          sets: 3, reps: '12-15', compound: false },
  { name: 'Overhead Tricep Extension', sets: 3, reps: '12-15', compound: false },
]};

const PPL6_PLB: Session = { label: 'Pull B', exercises: [
  { name: 'Cable Row',              sets: 4, reps: '12-15', compound: false },
  { name: 'Lat Pulldown',           sets: 4, reps: '10-12', compound: true  },
  { name: 'Cable Pullover',         sets: 3, reps: '12-15', compound: false },
  { name: 'Reverse Fly',            sets: 3, reps: '15-20', compound: false },
  { name: 'Hammer Curl',            sets: 4, reps: '12-15', compound: false },
  { name: 'Concentration Curl',     sets: 3, reps: '15',    compound: false },
]};

const PPL6_LB: Session = { label: 'Legs B', exercises: [
  { name: 'Hack Squat',             sets: 4, reps: '10-12', compound: true  },
  { name: 'Hip Thrust',             sets: 4, reps: '12-15', compound: true  },
  { name: 'Bulgarian Split Squat',  sets: 4, reps: '10-12 each', compound: true },
  { name: 'Leg Extension',          sets: 4, reps: '15-20', compound: false },
  { name: 'Leg Curl',               sets: 4, reps: '12-15', compound: false },
  { name: 'Calf Raise',             sets: 5, reps: '15-20', compound: false },
]};

// ─── Bodyweight Sessions ──────────────────────────────────────────────

const BW_FB_A: Session = { label: 'Full Body A', exercises: [
  { name: 'Bodyweight Squat',   sets: 3, reps: '15-20', compound: true,  mainLift: true },
  { name: 'Push-Up',            sets: 3, reps: '8-15',  compound: true,  mainLift: true },
  { name: 'Pull-Up',            sets: 3, reps: '5-10',  compound: true,  mainLift: true },
  { name: 'Pike Push-Up',       sets: 3, reps: '8-12',  compound: true  },
  { name: 'Lunge',              sets: 2, reps: '12 each', compound: true },
  { name: 'Plank',              sets: 3, reps: '30-45 sec', compound: false },
]};

const BW_FB_B: Session = { label: 'Full Body B', exercises: [
  { name: 'Bulgarian Split Squat', sets: 3, reps: '10-12 each', compound: true, mainLift: true },
  { name: 'Wide Push-Up',       sets: 3, reps: '10-15', compound: true  },
  { name: 'Inverted Row',       sets: 3, reps: '8-12',  compound: true  },
  { name: 'Dip',                sets: 3, reps: '8-12',  compound: true  },
  { name: 'Glute Bridge',       sets: 3, reps: '15-20', compound: false },
  { name: 'Mountain Climber',   sets: 3, reps: '20-30 each', compound: false },
]};

const BW_UA: Session = { label: 'Upper A', exercises: [
  { name: 'Push-Up',            sets: 4, reps: '10-15', compound: true,  mainLift: true },
  { name: 'Pull-Up',            sets: 4, reps: '5-10',  compound: true,  mainLift: true },
  { name: 'Pike Push-Up',       sets: 3, reps: '8-12',  compound: true  },
  { name: 'Inverted Row',       sets: 3, reps: '10-12', compound: true  },
  { name: 'Dip',                sets: 3, reps: '8-12',  compound: false },
]};

const BW_LA: Session = { label: 'Lower A', exercises: [
  { name: 'Bodyweight Squat',   sets: 4, reps: '20-25', compound: true,  mainLift: true },
  { name: 'Lunge',              sets: 3, reps: '12-15 each', compound: true },
  { name: 'Glute Bridge',       sets: 4, reps: '20-25', compound: false },
  { name: 'Nordic Curl',        sets: 3, reps: '5-8',   compound: false },
  { name: 'Calf Raise',         sets: 4, reps: '20-25', compound: false },
]};

const BW_UB: Session = { label: 'Upper B', exercises: [
  { name: 'Wide Push-Up',       sets: 3, reps: '12-15', compound: true  },
  { name: 'Pull-Up',            sets: 3, reps: '6-10',  compound: true  },
  { name: 'Dip',                sets: 3, reps: '10-12', compound: false },
  { name: 'Inverted Row',       sets: 3, reps: '10-12', compound: false },
  { name: 'Pike Push-Up',       sets: 3, reps: '10-12', compound: true  },
  { name: 'Mountain Climber',   sets: 3, reps: '20 each', compound: false },
]};

const BW_LB: Session = { label: 'Lower B', exercises: [
  { name: 'Bulgarian Split Squat', sets: 4, reps: '10-15 each', compound: true, mainLift: true },
  { name: 'Jump Squat',         sets: 3, reps: '10-15', compound: true  },
  { name: 'Lunge',              sets: 3, reps: '12 each', compound: true },
  { name: 'Nordic Curl',        sets: 3, reps: '5-8',   compound: false },
  { name: 'Glute Bridge',       sets: 3, reps: '20-25', compound: false },
]};

// ─── Female Sessions ──────────────────────────────────────────────────

const F_BEG_FB_A: Session = { label: 'Full Body A', exercises: [
  { name: 'Romanian Deadlift',      sets: 3, reps: '8-12',  compound: true,  mainLift: true },
  { name: 'Dumbbell Chest Press',   sets: 3, reps: '10-15', compound: true  },
  { name: 'Cable Row',              sets: 3, reps: '10-12', compound: true  },
  { name: 'Bulgarian Split Squat',  sets: 3, reps: '10-12 each', compound: true },
  { name: 'Hip Thrust',             sets: 3, reps: '12-15', compound: true  },
  { name: 'Plank',                  sets: 3, reps: '30-45 sec', compound: false },
]};

const F_BEG_FB_B: Session = { label: 'Full Body B', exercises: [
  { name: 'Barbell Back Squat',     sets: 3, reps: '10-15', compound: true,  mainLift: true },
  { name: 'Lat Pulldown',           sets: 3, reps: '10-12', compound: true  },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '10-15', compound: true  },
  { name: 'Leg Curl',               sets: 3, reps: '10-12', compound: false },
  { name: 'Glute Bridge',           sets: 3, reps: '15-20', compound: false },
  { name: 'Lateral Raise',          sets: 3, reps: '15-20', compound: false },
]};

const F_INT_LA: Session = { label: 'Lower A', exercises: [
  { name: 'Barbell Back Squat',     sets: 4, reps: '8-12',  compound: true,  mainLift: true },
  { name: 'Romanian Deadlift',      sets: 4, reps: '8-10',  compound: true  },
  { name: 'Bulgarian Split Squat',  sets: 3, reps: '10-12 each', compound: true },
  { name: 'Hip Thrust',             sets: 4, reps: '12-15', compound: true  },
  { name: 'Leg Curl',               sets: 3, reps: '10-12', compound: false },
  { name: 'Calf Raise',             sets: 4, reps: '15-20', compound: false },
]};

const F_INT_LB: Session = { label: 'Lower B', exercises: [
  { name: 'Sumo Squat',             sets: 4, reps: '10-12', compound: true,  mainLift: true },
  { name: 'Glute Bridge',           sets: 4, reps: '15-20', compound: false },
  { name: 'Leg Press',              sets: 3, reps: '10-15', compound: true  },
  { name: 'Leg Extension',          sets: 3, reps: '15-20', compound: false },
  { name: 'Cable Kickback',         sets: 3, reps: '15 each', compound: false },
]};

const F_INT_UA: Session = { label: 'Upper A', exercises: [
  { name: 'Dumbbell Chest Press',   sets: 4, reps: '10-15', compound: true,  mainLift: true },
  { name: 'Cable Row',              sets: 4, reps: '10-12', compound: true  },
  { name: 'Dumbbell Shoulder Press',sets: 3, reps: '12-15', compound: true  },
  { name: 'Lat Pulldown',           sets: 3, reps: '10-12', compound: true  },
  { name: 'Lateral Raise',          sets: 3, reps: '15-20', compound: false },
]};

const F_INT_UB: Session = { label: 'Upper B', exercises: [
  { name: 'Incline Dumbbell Press', sets: 4, reps: '10-15', compound: true  },
  { name: 'Pull-Up',                sets: 4, reps: '8-12',  compound: true  },
  { name: 'Face Pull',              sets: 3, reps: '15-20', compound: false },
  { name: 'Dumbbell Curl',          sets: 3, reps: '12-15', compound: false },
  { name: 'Overhead Tricep Extension', sets: 3, reps: '12-15', compound: false },
]};

function selectFemaleTemplate(days: TrainingDays, exp: Experience): TemplateResult {
  if (days <= 3) {
    return {
      sessions: [F_BEG_FB_A, F_BEG_FB_B],
      split: 'Full Body',
      trainingDayIndices: days === 2 ? [1, 4] : [1, 3, 5],
    };
  }
  if (days === 4) {
    return {
      sessions: [F_INT_UA, F_INT_LA, F_INT_UB, F_INT_LB],
      split: 'Upper / Lower',
      trainingDayIndices: [1, 2, 4, 5],
    };
  }
  if (days === 5) {
    return {
      sessions: [F_INT_UA, F_INT_LA, F_BEG_FB_A, F_INT_UB, F_INT_LB],
      split: 'Upper/Lower + Full Body',
      trainingDayIndices: [1, 2, 3, 4, 5],
    };
  }
  // 6 days
  return {
    sessions: [F_INT_UA, F_INT_LA, F_BEG_FB_A, F_INT_UB, F_INT_LB, F_BEG_FB_B],
    split: 'Upper/Lower ×3',
    trainingDayIndices: [1, 2, 3, 4, 5, 6],
  };
}

function selectBodyweightTemplate(days: TrainingDays): TemplateResult {
  if (days <= 3) {
    return {
      sessions: [BW_FB_A, BW_FB_B],
      split: 'Full Body',
      trainingDayIndices: days === 2 ? [1, 4] : [1, 3, 5],
    };
  }
  if (days === 4) {
    return {
      sessions: [BW_UA, BW_LA, BW_UB, BW_LB],
      split: 'Upper / Lower',
      trainingDayIndices: [1, 2, 4, 5],
    };
  }
  if (days === 5) {
    return {
      sessions: [BW_UA, BW_LA, BW_FB_A, BW_UB, BW_LB],
      split: 'Upper/Lower + Full Body',
      trainingDayIndices: [1, 2, 3, 4, 5],
    };
  }
  // 6 days — alternate full body and upper/lower
  return {
    sessions: [BW_UA, BW_LA, BW_FB_A, BW_UB, BW_LB, BW_FB_B],
    split: 'Upper/Lower ×3',
    trainingDayIndices: [1, 2, 3, 4, 5, 6],
  };
}

// ─── Template Selection ───────────────────────────────────────────────

interface TemplateResult {
  sessions: Session[];
  split: string;
  trainingDayIndices: number[];
}

function selectTemplate(days: TrainingDays, exp: Experience): TemplateResult {
  console.log('[ProgramBuilder] selectTemplate called: days =', days, '| exp =', exp);
  const beginner = exp === 'beginner';

  if (days <= 3) {
    return {
      sessions: beginner ? [BEG_FB_A, BEG_FB_B] : [INT_FB_A, INT_FB_B],
      split: 'Full Body',
      trainingDayIndices:
        days === 2 ? [1, 4] : [1, 3, 5],
    };
  }
  if (days === 4) {
    return {
      sessions: beginner
        ? [BEG_UA, BEG_LA, BEG_UB, BEG_LB]
        : [INT_UA, INT_LA, INT_UB, INT_LB],
      split: 'Upper / Lower',
      trainingDayIndices: [1, 2, 4, 5],
    };
  }
  if (days === 5) {
    if (beginner) {
      return {
        sessions: [BEG_UA, BEG_LA, BEG_FB_A, BEG_UB, BEG_LB],
        split: 'Upper/Lower + Full Body',
        trainingDayIndices: [1, 2, 3, 4, 5],
      };
    }
    return {
      sessions: [INT_PUSH, INT_PULL, INT_LEGS_5, INT_UPPER_5, INT_LOWER_5],
      split: 'PPL + Upper/Lower Hybrid',
      trainingDayIndices: [1, 2, 3, 4, 5],
    };
  }
  return {
    sessions: [PPL6_PA, PPL6_PLA, PPL6_LA, PPL6_PB, PPL6_PLB, PPL6_LB],
    split: 'Push / Pull / Legs ×2',
    trainingDayIndices: [1, 2, 3, 4, 5, 6],
  };
}

// ─── Short Label ─────────────────────────────────────────────────────

function getShortLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith('full body a')) return 'FB-A';
  if (l.startsWith('full body b')) return 'FB-B';
  if (l.startsWith('upper a'))    return 'UPR-A';
  if (l.startsWith('lower a'))    return 'LWR-A';
  if (l.startsWith('upper b'))    return 'UPR-B';
  if (l.startsWith('lower b'))    return 'LWR-B';
  if (l.startsWith('upper'))      return 'UPPER';
  if (l.startsWith('lower'))      return 'LOWER';
  if (l.startsWith('push a'))     return 'PSH-A';
  if (l.startsWith('pull a'))     return 'PLL-A';
  if (l.startsWith('legs a'))     return 'LEG-A';
  if (l.startsWith('push b'))     return 'PSH-B';
  if (l.startsWith('pull b'))     return 'PLL-B';
  if (l.startsWith('legs b'))     return 'LEG-B';
  if (l.startsWith('push'))       return 'PUSH';
  if (l.startsWith('pull'))       return 'PULL';
  if (l.startsWith('legs'))       return 'LEGS';
  return label.slice(0, 5).toUpperCase();
}

// ─── Schedule Builder ────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_INDICES = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

function buildSchedule(
  sessions: Session[],
  trainingDayIndices: number[]
): ScheduleDay[] {
  const sessionByDay: Record<number, Session> = {};
  trainingDayIndices.forEach((dayIdx, i) => {
    sessionByDay[dayIdx] = sessions[i % sessions.length];
  });

  return DAY_INDICES.map((dayIdx, i) => {
    const session = sessionByDay[dayIdx];
    return {
      dayName: DAY_NAMES[i],
      sessionLabel: session?.label ?? null,
      sessionShort: session ? getShortLabel(session.label) : null,
      isRest: !session,
    };
  });
}

// ─── Duration Estimate ───────────────────────────────────────────────

function estimateDuration(sessions: Session[], goal: Goal, exp: Experience): string {
  const avgExercises =
    sessions.reduce((sum, s) => sum + s.exercises.length, 0) / sessions.length;
  const minsPerExercise = goal === 'strength' ? 9 : exp === 'beginner' ? 6 : 7;
  const total = Math.round(avgExercises * minsPerExercise + 10); // +10 warm-up
  if (total < 45) return '~45 min';
  if (total <= 75) return '45 min – 1 hr';
  if (total <= 90) return '1 hr – 1 hr 30';
  return '1 hr 30+';
}

// ─── Content ─────────────────────────────────────────────────────────

function getRationale(
  goal: Goal,
  exp: Experience,
  days: TrainingDays,
  gender: Gender,
  split: string
): string {
  const goalMap: Record<Goal, string> = {
    muscle: 'maximise muscle growth through volume and progressive overload',
    strength: 'drive strength on your main compound lifts',
    'fat-loss': 'preserve every kilogram of muscle while in a deficit',
    fitness: 'build well-rounded strength and conditioning',
  };
  const expMap: Record<Experience, string> = {
    beginner: 'Linear progression will add weight to the bar every session — do not overthink it, just show up and execute.',
    intermediate: 'Double progression keeps gains coming when simple linear progress has stalled.',
    advanced: 'Wave loading and higher volume are the only tools left to force adaptation at your level.',
  };
  const femaleNote = gender === 'female' ? ' Volume and rep ranges have been tuned for female physiology.' : '';
  return `${split} is the optimal structure for ${days} days to ${goalMap[goal]}. ${expMap[exp]}${femaleNote}`;
}

function getProgression(exp: Experience): string {
  switch (exp) {
    case 'beginner':
      return 'Add 2.5 kg (upper) or 5 kg (lower) when you complete all target reps with clean form. Never add weight before hitting every rep.';
    case 'intermediate':
      return 'Build reps to the top of the range across all sets, then add weight. If you regress, stay at the same load and rebuild the reps.';
    case 'advanced':
      return '3-week ramp: add load each week for 3 weeks, then deload, then begin a heavier wave. Rotate main exercise variations every 6-8 weeks.';
  }
}

function getDeload(exp: Experience): string {
  switch (exp) {
    case 'beginner':
      return 'Deload when you stall on the same lift for 2 sessions in a row. Drop to 50% volume for one week.';
    case 'intermediate':
      return 'Every 4-6 weeks: halve your volume, drop intensity by 10-15%. Skip this and you will plateau faster than you need to.';
    case 'advanced':
      return 'Week 4 of every wave: 50% volume, 70% intensity. Non-negotiable. Adaptation is cemented during recovery, not training.';
  }
}

function getKeyNote(goal: Goal): string {
  const notes: Record<Goal, string> = {
    muscle: 'Log every lift. Progressive overload — more weight, reps, or sets than last time — is the only mechanism that builds muscle.',
    strength: 'Prioritise bar path and bracing above all else. Technique is the foundation. You cannot express strength you have not earned.',
    'fat-loss': 'Do not lower the bar. Keep loading as heavy as you can — the deficit does the fat loss work. Training protects the muscle.',
    fitness: 'Consistency beats everything. Showing up 3-4 times a week for 6 months beats any perfect program followed for 3 weeks.',
  };
  return notes[goal];
}

// ─── Session Converter ───────────────────────────────────────────────

function convertSession(
  session: Session,
  goal: Goal,
  exp: Experience,
  gender: Gender
): ProgramSession {
  const female = gender === 'female';
  const advanced = exp === 'advanced';

  const exercises: ProgramExercise[] = session.exercises.map((ex) => {
    let sets = ex.sets;
    if (advanced && sets < 6) sets += 1;
    return {
      name: ex.name,
      sets,
      reps: calcReps(ex, goal, female),
      rest: calcRest(ex, goal, female),
      muscleGroup: getMuscleGroup(ex.name),
    };
  });

  return {
    label: session.label,
    shortLabel: getShortLabel(session.label),
    exercises,
  };
}

// ─── Main Export ─────────────────────────────────────────────────────

export function buildProgram(input: ProgramInput): Program {
  const { goal, experience, daysPerWeek, gender } = input;
  const isBodyweight = input.equipment === 'Bodyweight only';
  const { sessions: rawSessions, split, trainingDayIndices: defaultIndices } = isBodyweight
    ? selectBodyweightTemplate(daysPerWeek)
    : gender === 'female'
    ? selectFemaleTemplate(daysPerWeek, experience)
    : selectTemplate(daysPerWeek, experience);
  // Use user-selected days if provided, otherwise fall back to template defaults
  const trainingDayIndices = (input.trainingDays && input.trainingDays.length === daysPerWeek)
    ? input.trainingDays
    : defaultIndices;

  const goalLabel: Record<Goal, string> = {
    muscle: 'Muscle Building',
    strength: 'Strength',
    'fat-loss': 'Fat Loss',
    fitness: 'General Fitness',
  };
  const expLabel: Record<Experience, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  };

  const sessions = rawSessions.map(s => convertSession(s, goal, experience, gender));
  const schedule = buildSchedule(rawSessions, trainingDayIndices);

  // Collect unique muscle groups
  const muscleGroupSet = new Set<string>();
  sessions.forEach(s => s.exercises.forEach(e => muscleGroupSet.add(e.muscleGroup)));
  const muscleGroups = Array.from(muscleGroupSet).filter(g => g !== 'CORE');

  const fatLossNote = goal === 'fat-loss'
    ? 'Keep the weight on the bar as heavy as possible. Do not reduce loads — reduce sets if needed. Pair with a 300-500 kcal/day deficit and 1.8-2.2g protein per kg bodyweight.'
    : undefined;

  return {
    title: `${goalLabel[goal]} — ${daysPerWeek} Days/Week`,
    splitName: `${expLabel[experience]} ${split}`,
    goal,
    experience,
    daysPerWeek,
    gender,
    rationale: getRationale(goal, experience, daysPerWeek, gender, split),
    schedule,
    trainingDayIndices,
    sessions,
    progression: getProgression(experience),
    deload: getDeload(experience),
    fatLossNote,
    keyNote: getKeyNote(goal),
    stats: {
      sessionsPerWeek: daysPerWeek,
      estimatedDuration: estimateDuration(rawSessions, goal, experience),
      muscleGroups,
    },
  };
}

// ─── Profile Goal Mapper ──────────────────────────────────────────────
// Maps onboarding goal strings → program builder Goal type

export function mapProfileGoal(profileGoal?: string): Goal | null {
  if (!profileGoal) return null;
  const g = profileGoal.toLowerCase();
  if (g.includes('muscle') || g.includes('mass') || g.includes('hypertrophy')) return 'muscle';
  if (g.includes('strength') || g.includes('strong')) return 'strength';
  if (g.includes('fat') || g.includes('weight') || g.includes('lose') || g.includes('cut')) return 'fat-loss';
  if (g.includes('fitness') || g.includes('athletic') || g.includes('general')) return 'fitness';
  return null;
}
