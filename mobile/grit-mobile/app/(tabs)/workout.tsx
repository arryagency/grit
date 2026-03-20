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
  Easing,
  Linking,
  Share,
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
  ExerciseLog,
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
  // Track last-logged exercise so we can show a running set list
  const [lastLoggedExercise, setLastLoggedExercise] = useState<string | null>(null);
  // Per-exercise memory: last logged weight/reps for context-aware parsing
  const [lastLoggedWeights, setLastLoggedWeights] = useState<Record<string, number>>({});
  const [lastLoggedRepsMap, setLastLoggedRepsMap] = useState<Record<string, number>>({});
  // Rotating placeholder text
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Session timer
  const [sessionTimerMins, setSessionTimerMins] = useState<number | null>(null);
  const [sessionTimerSecs, setSessionTimerSecs] = useState(0);
  const [sessionTimerActive, setSessionTimerActive] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [customTimerInput, setCustomTimerInput] = useState('');
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionFiveNotified = useRef(false);

  // Drag-to-reorder state
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragToIdx, setDragToIdx] = useState<number | null>(null);
  const dragFromIdxRef = useRef<number | null>(null);
  const dragToIdxRef = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const dragY = useRef(new Animated.Value(0)).current;
  const dragPanActive = useRef(false); // true once PanResponder takes over the touch

  // Reorder hint toast
  const [reorderHintVisible, setReorderHintVisible] = useState(false);
  const reorderHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Volume tooltip (shown once, then comparison mode)
  const [hasSeenVolume, setHasSeenVolume] = useState(false);


  // PR celebration
  const [prOverlay, setPrOverlay] = useState<{ exercise: string; weight: number; reps: number }[]>([]);
  const prScale = useRef(new Animated.Value(0.4)).current;
  const prOpacity = useRef(new Animated.Value(0)).current;

  // ─── Rest Timer ─────────────────────────────────────────────────────────────
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(180);
  const [restTimerDefault, setRestTimerDefault] = useState(180);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restCompleteScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    getSettings().then((s) => {
      setRestTimerDefault(s.restTimerDefault);
      setRestRemaining(s.restTimerDefault);
    });
    AsyncStorage.getItem('@grit/hasSeenVolumeTooltip').then((v) => {
      if (v === 'true') setHasSeenVolume(true);
    });
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (reorderHintTimer.current) clearTimeout(reorderHintTimer.current);
    };
  }, []);

  function startRestTimer() {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestRemaining(restTimerDefault);
    setRestTimerActive(true);

    restIntervalRef.current = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(restIntervalRef.current!);
          setRestTimerActive(false);
          onRestComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function skipRestTimer() {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTimerActive(false);
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

    // Pulse animation
    Animated.sequence([
      Animated.timing(restCompleteScale, { toValue: 1.15, duration: 150, useNativeDriver: true }),
      Animated.timing(restCompleteScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(restCompleteScale, { toValue: 1.1, duration: 100, useNativeDriver: true }),
      Animated.timing(restCompleteScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  }

  function formatRestTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Session Timer ───────────────────────────────────────────────────────────

  function startSessionTimer(mins: number) {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    setSessionTimerMins(mins);
    setSessionTimerSecs(mins * 60);
    setSessionTimerActive(true);
    sessionFiveNotified.current = false;
    sessionTimerRef.current = setInterval(() => {
      setSessionTimerSecs((prev) => {
        if (prev === 5 * 60 + 1 && !sessionFiveNotified.current) {
          sessionFiveNotified.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            const Notifications = require('expo-notifications');
            Notifications.scheduleNotificationAsync({
              content: { title: 'GRIT', body: '5 minutes left in your session.' },
              trigger: null,
            });
          } catch (_) {}
        }
        if (prev <= 1) {
          clearInterval(sessionTimerRef.current!);
          setSessionTimerActive(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning), 400);
          Alert.alert("Time's up", "Wrap it up. Log your final sets and finish.");
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

  // ─── Volume helpers ──────────────────────────────────────────────────────────

  function computeSessionVolume(s: WorkoutSession): number {
    return s.exercises.reduce(
      (total, ex) =>
        total +
        ex.sets.reduce(
          (sum, set) => sum + (set.completed && set.weight > 0 ? set.weight * set.reps : 0),
          0
        ),
      0
    );
  }

  function formatVolume(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}t`;
    return `${Math.round(v)}kg`;
  }

  async function dismissVolumeTooltip() {
    await AsyncStorage.setItem('@grit/hasSeenVolumeTooltip', 'true');
    setHasSeenVolume(true);
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

  async function doStartWorkout() {
    stopSessionTimer();
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

    // Show reorder hint for first 3 sessions
    try {
      const raw = await AsyncStorage.getItem('@grit/reorderHintCount');
      const count = raw ? parseInt(raw, 10) : 0;
      if (count < 3) {
        await AsyncStorage.setItem('@grit/reorderHintCount', String(count + 1));
        setReorderHintVisible(true);
        if (reorderHintTimer.current) clearTimeout(reorderHintTimer.current);
        reorderHintTimer.current = setTimeout(() => {
          setReorderHintVisible(false);
        }, 3000);
      }
    } catch (_) {}
  }

  // ─── Template Load ───────────────────────────────────────────────────────────

  function loadTemplate(template: WorkoutTemplate) {
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
        { name, sets: [emptySet(defaultWeight, 8)] },
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

    // Validate before marking complete
    if (willBeCompleted) {
      const set = session.exercises[exIdx]?.sets[setIdx];
      if (!set || set.weight === 0 || set.reps === 0) {
        Alert.alert('Missing info', 'Enter weight and reps before completing this set.');
        return;
      }
    }

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
      startRestTimer();
    }
  }

  // ─── Quick Log ──────────────────────────────────────────────────────────────

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
      // Never show a generic error — ask for the specific missing piece
      setQuickError(getMissingPieceQuestion(text, lastLoggedExercise));
      return;
    }

    setQuickError('');
    setQuickText('');

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

    const finalSession: WorkoutSession = { ...session, duration };

    setSaving(true);
    try {
      await saveSession(finalSession);
      const newPRs = await updatePRs(finalSession);

      // Analyse progression suggestions
      const updatedSessions = await getSessions();
      await analyseProgressionSuggestions(finalSession, updatedSessions);

      // Stop rest timer
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
      setRestTimerActive(false);
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
          <TouchableOpacity style={styles.timerToggleBtn} onPress={() => setShowTimerPicker(true)}>
            <Ionicons
              name="timer-outline"
              size={14}
              color={sessionTimerActive ? (sessionTimerSecs <= 300 ? COLORS.warning : COLORS.accent) : COLORS.textMuted}
            />
            {sessionTimerActive ? (
              <Text style={[styles.sessionCountdown, sessionTimerSecs <= 300 && { color: COLORS.warning }]}>
                {formatRestTime(sessionTimerSecs)}
              </Text>
            ) : (
              <Text style={styles.activeTitle}>In Progress</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.finishButton, saving && { opacity: 0.5 }]}
            onPress={finishWorkout}
            disabled={saving}
          >
            <Text style={styles.finishButtonText}>{saving ? 'Saving…' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>

        {/* Rest Timer Banner */}
        {restTimerActive && (
          <Animated.View
            style={[
              styles.restTimerBanner,
              { transform: [{ scale: restCompleteScale }] },
              restRemaining <= 10 && styles.restTimerBannerUrgent,
            ]}
          >
            <View style={styles.restTimerLeft}>
              <Ionicons
                name="timer-outline"
                size={20}
                color={restRemaining <= 10 ? COLORS.warning : COLORS.accent}
              />
              <Text style={styles.restTimerLabel}>REST</Text>
            </View>
            <Text
              style={[
                styles.restTimerCount,
                restRemaining <= 10 && { color: COLORS.warning },
              ]}
            >
              {formatRestTime(restRemaining)}
            </Text>
            <View style={styles.restTimerRight}>
              <View style={styles.restProgressBar}>
                <View
                  style={[
                    styles.restProgressFill,
                    {
                      width: `${((restTimerDefault - restRemaining) / restTimerDefault) * 100}%`,
                      backgroundColor: restRemaining <= 10 ? COLORS.warning : COLORS.accent,
                    },
                  ]}
                />
              </View>
              <TouchableOpacity onPress={skipRestTimer} style={styles.restSkipBtn}>
                <Text style={styles.restSkipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {restTimerActive === false && restRemaining === 0 && (
          <View style={styles.restReadyBanner}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={styles.restReadyText}>Rest done. Back to work.</Text>
          </View>
        )}

        {reorderHintVisible && (
          <View style={styles.reorderHintBanner}>
            <Ionicons name="reorder-three" size={16} color={COLORS.accent} />
            <Text style={styles.reorderHintText}>Hold an exercise header to drag and reorder</Text>
          </View>
        )}

        {/* Volume display — educational tooltip first time, comparison after */}
        {(() => {
          const vol = computeSessionVolume(session);
          if (vol === 0) return null;
          const lastVol = allSessions.length > 0 ? computeSessionVolume(allSessions[0]) : 0;
          if (!hasSeenVolume) {
            return (
              <View style={styles.volumeTooltip}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.volumeTooltipTitle}>Volume = sets × reps × weight</Text>
                  <Text style={styles.volumeTooltipBody}>
                    Increase it over time. That's progressive overload.
                  </Text>
                </View>
                <TouchableOpacity onPress={dismissVolumeTooltip} style={styles.volumeGotItBtn}>
                  <Text style={styles.volumeGotItText}>Got it</Text>
                </TouchableOpacity>
              </View>
            );
          }
          const diff = vol - lastVol;
          return (
            <View style={styles.volumeBar}>
              <Ionicons name="barbell-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.volumeNum}>{formatVolume(vol)}</Text>
              {lastVol > 0 && (
                <Text style={[styles.volumeComp, { color: diff >= 0 ? COLORS.success : COLORS.warning }]}>
                  {diff > 0
                    ? `↑ from ${formatVolume(lastVol)} last session — keep going.`
                    : diff === 0
                    ? `= matched ${formatVolume(lastVol)} last session.`
                    : `↓ from ${formatVolume(lastVol)} last session — lower than usual.`}
                </Text>
              )}
            </View>
          );
        })()}

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
                  <Text style={styles.exName}>{ex.name}</Text>
                  <View style={styles.exHeaderActions}>
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

        {/* Running set log for last-logged exercise */}
        {lastLoggedExercise && (() => {
          const ex = session.exercises.find(
            (e) => e.name.toLowerCase() === lastLoggedExercise.toLowerCase()
          );
          const doneSets = ex?.sets.filter((s) => s.completed) ?? [];
          if (doneSets.length === 0) return null;
          return (
            <View style={styles.runningLog}>
              <Text style={styles.runningLogName} numberOfLines={1}>{lastLoggedExercise}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={styles.runningLogSets}>
                  {doneSets.map((s, i) => (
                    <View key={i} style={styles.runningSetChip}>
                      <Text style={styles.runningSetText}>{s.weight}×{s.reps}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          );
        })()}

        {/* Quick Log hint label */}
        <View style={styles.quickLogHintRow}>
          <Ionicons name="flash" size={12} color={COLORS.accent} />
          <Text style={styles.quickLogHintText}>
            Type any lift to log it instantly
          </Text>
          <Text style={styles.quickLogHintExample}>bench 80 8 · squat 100 5</Text>
        </View>

        {/* Quick Log Bar */}
        <View style={styles.quickLogBar}>
          <TextInput
            style={styles.quickLogInput}
            value={quickText}
            onChangeText={(t) => { setQuickText(t); setQuickError(''); }}
            placeholder={QUICK_PLACEHOLDERS[placeholderIdx]}
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleQuickLog}
            autoCorrect={false}
            autoCapitalize="none"
            editable={!quickParsing}
            scrollEnabled={true}
            multiline={false}
            numberOfLines={1}
            textAlignVertical="center"
          />
          <TouchableOpacity
            style={[styles.quickLogSend, quickParsing && { opacity: 0.5 }]}
            onPress={handleQuickLog}
            disabled={quickParsing}
          >
            <Ionicons name={quickParsing ? 'ellipsis-horizontal' : 'flash'} size={20} color={COLORS.background} />
          </TouchableOpacity>
          {quickError ? <Text style={styles.quickLogError}>{quickError}</Text> : null}
        </View>
      </KeyboardAvoidingView>

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
          <View style={timerStyles.sheet}>
            <View style={timerStyles.header}>
              <Text style={timerStyles.title}>Session timer</Text>
              <TouchableOpacity onPress={() => setShowTimerPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={timerStyles.presets}>
              {[30, 45, 60, 90].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    timerStyles.presetBtn,
                    sessionTimerActive && sessionTimerMins === mins && timerStyles.presetBtnActive,
                  ]}
                  onPress={() => { startSessionTimer(mins); setShowTimerPicker(false); }}
                >
                  <Text
                    style={[
                      timerStyles.presetText,
                      sessionTimerActive && sessionTimerMins === mins && timerStyles.presetTextActive,
                    ]}
                  >
                    {mins} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={timerStyles.customRow}>
              <TextInput
                style={timerStyles.customInput}
                value={customTimerInput}
                onChangeText={setCustomTimerInput}
                placeholder="Custom minutes"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={timerStyles.customBtn}
                onPress={() => {
                  const mins = parseInt(customTimerInput, 10);
                  if (mins > 0 && mins <= 300) {
                    startSessionTimer(mins);
                    setShowTimerPicker(false);
                    setCustomTimerInput('');
                  }
                }}
              >
                <Text style={timerStyles.customBtnText}>Set</Text>
              </TouchableOpacity>
            </View>
            {sessionTimerActive && (
              <TouchableOpacity
                style={timerStyles.stopBtn}
                onPress={() => { stopSessionTimer(); setShowTimerPicker(false); }}
              >
                <Ionicons name="stop-circle-outline" size={18} color={COLORS.danger} />
                <Text style={timerStyles.stopBtnText}>Stop timer</Text>
              </TouchableOpacity>
            )}
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
  return (
    <View style={[setStyles.row, set.completed && setStyles.rowCompleted]}>
      <View style={setStyles.setNumWrap}>
        <Text style={setStyles.setNum}>{setNum}</Text>
      </View>
      <View style={setStyles.counterGroup}>
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
      <View style={setStyles.counterGroup}>
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
      {(() => {
        const hasValues = set.weight > 0 && set.reps > 0;
        const btnStyle = set.completed
          ? setStyles.doneBtnActive
          : hasValues
          ? setStyles.doneBtnReady
          : setStyles.doneBtnEmpty;
        const iconColor = set.completed || hasValues ? COLORS.background : '#555555';
        return (
          <TouchableOpacity
            style={[setStyles.doneBtn, btnStyle]}
            onPress={onToggle}
            onLongPress={canRemove ? onRemove : undefined}
          >
            <Ionicons
              name={set.completed ? 'checkmark' : 'checkmark-outline'}
              size={18}
              color={iconColor}
            />
          </TouchableOpacity>
        );
      })()}
    </View>
  );
}

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
            savedProgram.program.sessions.map((s, i) => (
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
                  <Text style={styles.routineName}>{s.label}</Text>
                  <Text style={styles.routineMeta}>
                    {s.exercises.length} exercise{s.exercises.length !== 1 ? 's' : ''} · {s.exercises.map((e) => e.name).slice(0, 2).join(', ')}{s.exercises.length > 2 ? '…' : ''}
                  </Text>
                </View>
                <View style={styles.loadBtn}>
                  <Ionicons name="play" size={14} color={COLORS.background} />
                  <Text style={styles.loadBtnText}>Start</Text>
                </View>
              </TouchableOpacity>
            ))
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
  // Quick log hint row inside active session
  quickLogHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accentDim,
    borderTopWidth: 1,
    borderTopColor: COLORS.accent + '30',
  },
  quickLogHintText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.accent,
    fontWeight: '700',
    flex: 1,
  },
  quickLogHintExample: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
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
  timerToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionCountdown: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'] as any,
  },
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
  finishButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  finishButtonText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.background },
  // Rest timer
  restTimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accentDim,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent + '40',
    gap: SPACING.sm,
  },
  restTimerBannerUrgent: {
    backgroundColor: 'rgba(255,136,0,0.12)',
    borderBottomColor: COLORS.warning + '40',
  },
  restTimerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restTimerLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 2,
  },
  restTimerCount: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
    minWidth: 70,
    textAlign: 'center',
  },
  restTimerRight: {
    flex: 1,
    gap: SPACING.xs,
    alignItems: 'flex-end',
  },
  restProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  restProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  restSkipBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  restSkipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  restReadyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0,204,68,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,204,68,0.2)',
  },
  restReadyText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.success,
  },
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
  // Quick Log Bar
  quickLogBar: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  quickLogInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  quickLogSend: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLogError: {
    position: 'absolute',
    bottom: 62,
    left: SPACING.lg,
    right: SPACING.lg,
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
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
  rowCompleted: { opacity: 0.55 },
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
  doneBtnEmpty: { backgroundColor: '#2a2a2a' },
  doneBtnReady: { backgroundColor: COLORS.accent },
  doneBtnActive: { backgroundColor: COLORS.accent },
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
  customRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  customInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  customBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  customBtnText: {
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
});

