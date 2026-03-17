import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  trainingAge: 'beginner' | 'intermediate' | 'advanced';
  goal: string;
  daysPerWeek: number;
  trainingDays: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  gymTime?: string; // "HH:MM" 24-hour, e.g. "18:00"
  equipment: string;
  injuries: string;
  onboardingComplete: boolean;
  createdAt: string;
}

export interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
  isPR: boolean;
  warmUp?: boolean; // warm-up sets excluded from progressive overload calculations
}

export interface ExerciseLog {
  name: string;
  sets: SetLog[];
}

export interface WorkoutSession {
  id: string;
  date: string; // ISO string
  exercises: ExerciseLog[];
  duration: number; // minutes
  notes: string;
}

export interface PRRecord {
  [exercise: string]: {
    weight: number;
    reps: number;
    date: string;
    volume: number; // weight * reps
  };
}

// ─── Keys ────────────────────────────────────────────────────────────────────

const KEYS = {
  PROFILE: '@grit/profile',
  SESSIONS: '@grit/sessions',
  PRS: '@grit/prs',
};

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | null> {
  try {
    console.log('[GRIT storage] getProfile() called');
    const data = await AsyncStorage.getItem(KEYS.PROFILE);
    console.log('[GRIT storage] getProfile() raw data length:', data?.length ?? 0);
    return data ? JSON.parse(data) : null;
  } catch (e: any) {
    console.error('[GRIT storage] getProfile() failed:', e?.message);
    return null;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  try {
    console.log('[GRIT storage] saveProfile() called for:', profile.name);
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
    console.log('[GRIT storage] saveProfile() done');
  } catch (e: any) {
    console.error('[GRIT storage] saveProfile() failed:', e?.message);
    throw e;
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<WorkoutSession[]> {
  try {
    console.log('[GRIT storage] getSessions() called');
    const data = await AsyncStorage.getItem(KEYS.SESSIONS);
    const sessions = data ? JSON.parse(data) : [];
    console.log('[GRIT storage] getSessions() returned', sessions.length, 'sessions');
    return sessions;
  } catch (e: any) {
    console.error('[GRIT storage] getSessions() failed:', e?.message);
    return [];
  }
}

export async function saveSession(session: WorkoutSession): Promise<void> {
  const sessions = await getSessions();
  const existingIdx = sessions.findIndex((s) => s.id === session.id);
  if (existingIdx >= 0) {
    sessions[existingIdx] = session;
  } else {
    sessions.unshift(session);
  }
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(filtered));
}

// ─── PRs ─────────────────────────────────────────────────────────────────────

export async function getPRs(): Promise<PRRecord> {
  try {
    const data = await AsyncStorage.getItem(KEYS.PRS);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export async function updatePRs(
  session: WorkoutSession
): Promise<{ exercise: string; weight: number; reps: number }[]> {
  const prs = await getPRs();
  const newPRs: { exercise: string; weight: number; reps: number }[] = [];

  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!set.completed || set.weight <= 0) continue;
      const volume = set.weight * set.reps;
      const existing = prs[exercise.name];
      if (!existing || volume > existing.volume) {
        prs[exercise.name] = {
          weight: set.weight,
          reps: set.reps,
          date: session.date,
          volume,
        };
        newPRs.push({ exercise: exercise.name, weight: set.weight, reps: set.reps });
      }
    }
  }

  await AsyncStorage.setItem(KEYS.PRS, JSON.stringify(prs));
  return newPRs;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getStreak(sessions: WorkoutSession[], daysPerWeek: number = 3): number {
  if (sessions.length === 0) return 0;

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Max allowed gap between sessions without breaking streak
  const gapAllowed = Math.ceil(7 / daysPerWeek) + 1;
  let streak = 1;

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = new Date(sorted[i].date);
    const next = new Date(sorted[i + 1].date);
    curr.setHours(0, 0, 0, 0);
    next.setHours(0, 0, 0, 0);
    const diffDays = Math.round((curr.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= gapAllowed) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export function getDaysSinceLastWorkout(sessions: WorkoutSession[]): number {
  if (sessions.length === 0) return 999;
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastDate = new Date(sorted[0].date);
  lastDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Returns total volume (kg×reps, completed sets only) for the current calendar week
// and the all-time best single-week volume for comparison.
export function getWeeklyVolume(sessions: WorkoutSession[]): { current: number; best: number } {
  if (sessions.length === 0) return { current: 0, best: 0 };

  // Find Monday of the current week
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  function sessionVolume(s: WorkoutSession): number {
    return s.exercises.reduce((total, ex) =>
      total + ex.sets.reduce((sum, set) =>
        sum + (set.completed && set.weight > 0 ? set.weight * set.reps : 0), 0), 0);
  }

  function getWeekKey(dateStr: string): string {
    const d = new Date(dateStr);
    const wd = d.getDay();
    const diff = wd === 0 ? -6 : 1 - wd;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  }

  const weekMap = new Map<string, number>();
  let current = 0;
  const currentWeekKey = weekStart.toISOString().split('T')[0];

  for (const s of sessions) {
    const vol = sessionVolume(s);
    const key = getWeekKey(s.date);
    weekMap.set(key, (weekMap.get(key) ?? 0) + vol);
    if (key === currentWeekKey) current += vol;
  }

  const best = Math.max(...Array.from(weekMap.values()));
  return { current, best };
}

export function getLastSessionForExercise(
  exerciseName: string,
  sessions: WorkoutSession[]
): ExerciseLog | null {
  const lower = exerciseName.toLowerCase();
  for (const session of sessions) {
    const found = session.exercises.find((e) => e.name.toLowerCase() === lower);
    if (found) return found;
  }
  return null;
}
