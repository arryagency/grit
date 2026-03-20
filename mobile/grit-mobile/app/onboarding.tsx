import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useState, useRef, useEffect, memo } from 'react';
import { router } from 'expo-router';
import { saveProfile, UserProfile } from '@/utils/storage';
// notifications are scheduled when program is saved, not at onboarding
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

// day labels removed — days are selected in program builder
const EQUIPMENT_OPTIONS = ['Full gym', 'Dumbbells only', 'Barbell + rack', 'Bodyweight only', 'Mixed/home gym'];
const GOAL_OPTIONS = ['Build strength', 'Build muscle', 'Lose fat', 'Athletic performance', 'General fitness'];

// ─── Time picker data ─────────────────────────────────────────────────────────

interface TimeOption { label: string; value: string }

function buildTimes(): TimeOption[] {
  const times: TimeOption[] = [];
  for (let h = 5; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 23 && m > 0) break;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const value = `${hh}:${mm}`;
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? 'pm' : 'am';
      const label = m === 0 ? `${h12}:00 ${ampm}` : `${h12}:${mm} ${ampm}`;
      times.push({ label, value });
    }
  }
  return times;
}

const TIME_OPTIONS = buildTimes();
const TIME_ITEM_H = 52;
const PICKER_VISIBLE = 5; // odd number so middle item is the selected one
const PICKER_H = TIME_ITEM_H * PICKER_VISIBLE;

