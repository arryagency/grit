import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  trainingAge: 'beginner' | 'intermediate' | 'advanced';
  goal: string;
  goals?: string[]; // all selected goals in selection order
  weightUnit?: 'kg' | 'lbs';
  daysPerWeek?: number;
  trainingDays?: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  gymTime?: string; // "HH:MM" 24-hour, e.g. "18:00"
  equipment: string;
  injuries: string;
  onboardingComplete: boolean;
  createdAt: string;
  userMode?: 'guided' | 'self'; // 'guided' = wants program/suggestions, 'self' = just tracking
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

export interface BodyWeightEntry {
  id: string;
  weight: number; // kg
  date: string;   // ISO string
}

export interface WaterEntry {
  date: string;   // YYYY-MM-DD
  amount: number; // ml consumed today
  goal: number;   // ml daily goal
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  createdAt: string;
  exercises: {
    name: string;
    defaultWeight: number;
    defaultReps: number;
    sets: number;
  }[];
}

export interface PhysiquePhoto {
  id: string;
  uri: string;  // local file URI
  date: string; // ISO string
  note: string;
}

export interface AppSettings {
  restTimerDefault: number; // seconds, default 180
  waterGoal: number;        // ml, default 2500
}

export interface NotificationSettings {
  trainingDayReminder: boolean;   // default true
  missedSessionAlert: boolean;    // default false
  streakProtection: boolean;      // default false
  progressionSuggestions: boolean; // default false
  creatineReminder: boolean;      // default false
  creatineReminderTime: string;   // "HH:MM", default "08:00"
  customReminder: boolean;        // default false
  customReminderText: string;
  customReminderTime: string;     // "HH:MM"
}

export interface ProgressionSuggestion {
  exercise: string;
  currentWeight: number;
  suggestedWeight: number;
  message: string;
  createdAt: string;
}

export interface SavedProgram {
  program: import('./programBuilder').Program;
  savedAt: string; // ISO string
}

export interface ProgramPrefs {
  goal: import('./programBuilder').Goal;
  experience: import('./programBuilder').Experience;
  daysPerWeek: import('./programBuilder').TrainingDays;
  trainingDays?: number[]; // specific weekday indices selected by user, 0=Sun…6=Sat
  gender: import('./programBuilder').Gender;
}

// ─── Keys ────────────────────────────────────────────────────────────────────

const KEYS = {
  PROFILE: '@grit/profile',
  SESSIONS: '@grit/sessions',
  PRS: '@grit/prs',
  BODY_WEIGHT: '@grit/bodyweight',
  WATER: '@grit/water',
  TEMPLATES: '@grit/templates',
  PHYSIQUE: '@grit/physique',
  SETTINGS: '@grit/settings',
  SAVED_PROGRAM: '@grit/savedProgram',
  PROGRAM_PREFS: '@grit/programPrefs',
  NOTIFICATION_SETTINGS: '@grit/notificationSettings',
  PROGRESSION_SUGGESTIONS: '@grit/progressionSuggestions',
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
    const data = await AsyncStorage.getItem(KEYS.SESSIONS);
    const sessions = data ? JSON.parse(data) : [];
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

// ─── Body Weight ──────────────────────────────────────────────────────────────

export async function getBodyWeightEntries(): Promise<BodyWeightEntry[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.BODY_WEIGHT);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addBodyWeightEntry(weight: number): Promise<void> {
  const entries = await getBodyWeightEntries();
  entries.unshift({ id: generateId(), weight, date: new Date().toISOString() });
  await AsyncStorage.setItem(KEYS.BODY_WEIGHT, JSON.stringify(entries));
}

export async function deleteBodyWeightEntry(id: string): Promise<void> {
  const entries = await getBodyWeightEntries();
  await AsyncStorage.setItem(
    KEYS.BODY_WEIGHT,
    JSON.stringify(entries.filter((e) => e.id !== id))
  );
}

export function getBodyWeightTrend(
  entries: BodyWeightEntry[]
): 'gaining' | 'losing' | 'maintaining' | null {
  if (entries.length < 3) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const recent = sorted.slice(-5);
  const diff = recent[recent.length - 1].weight - recent[0].weight;
  if (diff > 0.5) return 'gaining';
  if (diff < -0.5) return 'losing';
  return 'maintaining';
}

// ─── Water ────────────────────────────────────────────────────────────────────

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getTodayWater(): Promise<WaterEntry> {
  try {
    const data = await AsyncStorage.getItem(KEYS.WATER);
    const all: WaterEntry[] = data ? JSON.parse(data) : [];
    const today = getTodayKey();
    return all.find((e) => e.date === today) ?? { date: today, amount: 0, goal: 2500 };
  } catch {
    return { date: getTodayKey(), amount: 0, goal: 2500 };
  }
}

export async function addWater(ml: number): Promise<WaterEntry> {
  const data = await AsyncStorage.getItem(KEYS.WATER);
  const all: WaterEntry[] = data ? JSON.parse(data) : [];
  const today = getTodayKey();
  const existing = all.find((e) => e.date === today);
  if (existing) {
    existing.amount = Math.min(existing.amount + ml, existing.goal * 2);
  } else {
    all.unshift({ date: today, amount: ml, goal: 2500 });
  }
  await AsyncStorage.setItem(KEYS.WATER, JSON.stringify(all));
  return all.find((e) => e.date === today)!;
}

export async function setWaterGoal(ml: number): Promise<void> {
  const data = await AsyncStorage.getItem(KEYS.WATER);
  const all: WaterEntry[] = data ? JSON.parse(data) : [];
  const today = getTodayKey();
  const existing = all.find((e) => e.date === today);
  if (existing) {
    existing.goal = ml;
  } else {
    all.unshift({ date: today, amount: 0, goal: ml });
  }
  await AsyncStorage.setItem(KEYS.WATER, JSON.stringify(all));
}

export async function getWeeklyWaterAverage(): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(KEYS.WATER);
    const all: WaterEntry[] = data ? JSON.parse(data) : [];
    if (all.length === 0) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recent = all.filter((e) => new Date(e.date) >= sevenDaysAgo);
    if (recent.length === 0) return 0;
    return Math.round(recent.reduce((sum, e) => sum + e.amount, 0) / recent.length);
  } catch {
    return 0;
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.TEMPLATES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  const templates = await getTemplates();
  templates.unshift(template);
  await AsyncStorage.setItem(KEYS.TEMPLATES, JSON.stringify(templates));
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await getTemplates();
  await AsyncStorage.setItem(
    KEYS.TEMPLATES,
    JSON.stringify(templates.filter((t) => t.id !== id))
  );
}

