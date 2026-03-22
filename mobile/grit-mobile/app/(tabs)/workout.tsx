import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Linking,
  PanResponder,
} from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSessions,
  saveSession,
  updatePRs,
  WorkoutSession,
  SetLog,
  generateId,
  getLastSessionForExercise,
  getSettings,
  getTemplates,
  saveTemplate,
  deleteTemplate,
  WorkoutTemplate,
  getSavedProgram,
  SavedProgram,
  getProgressionSuggestions,
  saveProgressionSuggestions,
  clearProgressionSuggestion,
  ProgressionSuggestion,
  getNotificationSettings,
  getRestTimes,
  saveRestTime,
} from '@/utils/storage';
import { getSuggestion, parseQuickLog, getMissingPieceQuestion } from '@/utils/progressiveOverload';
import { parseLogWithClaude } from '@/utils/api';
import { ALL_EXERCISES } from '@/constants/exercises';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

function emptySet(weight = 0, reps = 8): SetLog {
  return { weight, reps, completed: false, isPR: false };
}

const QUICK_PLACEHOLDERS = [
  'bench 80 8',
  'squat 100 3x5',
  'dl 120 5',
  'i did bench 50kg for 6 reps',
];

const GYM_FOCUS_MESSAGES = [
  "Bro. She's not looking. Get back to work.",
  "Stop staring. Focus on the bar, not the cardio section.",
  "The only thing you should be checking out right now is your form.",
  "She's not impressed by you watching her. She's impressed by results. Keep going.",
  "Eyes forward. The mirror is for checking form, not for being weird.",
];

// ─── Unilateral detection ─────────────────────────────────────────────────────

const UNILATERAL_KEYWORDS = [
  'one arm', 'one-arm', 'single arm', 'single-arm',
  'single leg', 'single-leg', 'one leg', 'one-leg',
  'unilateral', 'bulgarian split', 'split squat',
  'lunge', 'hammer curl', 'concentration curl',
  'single arm cable',
];