const TOTAL_STEPS = 7;

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [trainingAge, setTrainingAge] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [goal, setGoal] = useState('');
  const [equipment, setEquipment] = useState('');
  const [gymTime, setGymTime] = useState('');
  const [injuries, setInjuries] = useState('');
  const [userMode, setUserMode] = useState<'guided' | 'self' | ''>('');
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    setSaving(true);
    const profile: UserProfile = {
      name: name.trim() || 'Athlete',
      trainingAge: trainingAge as UserProfile['trainingAge'],
      goal,
      gymTime: gymTime || undefined,
      equipment,
      injuries,
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
      userMode: (userMode as 'guided' | 'self') || 'guided',
    };
    await saveProfile(profile);
    if (userMode === 'guided') {
      router.replace('/programme' as any);
    } else {
      router.replace('/(tabs)');
    }
  }

  function canAdvance() {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return trainingAge !== '';
    if (step === 2) return goal !== '';
    if (step === 3) return equipment !== '';
    if (step === 4) return true; // gym time is optional
    if (step === 5) return true; // injuries optional
    if (step === 6) return userMode !== '';
    return true;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>GRIT</Text>
          <View style={styles.progressBar}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[styles.progressDot, i <= step && styles.progressDotActive]}
              />
            ))}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step 0 – Name */}
          {step === 0 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 1 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>What do we call you?</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="First name"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => canAdvance() && setStep(1)}
              />
            </View>
          )}

          {/* Step 1 – Training age */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 2 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>How long have you been training consistently?</Text>
              <Text style={styles.subText}>Be honest. It changes your program.</Text>
              {(
                [
                  { value: 'beginner', label: 'Beginner', sub: 'Under 12 months consistent training' },
                  { value: 'intermediate', label: 'Intermediate', sub: '1–3 years consistent training' },
                  { value: 'advanced', label: 'Advanced', sub: '3+ years with intent and structure' },
                ] as const
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionCard, trainingAge === opt.value && styles.optionCardActive]}
                  onPress={() => setTrainingAge(opt.value)}
                >
                  <Text style={[styles.optionLabel, trainingAge === opt.value && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 2 – Goal */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 3 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>What's the goal, {name}?</Text>
              {GOAL_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.optionCard, goal === g && styles.optionCardActive]}
                  onPress={() => setGoal(g)}
                >
                  <Text style={[styles.optionLabel, goal === g && styles.optionLabelActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 3 – Equipment */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 4 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>What equipment do you have access to?</Text>
              {EQUIPMENT_OPTIONS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.optionCard, equipment === e && styles.optionCardActive]}
                  onPress={() => setEquipment(e)}
                >
                  <Text style={[styles.optionLabel, equipment === e && styles.optionLabelActive]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 4 – Gym time */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 5 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>What time do you usually train?</Text>
              <Text style={styles.subText}>
                We'll send a heads-up 15 mins before, and check in if you skip.
              </Text>
              <GymTimePicker value={gymTime} onChange={setGymTime} />
              {gymTime ? (
                <View style={styles.selectedTimeRow}>
                  <Text style={styles.selectedTimeText}>
                    Selected: {TIME_OPTIONS.find(t => t.value === gymTime)?.label ?? gymTime}
                  </Text>
                  <TouchableOpacity onPress={() => setGymTime('')}>
                    <Text style={styles.clearTimeText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.subText}>Optional — scroll to your time, tap to confirm.</Text>
              )}
            </View>
          )}

          {/* Step 5 – Injuries */}
          {step === 5 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 6 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>Any injuries or limitations to know about?</Text>
              <Text style={styles.subText}>Optional. Skip if nothing relevant.</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={injuries}
                onChangeText={setInjuries}
                placeholder="e.g. bad left knee, lower back issues..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>
          )}

          {/* Step 6 – How to use GRIT */}
          {step === 6 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 7 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>How do you want to use GRIT?</Text>
              <Text style={styles.subText}>You can change this later in Settings.</Text>
              {(
                [
                  {
                    value: 'guided' as const,
                    label: 'Build me a program',
                    sub: 'Get a personalised training plan, progressive overload guidance, and full coaching features.',
                  },
                  {
                    value: 'self' as const,
                    label: "I'll plan my own workouts",
                    sub: 'Just tracking — log sessions, track PRs, and monitor progress your way.',
                  },
                ]
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionCard, userMode === opt.value && styles.optionCardActive]}
                  onPress={() => setUserMode(opt.value)}
                >
                  <Text style={[styles.optionLabel, userMode === opt.value && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Footer buttons */}
        <View style={styles.footer}>
          {step > 0 && (
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(step - 1)}>
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextButton, !canAdvance() && styles.nextButtonDisabled]}
            onPress={() => {
              if (!canAdvance()) return;
              if (step < TOTAL_STEPS - 1) {
                setStep(step + 1);
              } else {
                handleFinish();
              }
            }}
            disabled={saving}
          >
            <Text style={styles.nextButtonText}>
              {step === TOTAL_STEPS - 1 ? (saving ? 'Setting up...' : "Let's go") : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Gym Time Picker Component ────────────────────────────────────────────────

/**
 * Single row — memoized. React.memo's comparator means only the 2 rows whose
 * `isSelected` prop actually changes will do any work when selection updates.
 * All other 71 rows are skipped entirely. This is the key to zero-lag selection.
 */
const TimeItem = memo(function TimeItem({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={pickerStyles.item} activeOpacity={0.6} onPress={onPress}>
      <Text style={[pickerStyles.itemText, isSelected && pickerStyles.itemTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

/**
 * Performance strategy:
 *  - Plain ScrollView (not FlatList) — simpler, no virtualisation overhead
 *  - localSelected state lives inside this component; parent re-renders don't touch it
 *  - onScrollEndDrag fires the instant the finger lifts → accent highlight appears
 *    immediately, not after the snap animation completes
 *  - onMomentumScrollEnd corrects the value if a fling carried the scroll further
 *  - React.memo on TimeItem means only 2 rows re-render per selection change
 */
const GymTimePicker = memo(function GymTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [localSelected, setLocalSelected] = useState(
    () => value || TIME_OPTIONS[12].value
  );

  const initialOffset = useRef(
    Math.max(0, TIME_OPTIONS.findIndex((t) => t.value === (value || TIME_OPTIONS[12].value))) *
      TIME_ITEM_H
  );

  // Sync when parent clears value via the "Clear" button
  useEffect(() => {
    if (!value && localSelected !== TIME_OPTIONS[12].value) {
      setLocalSelected(TIME_OPTIONS[12].value);
      scrollRef.current?.scrollTo({ y: 12 * TIME_ITEM_H, animated: true });
    }
  }, [value]);

  function commitIdx(rawY: number) {
    const idx = Math.max(
      0,
      Math.min(Math.round(rawY / TIME_ITEM_H), TIME_OPTIONS.length - 1)
    );
    const v = TIME_OPTIONS[idx].value;
    setLocalSelected(v);
    onChangeRef.current(v);
  }

  return (
    <View style={pickerStyles.wrapper}>
      <View pointerEvents="none" style={pickerStyles.selectionBand} />
      <ScrollView
        ref={scrollRef}
        style={{ height: PICKER_H }}
        contentContainerStyle={{
          paddingVertical: TIME_ITEM_H * Math.floor(PICKER_VISIBLE / 2),
        }}
        contentOffset={{ x: 0, y: initialOffset.current }}
        snapToInterval={TIME_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        // Instant feedback the moment the finger lifts (rounds to snap position)
        onScrollEndDrag={(e) => commitIdx(e.nativeEvent.contentOffset.y)}
        // Correction after a fling carries the scroll to a different position
        onMomentumScrollEnd={(e) => commitIdx(e.nativeEvent.contentOffset.y)}
      >
        {TIME_OPTIONS.map((item, index) => (
          <TimeItem
            key={item.value}
            label={item.label}
            isSelected={item.value === localSelected}
            onPress={() => {
              scrollRef.current?.scrollTo({ y: index * TIME_ITEM_H, animated: true });
              setLocalSelected(item.value);
              onChangeRef.current(item.value);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
});

const pickerStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.md,
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: TIME_ITEM_H * Math.floor(PICKER_VISIBLE / 2),
    height: TIME_ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
    zIndex: 1,
  },
  item: {
    height: TIME_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  itemTextSelected: {
    color: COLORS.accent,
    fontWeight: '800',
    fontSize: FONT_SIZE.xl,
  },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  kav: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 6,
  },
  progressBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  progressDot: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  progressDotActive: {
    backgroundColor: COLORS.accent,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  stepContainer: {
    gap: SPACING.md,
  },
  stepLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  question: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 34,
    marginBottom: SPACING.sm,
  },
  subText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    color: COLORS.text,
    fontSize: FONT_SIZE.lg,
    marginTop: SPACING.sm,
  },
  textArea: {
    height: 96,
    textAlignVertical: 'top',
    paddingTop: SPACING.md,
  },
  optionCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  optionCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  optionLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionLabelActive: {
    color: COLORS.accent,
  },
  optionSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
    marginTop: SPACING.sm,
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  selectedTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  selectedTimeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '700',
  },
  clearTimeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  dayButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  dayLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  dayLabelActive: {
    color: COLORS.background,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  backButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  nextButton: {
    flex: 2,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.3,
  },
  nextButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.background,
  },
});
