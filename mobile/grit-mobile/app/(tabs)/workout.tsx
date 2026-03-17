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
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getSessions,
  saveSession,
  updatePRs,
  WorkoutSession,
  ExerciseLog,
  SetLog,
  generateId,
  getLastSessionForExercise,
} from '@/utils/storage';
import { getSuggestion, parseQuickLog } from '@/utils/progressiveOverload';
import { ALL_EXERCISES } from '@/constants/exercises';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

function emptySet(weight = 0, reps = 8): SetLog {
  return { weight, reps, completed: false, isPR: false };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Sleep = 'good' | 'bad' | null;
type Food = 'good' | 'bad' | null;

interface CheckIn {
  sleep: Sleep;
  food: Food;
  creatine: boolean | null;
}

function getCheckInLine(sleep: Sleep, food: Food): string {
  if (sleep === 'bad' && food === 'bad')
    return "You're running on empty. Don't ego lift today — keep it technical.";
  if (sleep === 'bad' && food === 'good')
    return 'Short on sleep. Keep the intensity controlled today.';
  if (sleep === 'good' && food === 'bad')
    return "Decent sleep but not fuelled. Hydrate well and keep it manageable.";
  return "You're set up right. Good session incoming.";
}

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

  // Quick log
  const [quickText, setQuickText] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickWarmUp, setQuickWarmUp] = useState(false);
  // Track last-logged exercise so we can show a running set list
  const [lastLoggedExercise, setLastLoggedExercise] = useState<string | null>(null);

  // Check-in
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckIn>({ sleep: null, food: null, creatine: null });

  // PR celebration
  const [prOverlay, setPrOverlay] = useState<{ exercise: string; weight: number; reps: number }[]>([]);
  const prScale = useRef(new Animated.Value(0.4)).current;
  const prOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      getSessions().then(setAllSessions);
    }, [])
  );

  const filteredExercises = search.trim()
    ? ALL_EXERCISES.filter((e) => e.toLowerCase().includes(search.toLowerCase()))
    : ALL_EXERCISES;

  // ─── Check-In Flow ──────────────────────────────────────────────────────────

  function onPressStart() {
    setCheckIn({ sleep: null, food: null, creatine: null });
    setShowCheckIn(true);
  }

  function confirmCheckIn() {
    setShowCheckIn(false);
    doStartWorkout();
  }

  function doStartWorkout() {
    setStartTime(new Date());
    setIsActive(true);
    setSession({
      id: generateId(),
      date: new Date().toISOString(),
      exercises: [],
      duration: 0,
      notes: '',
    });
  }

  // ─── Exercise Management ────────────────────────────────────────────────────

  function addExercise(name: string) {
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
    setSession((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      const sets = [...ex.sets];
      sets[setIdx] = { ...sets[setIdx], completed: !sets[setIdx].completed };
      ex.sets = sets;
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  // ─── Quick Log ──────────────────────────────────────────────────────────────

  function handleQuickLog() {
    const text = quickText.trim();
    if (!text) return;

    const parsed = parseQuickLog(text);
    if (!parsed) {
      setQuickError('e.g. "bench 80 8" or "bench 80 4x8" or "warm up bench 60 10"');
      return;
    }

    // The W toggle in the bar overrides the parsed warmUp flag
    const isWarmUp = parsed.warmUp || quickWarmUp;

    setQuickError('');
    setLastLoggedExercise(parsed.exerciseName);
    setQuickWarmUp(false); // reset toggle after log

    setSession((prev) => {
      const existingIdx = prev.exercises.findIndex(
        (e) => e.name.toLowerCase() === parsed.exerciseName.toLowerCase()
      );
      const newSets: SetLog[] = Array.from({ length: parsed.sets }, () => ({
        weight: parsed.weight,
        reps: parsed.reps,
        completed: true,
        isPR: false,
        warmUp: isWarmUp,
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
    setQuickText('');
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

      setIsActive(false);
      setAllSessions(await getSessions());

      if (newPRs.length > 0) {
        // Show PR overlay briefly then navigate to summary
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
      { text: 'Discard', style: 'destructive', onPress: () => setIsActive(false) },
    ]);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!isActive) {
    return (
      <>
        <IdleScreen onStart={onPressStart} sessions={allSessions} />
        <CheckInModal
          visible={showCheckIn}
          checkIn={checkIn}
          onChange={setCheckIn}
          onConfirm={confirmCheckIn}
          onSkip={confirmCheckIn}
        />
      </>
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
          <Text style={styles.activeTitle}>In Progress</Text>
          <TouchableOpacity
            style={[styles.finishButton, saving && { opacity: 0.5 }]}
            onPress={finishWorkout}
            disabled={saving}
          >
            <Text style={styles.finishButtonText}>{saving ? 'Saving…' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {session.exercises.map((ex, exIdx) => {
            const lastEx = getLastSessionForExercise(ex.name, allSessions);
            const suggestion = getSuggestion(ex.name, allSessions);
            return (
              <View key={exIdx} style={styles.exerciseCard}>
                <View style={styles.exHeader}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                    <Ionicons name="close" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>

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
              </View>
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
                    <View key={i} style={[styles.runningSetChip, s.warmUp && styles.runningSetChipWarm]}>
                      <Text style={[styles.runningSetText, s.warmUp && styles.runningSetTextWarm]}>
                        {s.warmUp ? 'W ' : ''}{s.weight}×{s.reps}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          );
        })()}

        {/* Quick Log Bar */}
        <View style={styles.quickLogBar}>
          <TouchableOpacity
            style={[styles.warmUpToggle, quickWarmUp && styles.warmUpToggleActive]}
            onPress={() => setQuickWarmUp((v) => !v)}
          >
            <Text style={[styles.warmUpToggleText, quickWarmUp && styles.warmUpToggleTextActive]}>W</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.quickLogInput}
            value={quickText}
            onChangeText={(t) => { setQuickText(t); setQuickError(''); }}
            placeholder='bench 80 8  ·  squat 100 3x5'
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleQuickLog}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.quickLogSend} onPress={handleQuickLog}>
            <Ionicons name="flash" size={20} color={COLORS.background} />
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
          />
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

// ─── Check-In Modal ───────────────────────────────────────────────────────────

interface CheckInModalProps {
  visible: boolean;
  checkIn: CheckIn;
  onChange: (c: CheckIn) => void;
  onConfirm: () => void;
  onSkip: () => void;
}

function CheckInModal({ visible, checkIn, onChange, onConfirm, onSkip }: CheckInModalProps) {
  const allAnswered = checkIn.sleep !== null && checkIn.food !== null && checkIn.creatine !== null;
  const line = checkIn.sleep !== null && checkIn.food !== null
    ? getCheckInLine(checkIn.sleep, checkIn.food)
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent>
      <View style={ciStyles.overlay}>
        <View style={ciStyles.sheet}>
          <View style={ciStyles.header}>
            <Text style={ciStyles.title}>Pre-session check</Text>
            <TouchableOpacity onPress={onSkip}>
              <Text style={ciStyles.skip}>Skip</Text>
            </TouchableOpacity>
          </View>

          <Text style={ciStyles.question}>How did you sleep?</Text>
          <View style={ciStyles.row}>
            {(['good', 'bad'] as const).map((v) => (
              <TouchableOpacity
                key={v}
                style={[ciStyles.pill, checkIn.sleep === v && ciStyles.pillActive]}
                onPress={() => onChange({ ...checkIn, sleep: v })}
              >
                <Text style={[ciStyles.pillText, checkIn.sleep === v && ciStyles.pillTextActive]}>
                  {v === 'good' ? 'Slept well' : 'Rough night'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={ciStyles.question}>Have you eaten today?</Text>
          <View style={ciStyles.row}>
            {(['good', 'bad'] as const).map((v) => (
              <TouchableOpacity
                key={v}
                style={[ciStyles.pill, checkIn.food === v && ciStyles.pillActive]}
                onPress={() => onChange({ ...checkIn, food: v })}
              >
                <Text style={[ciStyles.pillText, checkIn.food === v && ciStyles.pillTextActive]}>
                  {v === 'good' ? 'Fuelled' : 'Not really'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={ciStyles.question}>Creatine today?</Text>
          <View style={ciStyles.row}>
            {([true, false] as const).map((v) => (
              <TouchableOpacity
                key={String(v)}
                style={[ciStyles.pill, checkIn.creatine === v && ciStyles.pillActive]}
                onPress={() => onChange({ ...checkIn, creatine: v })}
              >
                <Text style={[ciStyles.pillText, checkIn.creatine === v && ciStyles.pillTextActive]}>
                  {v ? 'Yes' : 'Not yet'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {line && (
            <View style={ciStyles.gritLine}>
              <Text style={ciStyles.gritLineText}>{line}</Text>
            </View>
          )}

          {checkIn.creatine === false && (
            <View style={ciStyles.creatineReminder}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.warning} />
              <Text style={ciStyles.creatineText}>Take your creatine before you forget.</Text>
            </View>
          )}

          <TouchableOpacity
            style={[ciStyles.startBtn, !allAnswered && ciStyles.startBtnDisabled]}
            onPress={allAnswered ? onConfirm : undefined}
          >
            <Text style={ciStyles.startBtnText}>Start session</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
        {set.warmUp && <Text style={setStyles.warmBadge}>W</Text>}
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
      <TouchableOpacity
        style={[setStyles.doneBtn, set.completed && setStyles.doneBtnActive]}
        onPress={onToggle}
        onLongPress={canRemove ? onRemove : undefined}
      >
        <Ionicons
          name={set.completed ? 'checkmark' : 'checkmark-outline'}
          size={18}
          color={set.completed ? COLORS.background : COLORS.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

// ─── Idle Screen ─────────────────────────────────────────────────────────────

function IdleScreen({ onStart, sessions }: { onStart: () => void; sessions: WorkoutSession[] }) {
  const lastSession = sessions[0];
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
            During a session: type <Text style={{ color: COLORS.accent }}>bench 80 4x8</Text> to log instantly
          </Text>
        </View>

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
  section: { marginHorizontal: SPACING.xl, gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
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
  runningSetChipWarm: {
    backgroundColor: 'rgba(255,136,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,136,0,0.3)',
  },
  runningSetText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text,
    fontWeight: '600',
  },
  runningSetTextWarm: {
    color: COLORS.warning,
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
  warmUpToggle: {
    width: 36,
    height: 40,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  warmUpToggleActive: {
    backgroundColor: 'rgba(255,136,0,0.15)',
    borderColor: COLORS.warning,
  },
  warmUpToggleText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  warmUpToggleTextActive: {
    color: COLORS.warning,
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
  warmBadge: { fontSize: 9, fontWeight: '800', color: COLORS.warning, letterSpacing: 0.5 },
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
    backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  doneBtnActive: { backgroundColor: COLORS.accent },
});

const ciStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  skip: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '600' },
  question: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text, marginTop: SPACING.xs },
  row: { flexDirection: 'row', gap: SPACING.sm },
  pill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  pillActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  pillText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.accent },
  gritLine: {
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    marginTop: SPACING.xs,
  },
  gritLineText: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontStyle: 'italic' },
  creatineReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  creatineText: { fontSize: FONT_SIZE.xs, color: COLORS.warning },
  startBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  startBtnDisabled: { opacity: 0.35 },
  startBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.background },
});