function isUnilateral(name: string): boolean {
  const lower = name.toLowerCase();
  return UNILATERAL_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WorkoutScreen() {
  const [isActive, setIsActive] = useState(false);
  const [session, setSession] = useState<WorkoutSession>({
    id: generateId(),
    date: new Date().toISOString(),
    exercises: [],
    duration: 0,
    notes: '',
  });
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);

  // Quick log
  const [quickText, setQuickText] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickParsing, setQuickParsing] = useState(false);
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  // Track last-logged exercise so we can show a running set list
  const [lastLoggedExercise, setLastLoggedExercise] = useState<string | null>(null);
  // Per-exercise memory: last logged weight/reps for context-aware parsing
  const [lastLoggedWeights, setLastLoggedWeights] = useState<Record<string, number>>({});
  const [lastLoggedRepsMap, setLastLoggedRepsMap] = useState<Record<string, number>>({});
  // Rotating placeholder text
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Session timer — unified (countup or countdown)
  const [sessionMode, setSessionMode] = useState<'countup' | 'countdown'>('countup');
  const [sessionTimerMins, setSessionTimerMins] = useState<number | null>(null);
  const [sessionTimerSecs, setSessionTimerSecs] = useState(0);
  const [sessionTimerActive, setSessionTimerActive] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionFiveNotified = useRef(false);
  // Sheet picker local selection (not yet confirmed)
  const [pickerMins, setPickerMins] = useState(45);
  // Pref persisted across sessions
  const lastTimerPrefRef = useRef<{ mode: 'countup' | 'countdown'; targetMins: number | null }>({ mode: 'countup', targetMins: null });

  // Elapsed session timer (always counts up while workout is active)
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Per-exercise rest times
  const [restTimes, setRestTimes] = useState<Record<string, number>>({});
  const [currentRestExercise, setCurrentRestExercise] = useState<string | null>(null);
  const [showRestSheet, setShowRestSheet] = useState(false);
  const [restSheetDuration, setRestSheetDuration] = useState(180);

  // Per-side (unilateral) exercise tracking
  const [perSideExercises, setPerSideExercises] = useState<Record<string, boolean>>({});

  function getIsPerSide(exName: string): boolean {
    return perSideExercises[exName] ?? isUnilateral(exName);
  }

  function togglePerSide(exName: string) {
    const current = getIsPerSide(exName);
    setPerSideExercises((prev) => ({ ...prev, [exName]: !current }));
  }

  // Drag-to-reorder state
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragToIdx, setDragToIdx] = useState<number | null>(null);
  const dragFromIdxRef = useRef<number | null>(null);
  const dragToIdxRef = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const dragY = useRef(new Animated.Value(0)).current;
  const dragPanActive = useRef(false); // true once PanResponder takes over the touch




  // PR celebration
  const [prOverlay, setPrOverlay] = useState<{ exercise: string; weight: number; reps: number }[]>([]);
  const prScale = useRef(new Animated.Value(0.4)).current;
  const prOpacity = useRef(new Animated.Value(0)).current;

  // ─── Rest Timer ─────────────────────────────────────────────────────────────
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(180);
  const [restTimerDefault, setRestTimerDefault] = useState(180);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerStartVal = useRef(180);
  const [restTimerComplete, setRestTimerComplete] = useState(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    getSettings().then((s) => {
      setRestTimerDefault(s.restTimerDefault);
      setRestRemaining(s.restTimerDefault);
    });
    getRestTimes().then(setRestTimes);
    AsyncStorage.getItem('@grit/sessionTimerPref').then((raw) => {
      if (raw) {
        try {
          const pref = JSON.parse(raw);
          lastTimerPrefRef.current = pref;
          setSessionMode(pref.mode ?? 'countup');
        } catch (_) {}
      }
    });
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  function getDefaultRestForExercise(name: string): number {
    const lower = name.toLowerCase();
    if (/push.?up|pull.?up|chin.?up|\bdip\b|burpee|plank|sit.?up|\bcrunch\b/.test(lower)) return 60;
    if (/squat|deadlift|bench press|overhead press|barbell row|lat pull|pulldown|chin|snatch|clean|jerk/.test(lower)) return 180;
    if (/curl|extension|raise|fly|flye|pullover|kickback|\bshrug\b|face pull/.test(lower)) return 90;
    return 120;
  }

  function startRestTimer(exName?: string, overrideSecs?: number) {
    let secs: number;
    if (overrideSecs !== undefined) {
      secs = overrideSecs;
    } else if (exName && restTimes[exName.toLowerCase()] !== undefined) {
      secs = restTimes[exName.toLowerCase()];
    } else if (exName) {
      secs = getDefaultRestForExercise(exName);
    } else {
      secs = restTimerDefault;
    }
    setCurrentRestExercise(exName ?? null);
    setRestTimerComplete(false);
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restTimerStartVal.current = secs;
    setRestRemaining(secs);
    setRestTimerActive(true);

    restIntervalRef.current = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(restIntervalRef.current!);
          setRestTimerComplete(true);
          onRestComplete();
          setTimeout(() => {
            setRestTimerActive(false);
            setRestTimerComplete(false);
          }, 4000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function skipRestTimer() {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTimerActive(false);
    setRestTimerComplete(false);
  }

  function onRestComplete() {
    // Multiple haptic pulses to get attention
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 350);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 700);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 1100);

    // Schedule an immediate notification for the sound
    try {
      const Notifications = require('expo-notifications');
      Notifications.scheduleNotificationAsync({
        content: { title: 'GRIT', body: 'Rest complete. Get back under the bar.' },
        trigger: null,
      });
    } catch (_) {}

  }

  function formatRestTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Session Timer ───────────────────────────────────────────────────────────

  function startSessionTimer(mins: number) {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    setSessionMode('countdown');
    setSessionTimerMins(mins);
    setSessionTimerSecs(mins * 60);
    setSessionTimerActive(true);
    sessionFiveNotified.current = false;
    sessionTimerRef.current = setInterval(() => {
      setSessionTimerSecs((prev) => {
        if (prev <= 1) {
          clearInterval(sessionTimerRef.current!);
          setSessionTimerActive(false);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 600);
          Alert.alert('Session over.', 'Get out.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopSessionTimer() {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    setSessionTimerActive(false);
    setSessionTimerMins(null);
    setSessionTimerSecs(0);
    sessionFiveNotified.current = false;
  }

  function applyTimerSelection(mode: 'countup' | 'countdown', targetMins: number | null) {
    const pref = { mode, targetMins };
    lastTimerPrefRef.current = pref;
    AsyncStorage.setItem('@grit/sessionTimerPref', JSON.stringify(pref));
    if (mode === 'countdown' && targetMins) {
      stopElapsedTimer();
      startSessionTimer(targetMins);
    } else {
      stopSessionTimer();
      setSessionMode('countup');
      startElapsedTimer();
    }
  }


  // ─── Data Loading ────────────────────────────────────────────────────────────

  const [savedProgram, setSavedProgram] = useState<SavedProgram | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSessions().then(setAllSessions);
      getTemplates().then(setTemplates);
      getSavedProgram().then(setSavedProgram);
    }, [])
  );

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % QUICK_PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [isActive]);

  const filteredExercises = search.trim()
    ? ALL_EXERCISES.filter((e) => e.toLowerCase().includes(search.toLowerCase()))
    : ALL_EXERCISES;

  function onPressStart() {
    doStartWorkout();
  }

  function formatElapsed(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startElapsedTimer() {
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    setElapsedSecs(0);
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSecs((prev) => prev + 1);
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = null;
    setElapsedSecs(0);
  }

  async function doStartWorkout() {
    stopSessionTimer();
    stopElapsedTimer();
    setLastLoggedWeights({});
    setLastLoggedRepsMap({});
    setLastLoggedExercise(null);
    setStartTime(new Date());
    setIsActive(true);
    setSession({
      id: generateId(),
      date: new Date().toISOString(),
      exercises: [],
      duration: 0,
      notes: '',
    });

    // Gym focus mode — schedule one random distraction notification
    try {
      const notifSettings = await getNotificationSettings();
      if (notifSettings.gymFocusMode) {
        const Notifications = require('expo-notifications');
        const delaySecs = Math.floor(Math.random() * (40 - 15 + 1) + 15) * 60;
        const msg = GYM_FOCUS_MESSAGES[Math.floor(Math.random() * GYM_FOCUS_MESSAGES.length)];
        await Notifications.scheduleNotificationAsync({
          content: { title: 'GRIT 🔒', body: msg },
          trigger: { seconds: delaySecs },
        });
      }
    } catch (_) {}

  }

  // ─── Template Load ───────────────────────────────────────────────────────────

  function loadTemplate(template: WorkoutTemplate) {
    stopElapsedTimer();
    setStartTime(new Date());
    setIsActive(true);
    setSession({
      id: generateId(),
      date: new Date().toISOString(),
      exercises: template.exercises.map((te) => ({
        name: te.name,
        sets: Array.from({ length: te.sets }, () =>
          emptySet(te.defaultWeight, te.defaultReps)
        ),
      })),
      duration: 0,
      notes: '',
    });
  }

  // ─── Exercise Management ────────────────────────────────────────────────────

  function addExercise(name: string) {
    // Clear any pending progression suggestion for this exercise
    clearProgressionSuggestion(name).catch(() => {});
    const suggestion = getSuggestion(name, allSessions);
    const lastEx = getLastSessionForExercise(name, allSessions);
    const defaultWeight =
      suggestion?.weight ??
      (lastEx ? Math.max(...lastEx.sets.filter((s) => s.weight > 0).map((s) => s.weight), 0) : 0);
    setSession((prev) => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        { name, sets: [emptySet(defaultWeight, 0)] },
      ],
    }));
    setShowExerciseModal(false);
    setSearch('');
  }

  function removeExercise(exIdx: number) {
    setSession((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== exIdx),
    }));
  }

  // ─── Drag-to-reorder ─────────────────────────────────────────────────────────

  const ESTIMATED_CARD_HEIGHT = 220;

  function startDrag(idx: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    dragFromIdxRef.current = idx;
    dragToIdxRef.current = idx;
    setDragFromIdx(idx);
    setDragToIdx(idx);
  }

  function updateDrag(dy: number) {
    const from = dragFromIdxRef.current;
    if (from === null) return;
    const total = sessionRef.current.exercises.length;
    const delta = Math.round(dy / ESTIMATED_CARD_HEIGHT);
    const newTo = Math.max(0, Math.min(total - 1, from + delta));
    if (newTo !== dragToIdxRef.current) {
      dragToIdxRef.current = newTo;
      setDragToIdx(newTo);
    }
  }

  function endDrag() {
    const from = dragFromIdxRef.current;
    const to = dragToIdxRef.current;
    dragY.setValue(0);
    dragPanActive.current = false;
    dragFromIdxRef.current = null;
    dragToIdxRef.current = null;
    setDragFromIdx(null);
    setDragToIdx(null);
    if (from !== null && to !== null && from !== to) {
      setSession((prev) => {
        const exercises = [...prev.exercises];
        const [removed] = exercises.splice(from, 1);
        exercises.splice(to, 0, removed);
        return { ...prev, exercises };
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // PanResponder lives on a wrapper View over the exercise list.
  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => dragFromIdxRef.current !== null,
      onMoveShouldSetPanResponder: () => dragFromIdxRef.current !== null,
      onPanResponderGrant: () => { dragPanActive.current = true; },
      onPanResponderMove: (_, g) => {
        dragY.setValue(g.dy);
        updateDrag(g.dy);
      },
      onPanResponderRelease: () => endDrag(),
      onPanResponderTerminate: () => endDrag(),
    })
  ).current;

  function addSet(exIdx: number) {
    setSession((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      const lastSet = ex.sets[ex.sets.length - 1];
      ex.sets = [...ex.sets, { ...lastSet, completed: false, isPR: false }];
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  function removeSet(exIdx: number, setIdx: number) {
    setSession((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      if (ex.sets.length <= 1) return prev;
      ex.sets = ex.sets.filter((_, i) => i !== setIdx);
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  function updateSet(exIdx: number, setIdx: number, field: 'weight' | 'reps', delta: number) {
    setSession((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      const sets = [...ex.sets];
      const set = { ...sets[setIdx] };
      const step = field === 'weight' ? 2.5 : 1;
      const min = field === 'weight' ? 0 : 1;
      set[field] = Math.max(min, set[field] + delta * step);
      sets[setIdx] = set;
      ex.sets = sets;
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  function setSetValue(exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) {
    const num = parseFloat(value) || 0;
    setSession((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      const sets = [...ex.sets];
      sets[setIdx] = { ...sets[setIdx], [field]: num };
      ex.sets = sets;
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  function toggleSetComplete(exIdx: number, setIdx: number) {
    const willBeCompleted = !session.exercises[exIdx]?.sets[setIdx]?.completed;

    setSession((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      const sets = [...ex.sets];
      const wasCompleted = sets[setIdx].completed;
      sets[setIdx] = { ...sets[setIdx], completed: !wasCompleted };
      ex.sets = sets;
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });

    // Start rest timer when set is marked as complete
    if (willBeCompleted) {
      const exName = session.exercises[exIdx]?.name ?? '';
      const perSide = getIsPerSide(exName);
      if (perSide) {
        const base = restTimes[exName.toLowerCase()] ?? getDefaultRestForExercise(exName);
        startRestTimer(exName, Math.floor(base / 2));
      } else {
        startRestTimer(exName);
      }
    }
  }

  // ─── Quick Log ──────────────────────────────────────────────────────────────

  function openQuickPanel() {
    setQuickText('');
    setQuickError('');
    setShowQuickPanel(true);
  }

  function closeQuickPanel() {
    setShowQuickPanel(false);
    setQuickText('');
    setQuickError('');
  }

  async function handleQuickLog() {
    const text = quickText.trim();
    if (!text || quickParsing) return;

    // Pull per-exercise context so "same weight but 7 reps" works without re-typing
    const contextWeight = lastLoggedExercise ? (lastLoggedWeights[lastLoggedExercise] ?? null) : null;
    const contextReps = lastLoggedExercise ? (lastLoggedRepsMap[lastLoggedExercise] ?? null) : null;

    // Try local parser with full session context
    let results = parseQuickLog(text, lastLoggedExercise, contextWeight, contextReps);

    // Fallback to Claude if local parser can't make sense of it
    if (!results) {
      setQuickParsing(true);
      setQuickError('');
      const claudeResults = await parseLogWithClaude(text, lastLoggedExercise, contextWeight);
      setQuickParsing(false);
      if (claudeResults && claudeResults.length > 0) {
        results = claudeResults;
      }
    }

    if (!results) {
      // Lenient fallback: extract whatever we can, fill 0 for missing values
      const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|lb|lbs)/i);
      const repsMatch = text.match(/(\d+)\s*(?:rep|reps|x|×)/i)
        ?? (!weightMatch ? text.match(/\b(\d+)\b/) : null);
      const parsedWeight = weightMatch ? parseFloat(weightMatch[1]) : 0;
      const parsedReps = repsMatch ? parseInt(repsMatch[1], 10) : 0;
      const namePart = text
        .replace(/\b\d+(?:\.\d+)?\s*(?:kg|lb|lbs)\b/gi, '')
        .replace(/\b\d+\s*(?:rep|reps|x|×)\b/gi, '')
        .replace(/\b\d+\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const exerciseName = namePart.length >= 2
        ? namePart.replace(/\b\w/g, (c) => c.toUpperCase())
        : lastLoggedExercise;
      if (!exerciseName) {
        setQuickError('What exercise?');
        return;
      }
      results = [{ exerciseName, weight: parsedWeight, reps: parsedReps, sets: 1 }];
    }

    setQuickError('');
    setQuickText('');
    setShowQuickPanel(false);

    // Log all parsed entries — also update per-exercise weight/reps memory
    for (const parsed of results) {
      setLastLoggedExercise(parsed.exerciseName);
      setLastLoggedWeights((prev) => ({ ...prev, [parsed.exerciseName]: parsed.weight }));
      setLastLoggedRepsMap((prev) => ({ ...prev, [parsed.exerciseName]: parsed.reps }));
      setSession((prev) => {
        const existingIdx = prev.exercises.findIndex(
          (e) => e.name.toLowerCase() === parsed.exerciseName.toLowerCase()
        );
        const newSets: SetLog[] = Array.from({ length: parsed.sets }, () => ({
          weight: parsed.weight,
          reps: parsed.reps,
          completed: true,
          isPR: false,
        }));

        if (existingIdx >= 0) {
          const exercises = [...prev.exercises];
          const ex = { ...exercises[existingIdx] };
          // Drop empty placeholder sets, then append new ones
          const realSets = ex.sets.filter((s) => s.weight > 0 || s.reps > 0);
          ex.sets = [...realSets, ...newSets];
          exercises[existingIdx] = ex;
          return { ...prev, exercises };
        } else {
          return {
            ...prev,
            exercises: [...prev.exercises, { name: parsed.exerciseName, sets: newSets }],
          };
        }
      });
    }
    startRestTimer();
  }

  // ─── Progression Suggestion Analysis ────────────────────────────────────────

  async function analyseProgressionSuggestions(
    completedSession: WorkoutSession,
    allSessionsNow: WorkoutSession[]
  ) {
    const existing = await getProgressionSuggestions();
    const updated = [...existing];

    for (const ex of completedSession.exercises) {
      const completedSets = ex.sets.filter((s) => s.completed && s.weight > 0);
      if (completedSets.length === 0) continue;
      const topWeight = Math.max(...completedSets.map((s) => s.weight));

      // Find last 2 sessions for this exercise (not counting today's)
      const prev = allSessionsNow
        .filter((s) => s.id !== completedSession.id)
        .slice(0, 10)
        .filter((s) => s.exercises.some((e) => e.name.toLowerCase() === ex.name.toLowerCase()))
        .slice(0, 2);

      if (prev.length < 2) continue;

      // Check if they hit the same weight in both previous sessions
      const prevWeights = prev.map((s) => {
        const e = s.exercises.find((e) => e.name.toLowerCase() === ex.name.toLowerCase());
        if (!e) return 0;
        const done = e.sets.filter((set) => set.completed && set.weight > 0);
        return done.length > 0 ? Math.max(...done.map((set) => set.weight)) : 0;
      });

      if (prevWeights[0] === topWeight && prevWeights[1] === topWeight) {
        const suggestedWeight = topWeight + 2.5;
        const alreadyExists = updated.some(
          (s) => s.exercise.toLowerCase() === ex.name.toLowerCase()
        );
        if (!alreadyExists) {
          updated.push({
            exercise: ex.name,
            currentWeight: topWeight,
            suggestedWeight,
            message: `You've hit ${topWeight}kg for 2 sessions in a row. You've earned it.`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    await saveProgressionSuggestions(updated);
  }

  // ─── Form Tutorial ───────────────────────────────────────────────────────────

  function watchForm(exerciseName: string) {
    const query = encodeURIComponent(`${exerciseName} proper form technique`);
    Linking.openURL(`https://www.youtube.com/results?search_query=${query}`);
  }

  // ─── Finish / Discard ───────────────────────────────────────────────────────

  async function finishWorkout() {
    if (session.exercises.length === 0) {
      Alert.alert('Empty session', 'Add at least one exercise before finishing.');
      return;
    }

    const duration = startTime
      ? Math.round((Date.now() - startTime.getTime()) / 60000)
      : 0;

    // Auto-complete any set that has weight or reps filled in
    const finalSession: WorkoutSession = {
      ...session,
      duration,
      exercises: session.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((set) => ({
          ...set,
          completed: set.completed || set.weight > 0 || set.reps > 0,
        })),
      })),
    };

    setSaving(true);
    try {
      await saveSession(finalSession);
      const newPRs = await updatePRs(finalSession);

      // Analyse progression suggestions
      const updatedSessions = await getSessions();
      await analyseProgressionSuggestions(finalSession, updatedSessions);

      // Stop timers
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
      setRestTimerActive(false);
      stopElapsedTimer();
      setIsActive(false);
      setAllSessions(updatedSessions);

      if (newPRs.length > 0) {
        setPrOverlay(newPRs);
        Animated.parallel([
          Animated.spring(prScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
          Animated.timing(prOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
        setTimeout(() => {
          Animated.timing(prOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
            setPrOverlay([]);
            prScale.setValue(0.4);
            router.push(`/session-summary?sessionId=${finalSession.id}&prs=${newPRs.length}`);
          });
        }, 2500);
      } else {
        router.push(`/session-summary?sessionId=${finalSession.id}&prs=0`);
      }
    } finally {
      setSaving(false);
    }
  }

  function discardWorkout() {
    Alert.alert('Discard session?', 'All logged sets will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (restIntervalRef.current) clearInterval(restIntervalRef.current);
          setRestTimerActive(false);
          stopSessionTimer();
          stopElapsedTimer();
          setIsActive(false);
        },
      },
    ]);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!isActive) {
    return (
      <IdleScreen
        onStart={onPressStart}
        sessions={allSessions}
        templates={templates}
        savedProgram={savedProgram}
        onLoadTemplate={loadTemplate}
        onDeleteTemplate={(id) => {
          deleteTemplate(id).then(() => getTemplates().then(setTemplates));
        }}
        onLoadProgramSession={(exercises) => {
          stopElapsedTimer();
          setStartTime(new Date());
          setIsActive(true);
          setSession({
            id: generateId(),
            date: new Date().toISOString(),
            exercises: exercises.map((ex) => {
              const suggestion = getSuggestion(ex.name, allSessions);
              const lastEx = getLastSessionForExercise(ex.name, allSessions);
              const defaultWeight =
                suggestion?.weight ??
                (lastEx ? Math.max(...lastEx.sets.filter((s) => s.weight > 0).map((s) => s.weight), 0) : 0);
              return {
                name: ex.name,
                sets: Array.from({ length: ex.sets }, () => emptySet(defaultWeight, 0)),
              };
            }),
            duration: 0,
            notes: '',
          });
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Active header */}
        <View style={styles.activeHeader}>
          <TouchableOpacity onPress={discardWorkout}>
            <Text style={styles.discardText}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => {
              setPickerMins(sessionTimerMins ?? 45);
              setShowTimerPicker(true);
            }}
            hitSlop={8}
          >
            {sessionMode === 'countdown' && sessionTimerActive ? (
              <Text style={[styles.elapsedTimer, sessionTimerSecs <= 300 && styles.elapsedTimerWarning]}>
                {formatElapsed(sessionTimerSecs)}
              </Text>
            ) : (
              <Text style={styles.elapsedTimer}>{formatElapsed(elapsedSecs)}</Text>
            )}
            <Ionicons
              name="timer-outline"
              size={12}
              color={sessionTimerActive && sessionTimerSecs <= 300 ? '#e8ff00' : '#555'}
            />
            <Text style={styles.timerHint}>Tap to set</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.finishButton, saving && { opacity: 0.5 }]}
            onPress={finishWorkout}
            disabled={saving}
          >
            <Text style={styles.finishButtonText}>{saving ? 'Saving…' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>




        {/* Rest timer strip */}
        {restTimerActive && (
          <RestTimerStrip
            remaining={restRemaining}
            total={restTimerStartVal.current}
            exerciseName={currentRestExercise}
            complete={restTimerComplete}
            onSkip={skipRestTimer}
            onAdjust={() => {
              setRestSheetDuration(restTimerStartVal.current);
              setShowRestSheet(true);
            }}
          />
        )}

        <View {...dragPanResponder.panHandlers} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEnabled={dragFromIdx === null}>
          {session.exercises.map((ex, exIdx) => {
            const lastEx = getLastSessionForExercise(ex.name, allSessions);
            const suggestion = getSuggestion(ex.name, allSessions);
            const isDragging = dragFromIdx === exIdx;
            const isDropTarget = dragToIdx === exIdx && dragFromIdx !== exIdx && dragFromIdx !== null;

            // Cards that need to shift out of the way to show the gap
            const cardShift = (() => {
              if (dragFromIdx === null || dragToIdx === null || isDragging) return 0;
              if (dragFromIdx < dragToIdx && exIdx > dragFromIdx && exIdx <= dragToIdx)
                return -ESTIMATED_CARD_HEIGHT;
              if (dragFromIdx > dragToIdx && exIdx < dragFromIdx && exIdx >= dragToIdx)
                return ESTIMATED_CARD_HEIGHT;
              return 0;
            })();

            return (
              <Animated.View
                key={exIdx}
                style={[
                  styles.exerciseCard,
                  isDragging && styles.exerciseCardDragging,
                  isDropTarget && styles.exerciseCardDropTarget,
                  isDragging
                    ? { transform: [{ translateY: dragY }, { scale: 1.03 }], zIndex: 99 }
                    : cardShift !== 0
                    ? { transform: [{ translateY: cardShift }] }
                    : undefined,
                ]}
              >
                <TouchableOpacity
                  style={styles.exHeader}
                  activeOpacity={0.85}
                  delayLongPress={500}
                  onLongPress={() => startDrag(exIdx)}
                  onPressOut={() => {
                    // If the drag was activated but PanResponder hasn't taken over
                    // (user released without moving), cancel and deselect.
                    if (dragFromIdxRef.current === exIdx && !dragPanActive.current) {
                      endDrag();
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.exName}>{ex.name}</Text>
                      {getIsPerSide(ex.name) && (
                        <Text style={styles.perSideLabel}>per side</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.exHeaderActions}>
                    {isUnilateral(ex.name) && (
                      <TouchableOpacity
                        style={[
                          styles.perSideToggle,
                          getIsPerSide(ex.name) && styles.perSideToggleActive,
                        ]}
                        onPress={() => togglePerSide(ex.name)}
                        hitSlop={8}
                      >
                        <Text
                          style={[
                            styles.perSideToggleText,
                            getIsPerSide(ex.name) && styles.perSideToggleTextActive,
                          ]}
                        >
                          ½ rest
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.watchFormBtn}
                      onPress={() => watchForm(ex.name)}
                    >
                      <Ionicons name="play-circle-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.watchFormText}>Watch form</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                      <Ionicons name="close" size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {lastEx && (
                  <Text style={styles.prevLabel}>
                    Last:{' '}
                    {lastEx.sets
                      .filter((s) => s.completed && s.weight > 0)
                      .map((s) => `${s.weight}kg×${s.reps}`)
                      .join('  ') || '—'}
                  </Text>
                )}

                {suggestion && suggestion.weight > 0 && (
                  <View
                    style={[
                      styles.suggestionRow,
                      suggestion.type === 'increase' && styles.suggestionIncrease,
                      suggestion.type === 'deload' && styles.suggestionDeload,
                    ]}
                  >
                    <Ionicons
                      name={
                        suggestion.type === 'increase'
                          ? 'trending-up'
                          : suggestion.type === 'deload'
                          ? 'trending-down'
                          : 'remove'
                      }
                      size={13}
                      color={
                        suggestion.type === 'increase'
                          ? COLORS.accent
                          : suggestion.type === 'deload'
                          ? COLORS.warning
                          : COLORS.textSecondary
                      }
                    />
                    <Text style={styles.suggestionText}>{suggestion.reason}</Text>
                  </View>
                )}

                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderText, { width: 28 }]}>Set</Text>
                  <Text style={[styles.setHeaderText, { flex: 1, textAlign: 'center' }]}>kg</Text>
                  <Text style={[styles.setHeaderText, { flex: 1, textAlign: 'center' }]}>Reps</Text>
                  <View style={{ width: 40 }} />
                </View>

                {ex.sets.map((set, setIdx) => (
                  <SetRow
                    key={setIdx}
                    setNum={setIdx + 1}
                    set={set}
                    onWeightDelta={(d) => updateSet(exIdx, setIdx, 'weight', d)}
                    onRepsDelta={(d) => updateSet(exIdx, setIdx, 'reps', d)}
                    onWeightChange={(v) => setSetValue(exIdx, setIdx, 'weight', v)}
                    onRepsChange={(v) => setSetValue(exIdx, setIdx, 'reps', v)}
                    onToggle={() => toggleSetComplete(exIdx, setIdx)}
                    onRemove={() => removeSet(exIdx, setIdx)}
                    canRemove={ex.sets.length > 1}
                  />
                ))}

                <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(exIdx)}>
                  <Ionicons name="add" size={16} color={COLORS.accent} />
                  <Text style={styles.addSetText}>Add set</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}

          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={() => setShowExerciseModal(true)}
          >
            <Ionicons name="add-circle-outline" size={22} color={COLORS.accent} />
            <Text style={styles.addExerciseText}>Add exercise</Text>
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>
        </View>


      </KeyboardAvoidingView>

      {/* Floating quick log button */}
      <TouchableOpacity style={styles.quickFab} onPress={openQuickPanel} activeOpacity={0.85}>
        <Ionicons name="flash" size={22} color="#000000" />
      </TouchableOpacity>

      {/* Quick log slide-up panel */}
      <Modal visible={showQuickPanel} transparent animationType="fade" onRequestClose={closeQuickPanel}>
        <View style={styles.quickModalWrap}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeQuickPanel} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.quickPanel}>
              {quickError ? <Text style={styles.quickPanelError}>{quickError}</Text> : null}
              <View style={styles.quickPanelRow}>
                <TextInput
                  style={styles.quickPanelInput}
                  value={quickText}
                  onChangeText={(t) => { setQuickText(t); setQuickError(''); }}
                  placeholder="bench 50kg 8reps"
                  placeholderTextColor={COLORS.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleQuickLog}
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoFocus
                  editable={!quickParsing}
                />
                <TouchableOpacity
                  style={[styles.quickPanelSend, quickParsing && { opacity: 0.5 }]}
                  onPress={handleQuickLog}
                  disabled={quickParsing}
                >
                  <Ionicons name={quickParsing ? 'ellipsis-horizontal' : 'flash'} size={20} color={COLORS.background} />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Exercise picker modal */}
      <Modal visible={showExerciseModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose exercise</Text>
            <TouchableOpacity onPress={() => { setShowExerciseModal(false); setSearch(''); }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises..."
            placeholderTextColor={COLORS.textMuted}
            autoFocus
          />
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.exerciseItem} onPress={() => addExercise(item)}>
                <Text style={styles.exerciseItemText}>{item}</Text>
                <Ionicons name="add" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 320 }}
          />
        </View>
      </Modal>

      {/* Session timer picker modal */}
      <Modal visible={showTimerPicker} animationType="slide" transparent>
        <View style={timerStyles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTimerPicker(false)} />
          <View style={timerStyles.sheet}>
            <View style={timerStyles.header}>
              <Text style={timerStyles.title}>Session timer</Text>
              <TouchableOpacity onPress={() => setShowTimerPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Preset buttons */}
            <View style={timerStyles.presets}>
              {([30, 45, 60, 90] as const).map((mins) => {
                const label = mins === 90 ? '1hr 30' : `${mins} min`;
                const selected = pickerMins === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    style={[timerStyles.presetBtn, selected && timerStyles.presetBtnActive]}
                    onPress={() => setPickerMins(mins)}
                  >
                    <Text style={[timerStyles.presetText, selected && timerStyles.presetTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom stepper */}
            <View style={timerStyles.stepperRow}>
              <TouchableOpacity
                style={timerStyles.stepperBtn}
                onPress={() => setPickerMins((v) => Math.max(5, v - 5))}
              >
                <Text style={timerStyles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={timerStyles.stepperValue}>{pickerMins} min</Text>
              <TouchableOpacity
                style={timerStyles.stepperBtn}
                onPress={() => setPickerMins((v) => Math.min(180, v + 5))}
              >
                <Text style={timerStyles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm */}
            <TouchableOpacity
              style={timerStyles.confirmBtn}
              onPress={() => {
                applyTimerSelection('countdown', pickerMins);
                setShowTimerPicker(false);
              }}
            >
              <Text style={timerStyles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>

            {/* Stop (only when a countdown is running) */}
            {sessionTimerActive && (
              <TouchableOpacity
                style={timerStyles.stopBtn}
                onPress={() => { stopSessionTimer(); setSessionMode('countup'); setShowTimerPicker(false); }}
              >
                <Ionicons name="stop-circle-outline" size={18} color={COLORS.danger} />
                <Text style={timerStyles.stopBtnText}>Stop countdown</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Rest duration adjustment sheet */}
      <Modal visible={showRestSheet} animationType="slide" transparent>
        <View style={timerStyles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowRestSheet(false)} />
          <View style={timerStyles.sheet}>
            <View style={timerStyles.header}>
              <Text style={timerStyles.title}>
                {currentRestExercise ? currentRestExercise : 'Rest Timer'}
              </Text>
              <TouchableOpacity onPress={() => setShowRestSheet(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={timerStyles.restAdjustRow}>
              <TouchableOpacity
                style={timerStyles.restAdjBtn}
                onPress={() => setRestSheetDuration((v) => Math.max(60, v - 30))}
              >
                <Text style={timerStyles.restAdjBtnText}>−30s</Text>
              </TouchableOpacity>
              <Text style={timerStyles.restDurationText}>{formatRestTime(restSheetDuration)}</Text>
              <TouchableOpacity
                style={timerStyles.restAdjBtn}
                onPress={() => setRestSheetDuration((v) => Math.min(600, v + 30))}
              >
                <Text style={timerStyles.restAdjBtnText}>+30s</Text>
              </TouchableOpacity>
            </View>
            {currentRestExercise && (
              <TouchableOpacity
                style={timerStyles.saveRestBtn}
                onPress={async () => {
                  const updated = { ...restTimes, [currentRestExercise.toLowerCase()]: restSheetDuration };
                  setRestTimes(updated);
                  await saveRestTime(currentRestExercise, restSheetDuration);
                  startRestTimer(currentRestExercise, restSheetDuration);
                  setShowRestSheet(false);
                }}
              >
                <Text style={timerStyles.saveRestBtnText}>Save & Apply</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={timerStyles.stopBtn}
              onPress={() => { skipRestTimer(); setShowRestSheet(false); }}
            >
              <Ionicons name="stop-circle-outline" size={18} color={COLORS.danger} />
              <Text style={timerStyles.stopBtnText}>Skip rest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PR Celebration overlay */}
      {prOverlay.length > 0 && (
        <Animated.View style={[styles.prOverlay, { opacity: prOpacity }]}>
          <Animated.View style={[styles.prOverlayCard, { transform: [{ scale: prScale }] }]}>
            <Text style={styles.prOverlayEmoji}>🏆</Text>
            <Text style={styles.prOverlayTitle}>NEW PR</Text>
            {prOverlay.map((pr, i) => (
              <Text key={i} style={styles.prOverlayExercise}>
                {pr.exercise}
              </Text>
            ))}
            {prOverlay.map((pr, i) => (
              <Text key={`w-${i}`} style={styles.prOverlayWeight}>
                {pr.weight}kg × {pr.reps}
              </Text>
            ))}
            <Text style={styles.prOverlayLine}>
              {prOverlay.length === 1
                ? `${prOverlay[0].weight}kg ${prOverlay[0].exercise}. Noted. Now do it again.`
                : `${prOverlay.length} PRs today. Days like this are why you show up.`}
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── New Rest Timer Components ───────────────────────────────────────────────

function getMuscleGroup(name: string): string {
  const l = name.toLowerCase();
  if (/bench|chest|pec|incline dumbbell press|dumbbell chest|chest fly|cable fly|push.?up/.test(l)) return 'Chest';
  if (/\brow\b|lat pull|pulldown|pull.?up|chin.?up|cable row|seated cable row|dumbbell row|pendlay/.test(l)) return 'Back';
  if (/hip thrust|glute bridge|glute/.test(l)) return 'Glutes';
  if (/romanian|rdl|\bdeadlift\b/.test(l)) return 'Hamstrings';
  if (/squat|leg press|hack squat|bulgarian|\blunge\b|leg extension/.test(l)) return 'Legs';
  if (/overhead press|lateral raise|front raise|rear delt|shoulder press/.test(l)) return 'Shoulders';
  if (/bicep curl|hammer curl|preacher curl|concentration curl/.test(l)) return 'Biceps';
  if (/tricep|skull crusher|overhead tricep|weighted dip/.test(l)) return 'Triceps';
  if (/calf raise|standing calf|seated calf|\bcalf\b/.test(l)) return 'Calves';
  if (/plank|crunch|ab wheel|leg raise|russian twist|sit.?up/.test(l)) return 'Abs';
  return 'Full Body';
}

function LiquidTimer({
  size,
  progress,
  remaining,
  complete,
}: {
  size: number;
  progress: number;
  remaining: number;
  complete: boolean;
}) {
  const fillHeight = Math.round(size * progress);
  const borderAlpha = (0.2 + progress * 0.5).toFixed(2);
  const borderColor = `rgba(232,255,0,${borderAlpha})`;
  const textColor = progress > 0.5 ? '#000000' : '#ffffff';
  const fontSize = size < 60 ? 12 : 20;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = complete ? 'GO' : `${mins}:${secs.toString().padStart(2, '0')}`;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: '#111',
        borderWidth: 2,
        borderColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: fillHeight,
          backgroundColor: '#e8ff00',
        }}
      />
      <Text
        style={{
          fontSize,
          fontWeight: '900',
          color: textColor,
          textAlign: 'center',
          fontVariant: ['tabular-nums'] as any,
          zIndex: 1,
        }}
      >
        {timeStr}
      </Text>
    </View>
  );
}

function RestTimerStrip({
  remaining,
  total,
  exerciseName,
  complete,
  onSkip,
  onAdjust,
}: {
  remaining: number;
  total: number;
  exerciseName: string | null;
  complete: boolean;
  onSkip: () => void;
  onAdjust: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
  const muscleLabel = getMuscleGroup(exerciseName ?? '');

  useEffect(() => {
    if (complete) setExpanded(false);
  }, [complete]);

  const stripTitle = complete ? 'Ready for next set' : `Resting · ${exerciseName ?? ''}`;

  if (expanded) {
    return (
      <View style={restStripStyles.expandedPanel}>
        <TouchableOpacity style={restStripStyles.collapseRow} onPress={() => setExpanded(false)}>
          <Text style={restStripStyles.collapseText}>↓ collapse</Text>
        </TouchableOpacity>
        <View style={restStripStyles.expandedBody}>
          <LiquidTimer size={90} progress={progress} remaining={remaining} complete={complete} />
          <Text style={restStripStyles.muscleLabel}>
            {muscleLabel.toUpperCase()} RECOVERING
          </Text>
          <View style={restStripStyles.expandedBtnRow}>
            <TouchableOpacity style={restStripStyles.expandedBtn} onPress={onAdjust}>
              <Text style={restStripStyles.expandedBtnText}>Adjust</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={restStripStyles.expandedBtn}
              onPress={() => { onSkip(); setExpanded(false); }}
            >
              <Text style={[restStripStyles.expandedBtnText, { color: '#e74c3c' }]}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={restStripStyles.collapsed}
      onPress={() => !complete && setExpanded(true)}
      activeOpacity={0.9}
    >
      <LiquidTimer size={52} progress={progress} remaining={remaining} complete={complete} />
      <View style={restStripStyles.stripMid}>
        <Text style={restStripStyles.stripTitle} numberOfLines={1}>
          {stripTitle}
        </Text>
        {!complete && <Text style={restStripStyles.stripHint}>Tap to expand</Text>}
      </View>
      {!complete && <Text style={restStripStyles.arrowUp}>↑</Text>}
      {!complete && (
        <TouchableOpacity
          onPress={onSkip}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={restStripStyles.stripSkip}>Skip</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Set Row ─────────────────────────────────────────────────────────────────

interface SetRowProps {
  setNum: number;
  set: SetLog;
  onWeightDelta: (d: number) => void;
  onRepsDelta: (d: number) => void;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
  onToggle: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

function SetRow({
  setNum, set, onWeightDelta, onRepsDelta,
  onWeightChange, onRepsChange, onToggle, onRemove, canRemove,
}: SetRowProps) {
  const [flashWeight, setFlashWeight] = useState(false);
  const [flashReps, setFlashReps] = useState(false);
  const [showError, setShowError] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleToggle() {
    if (!set.completed && (set.weight === 0 || set.reps === 0)) {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashWeight(set.weight === 0);
      setFlashReps(set.reps === 0);
      setShowError(true);
      flashTimer.current = setTimeout(() => {
        setFlashWeight(false);
        setFlashReps(false);
        setShowError(false);
      }, 1500);
      return;
    }
    onToggle();
  }

  return (
    <View>
      <View style={setStyles.row}>
        <View style={setStyles.setNumWrap}>
          <Text style={setStyles.setNum}>{setNum}</Text>
        </View>
        <View style={[setStyles.counterGroup, flashWeight && setStyles.counterGroupError]}>
          <TouchableOpacity style={setStyles.adjBtn} onPress={() => onWeightDelta(-1)}>
            <Text style={setStyles.adjText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={setStyles.valueInput}
            value={set.weight === 0 ? '' : String(set.weight)}
            onChangeText={onWeightChange}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
            selectTextOnFocus
          />
          <TouchableOpacity style={setStyles.adjBtn} onPress={() => onWeightDelta(1)}>
            <Text style={setStyles.adjText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={[setStyles.counterGroup, flashReps && setStyles.counterGroupError]}>
          <TouchableOpacity style={setStyles.adjBtn} onPress={() => onRepsDelta(-1)}>
            <Text style={setStyles.adjText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={setStyles.valueInput}
            value={set.reps === 0 ? '' : String(set.reps)}
            onChangeText={onRepsChange}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
            selectTextOnFocus
          />
          <TouchableOpacity style={setStyles.adjBtn} onPress={() => onRepsDelta(1)}>
            <Text style={setStyles.adjText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[setStyles.doneBtn, set.completed ? setStyles.doneBtnActive : setStyles.doneBtnEmpty]}
          onPress={handleToggle}
          onLongPress={canRemove ? onRemove : undefined}
        >
          <Ionicons
            name={set.completed ? 'checkmark' : 'checkmark-outline'}
            size={18}
            color={set.completed ? '#000000' : 'rgba(255,255,255,0.45)'}
          />
        </TouchableOpacity>
      </View>
      {showError && (
        <Text style={setStyles.errorText}>Add weight and reps first</Text>
      )}
    </View>
  );
}

// ─── Example PPL Templates ────────────────────────────────────────────────────

const EXAMPLE_TEMPLATES = [
  {
    label: 'Push Day',
    exercises: [
      { name: 'Bench Press', sets: 4, reps: 8 },
      { name: 'Overhead Press', sets: 3, reps: 8 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: 10 },
      { name: 'Cable Lateral Raise', sets: 4, reps: 15 },
      { name: 'Tricep Pushdown', sets: 3, reps: 12 },
    ],
  },
  {
    label: 'Pull Day',
    exercises: [
      { name: 'Barbell Row', sets: 4, reps: 8 },
      { name: 'Pull-Up', sets: 4, reps: 8 },
      { name: 'Lat Pulldown', sets: 3, reps: 10 },
      { name: 'Face Pull', sets: 3, reps: 15 },
      { name: 'Bicep Curl', sets: 3, reps: 12 },
    ],
  },
  {
    label: 'Leg Day',
    exercises: [
      { name: 'Barbell Back Squat', sets: 4, reps: 8 },
      { name: 'Romanian Deadlift', sets: 4, reps: 8 },
      { name: 'Leg Press', sets: 3, reps: 12 },
      { name: 'Leg Curl', sets: 3, reps: 12 },
      { name: 'Calf Raise', sets: 4, reps: 20 },
    ],
  },
];

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Idle Screen ─────────────────────────────────────────────────────────────

interface IdleScreenProps {
  onStart: () => void;
  sessions: WorkoutSession[];
  templates: WorkoutTemplate[];
  savedProgram: SavedProgram | null;
  onLoadTemplate: (t: WorkoutTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onLoadProgramSession: (exercises: { name: string; sets: number; reps: number }[]) => void;
}

function IdleScreen({ onStart, sessions, templates, savedProgram, onLoadTemplate, onDeleteTemplate, onLoadProgramSession }: IdleScreenProps) {
  const lastSession = sessions[0];

  function confirmLoadTemplate(t: WorkoutTemplate) {
    Alert.alert(
      `Load "${t.name}"`,
      `Load ${t.exercises.length} exercise${t.exercises.length !== 1 ? 's' : ''} and start?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Load & Start', onPress: () => onLoadTemplate(t) },
      ]
    );
  }

  function confirmDeleteTemplate(t: WorkoutTemplate) {
    Alert.alert('Delete template?', `"${t.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteTemplate(t.id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.idleHeader}>
          <Text style={styles.screenTitle}>Workout</Text>
          <Text style={styles.screenSubtitle}>
            {sessions.length === 0 ? 'Log your first session.' : `${sessions.length} sessions logged.`}
          </Text>
        </View>

        <TouchableOpacity style={styles.bigStartButton} onPress={onStart}>
          <Ionicons name="barbell" size={28} color={COLORS.background} />
          <Text style={styles.bigStartText}>Start session</Text>
        </TouchableOpacity>

        {/* Quick log hint */}
        <View style={styles.quickHintCard}>
          <Ionicons name="flash-outline" size={16} color={COLORS.accent} />
          <Text style={styles.quickHintText}>
            Log any lift instantly — type it like a note, and it organises itself. No menus, no tapping.
          </Text>
        </View>

        {/* Routines section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Routines</Text>
          {savedProgram ? (
            savedProgram.program.sessions.map((s, i) => {
              const dayIdx = savedProgram.program.trainingDayIndices?.[i];
              const dayLabel = dayIdx !== undefined ? DAY_ABBR[dayIdx] : null;
              const routineTitle = dayLabel ? `${s.label} — ${dayLabel}` : s.label;
              return (
              <TouchableOpacity
                key={i}
                style={styles.routineCard}
                onPress={() =>
                  onLoadProgramSession(
                    s.exercises.map((e) => ({
                      name: e.name,
                      sets: e.sets,
                      reps: parseInt(e.reps.split('-')[0], 10) || 8,
                    }))
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.routineLeft}>
                  <Text style={styles.routineName}>{routineTitle}</Text>
                  <Text style={styles.routineMeta}>
                    {s.exercises.length} exercise{s.exercises.length !== 1 ? 's' : ''} · {s.exercises.map((e) => e.name).slice(0, 2).join(', ')}{s.exercises.length > 2 ? '…' : ''}
                  </Text>
                </View>
                <View style={styles.loadBtn}>
                  <Ionicons name="play" size={14} color={COLORS.background} />
                  <Text style={styles.loadBtnText}>Start</Text>
                </View>
              </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.routineEmpty}>
              <Text style={styles.routineEmptyText}>
                No routines yet. Build a program or create your own routine below.
              </Text>
            </View>
          )}
        </View>

        {/* Templates section */}
        {templates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Templates</Text>
            {templates.map((t) => (
              <View key={t.id} style={styles.templateCard}>
                <TouchableOpacity
                  style={styles.templateMain}
                  onPress={() => confirmLoadTemplate(t)}
                  activeOpacity={0.7}
                >
                  <View style={styles.templateLeft}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <Text style={styles.templateMeta}>
                      {t.exercises.map((e) => e.name).join(', ')}
                    </Text>
                    <Text style={styles.templateCount}>
                      {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={styles.loadBtn}>
                    <Ionicons name="play" size={14} color={COLORS.background} />
                    <Text style={styles.loadBtnText}>Load</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.templateDelete}
                  onPress={() => confirmDeleteTemplate(t)}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}


        {lastSession && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Last session</Text>
            {lastSession.exercises.map((ex, i) => {
              const suggestion = getSuggestion(ex.name, sessions);
              return (
                <View key={i} style={styles.lastExCard}>
                  <View style={styles.lastExHeader}>
                    <Text style={styles.lastExName}>{ex.name}</Text>
                    {suggestion && suggestion.weight > 0 && (
                      <View style={styles.nextBadge}>
                        <Text
                          style={[
                            styles.lastExSuggestion,
                            suggestion.type === 'increase' && { color: COLORS.accent },
                            suggestion.type === 'deload' && { color: COLORS.warning },
                          ]}
                        >
                          Next: {suggestion.weight}kg
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.lastExSets}>
                    {ex.sets
                      .filter((s) => s.completed && s.weight > 0)
                      .map((s) => `${s.weight}kg×${s.reps}`)
                      .join('  ') || '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  idleHeader: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    gap: 4,
  },
  screenTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.text },
  screenSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  bigStartButton: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  bigStartText: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.background },
  quickHintCard: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quickHintText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, flex: 1 },
  // Routines
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  routineLeft: { flex: 1, gap: 3 },
  routineName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  routineMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  routineEmpty: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  routineEmptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  exampleTag: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  loadBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  loadBtnOutlineText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.accent,
  },
  section: { marginHorizontal: SPACING.xl, gap: SPACING.sm, marginBottom: SPACING.xl },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  // Templates
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  templateMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  templateLeft: { flex: 1, gap: 2 },
  templateName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  templateMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    numberOfLines: 1,
  } as any,
  templateCount: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  loadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  loadBtnText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.background },
  templateDelete: {
    padding: SPACING.md,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  // Last session
  lastExCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  lastExHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastExName: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text, flex: 1 },
  nextBadge: { backgroundColor: COLORS.border, borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 2 },
  lastExSuggestion: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.textSecondary },
  lastExSets: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  // Session timer toggle in header
  // Volume display
  volumeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  volumeNum: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.text,
  },
  volumeComp: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    flex: 1,
  },
  volumeTooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accentDim,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent + '40',
  },
  volumeTooltipTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.accent,
  },
  volumeTooltipBody: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  volumeGotItBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
  },
  volumeGotItText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.background,
  },
  // Active header
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  discardText: { fontSize: FONT_SIZE.md, color: COLORS.danger, fontWeight: '600' },
  activeTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  headerCenter: { alignItems: 'center', gap: 2 },
  elapsedTimer: {
    fontSize: 13,
    color: '#888',
    fontVariant: ['tabular-nums'] as any,
  },
  elapsedTimerWarning: {
    color: '#e8ff00',
  },
  timerHint: {
    fontSize: 10,
    color: '#555',
    textAlign: 'center',
  },
  finishButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  finishButtonText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.background },
  // Exercise card
  exerciseCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  exHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  exName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text, flex: 1 },
  exHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  watchFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  watchFormText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  perSideLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  perSideToggle: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  perSideToggleActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent + '80',
  },
  perSideToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  perSideToggleTextActive: {
    color: COLORS.accent,
  },
  exerciseCardDragging: {
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 16,
  },
  exerciseCardDropTarget: {
    borderTopColor: COLORS.accent,
    borderTopWidth: 2,
  },
  reorderHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accentDim,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent + '40',
  },
  reorderHintText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  prevLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginBottom: SPACING.xs },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  suggestionIncrease: { backgroundColor: COLORS.accentDim },
  suggestionDeload: { backgroundColor: 'rgba(255,136,0,0.12)' },
  suggestionText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, flex: 1, flexWrap: 'wrap' },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.xs,
  },
  setHeaderText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginTop: SPACING.xs,
  },
  addSetText: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '600' },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  addExerciseText: { fontSize: FONT_SIZE.md, color: COLORS.accent, fontWeight: '700' },
  // Running log strip
  runningLog: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  runningLogName: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    maxWidth: 90,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  runningLogSets: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  runningSetChip: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  runningSetText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text,
    fontWeight: '600',
  },
  // Floating quick log button
  quickFab: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  quickModalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  quickPanel: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    gap: SPACING.xs,
  },
  quickPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quickPanelInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  quickPanelSend: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPanelError: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    paddingHorizontal: SPACING.xs,
  },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  searchInput: {
    margin: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  exerciseItemText: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: '500' },
  // PR Overlay
  prOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  prOverlayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.accent,
    padding: SPACING.xxl,
    alignItems: 'center',
    marginHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  prOverlayEmoji: { fontSize: 48 },
  prOverlayTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 4,
  },
  prOverlayExercise: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  prOverlayWeight: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.accent },
  prOverlayLine: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
});

const setStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, gap: SPACING.sm },
  setNumWrap: { width: 28, alignItems: 'center', gap: 2 },
  setNum: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  counterGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  adjBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  adjText: { fontSize: 18, color: COLORS.text, fontWeight: '300' },
  valueInput: {
    flex: 1, height: 36, textAlign: 'center',
    fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text,
  },
  doneBtn: {
    width: 36, height: 36, borderRadius: RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  doneBtnEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  doneBtnActive: {
    backgroundColor: '#e8ff00',
    borderWidth: 0,
  },
  counterGroupError: {
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
});

const timerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  presets: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  presetBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  presetText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  presetTextActive: { color: COLORS.accent },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: '300',
    lineHeight: 26,
  },
  stepperValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 80,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.background,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  stopBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.danger,
  },
  restAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
  },
  restAdjBtn: {
    width: 72,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  restAdjBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  restDurationText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'] as any,
    minWidth: 100,
    textAlign: 'center',
  },
  saveRestBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveRestBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.background,
  },
});

const restStripStyles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#181818',
    gap: 12,
  },
  stripMid: {
    flex: 1,
    gap: 2,
  },
  stripTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  stripHint: {
    fontSize: 10,
    color: '#333',
  },
  arrowUp: {
    fontSize: 16,
    color: '#333',
  },
  expandedPanel: {
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#181818',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 14,
  },
  collapseRow: {
    alignSelf: 'flex-end',
  },
  collapseText: {
    fontSize: 12,
    color: '#444',
  },
  expandedBody: {
    alignItems: 'center',
    gap: 12,
  },
  muscleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1.5,
  },
  stripSkip: {
    fontSize: 11,
    color: '#666',
  },
  expandedBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  expandedBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  expandedBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});