// ─── Physique ─────────────────────────────────────────────────────────────────

export async function getPhysiquePhotos(): Promise<PhysiquePhoto[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.PHYSIQUE);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addPhysiquePhoto(uri: string, note: string = ''): Promise<void> {
  const photos = await getPhysiquePhotos();
  photos.unshift({ id: generateId(), uri, date: new Date().toISOString(), note });
  await AsyncStorage.setItem(KEYS.PHYSIQUE, JSON.stringify(photos));
}

export async function deletePhysiquePhoto(id: string): Promise<void> {
  const photos = await getPhysiquePhotos();
  await AsyncStorage.setItem(
    KEYS.PHYSIQUE,
    JSON.stringify(photos.filter((p) => p.id !== id))
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  restTimerDefault: 180,
  waterGoal: 2500,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(KEYS.SETTINGS);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...current, ...settings }));
}

// ─── Saved Program ────────────────────────────────────────────────────────────

export async function getSavedProgram(): Promise<SavedProgram | null> {
  try {
    const data = await AsyncStorage.getItem(KEYS.SAVED_PROGRAM);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function saveProgram(program: SavedProgram['program']): Promise<void> {
  const entry: SavedProgram = { program, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEYS.SAVED_PROGRAM, JSON.stringify(entry));
}

export async function deleteSavedProgram(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.SAVED_PROGRAM);
}

// ─── Program Prefs ────────────────────────────────────────────────────────────

export async function getProgramPrefs(): Promise<ProgramPrefs | null> {
  try {
    const data = await AsyncStorage.getItem(KEYS.PROGRAM_PREFS);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function saveProgramPrefs(prefs: ProgramPrefs): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROGRAM_PREFS, JSON.stringify(prefs));
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

// ─── Manual PR ────────────────────────────────────────────────────────────────

export async function savePRManually(
  exercise: string,
  weight: number,
  reps: number
): Promise<void> {
  const prs = await getPRs();
  const volume = weight * reps;
  const existing = prs[exercise];
  if (!existing || volume > existing.volume) {
    prs[exercise] = { weight, reps, date: new Date().toISOString(), volume };
    await AsyncStorage.setItem(KEYS.PRS, JSON.stringify(prs));
  }
}

// ─── Notification Settings ────────────────────────────────────────────────────

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  trainingDayReminder: true,
  missedSessionAlert: false,
  streakProtection: false,
  progressionSuggestions: false,
  creatineReminder: false,
  creatineReminderTime: '08:00',
  customReminder: false,
  customReminderText: '',
  customReminderTime: '09:00',
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const data = await AsyncStorage.getItem(KEYS.NOTIFICATION_SETTINGS);
    return data
      ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(data) }
      : DEFAULT_NOTIFICATION_SETTINGS;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function saveNotificationSettings(
  settings: Partial<NotificationSettings>
): Promise<void> {
  const current = await getNotificationSettings();
  await AsyncStorage.setItem(
    KEYS.NOTIFICATION_SETTINGS,
    JSON.stringify({ ...current, ...settings })
  );
}

// ─── Progression Suggestions ──────────────────────────────────────────────────

export async function getProgressionSuggestions(): Promise<ProgressionSuggestion[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.PROGRESSION_SUGGESTIONS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveProgressionSuggestions(
  suggestions: ProgressionSuggestion[]
): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROGRESSION_SUGGESTIONS, JSON.stringify(suggestions));
}

export async function clearProgressionSuggestion(exercise: string): Promise<void> {
  const suggestions = await getProgressionSuggestions();
  const updated = suggestions.filter(
    (s) => s.exercise.toLowerCase() !== exercise.toLowerCase()
  );
  await AsyncStorage.setItem(KEYS.PROGRESSION_SUGGESTIONS, JSON.stringify(updated));
}
