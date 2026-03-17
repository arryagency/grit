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
import { useState } from 'react';
import { router } from 'expo-router';
import { saveProfile, UserProfile } from '@/utils/storage';
import { scheduleWorkoutNotifications } from '@/utils/notifications';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EQUIPMENT_OPTIONS = ['Full gym', 'Dumbbells only', 'Barbell + rack', 'Bodyweight only', 'Mixed/home gym'];
const GOAL_OPTIONS = ['Build strength', 'Build muscle', 'Lose fat', 'Athletic performance', 'General fitness'];
const GYM_TIME_OPTIONS = [
  { label: '6am', value: '06:00' },
  { label: '7am', value: '07:00' },
  { label: '8am', value: '08:00' },
  { label: '9am', value: '09:00' },
  { label: '12pm', value: '12:00' },
  { label: '5pm', value: '17:00' },
  { label: '6pm', value: '18:00' },
  { label: '7pm', value: '19:00' },
  { label: '8pm', value: '20:00' },
];

const TOTAL_STEPS = 7;

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [trainingAge, setTrainingAge] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [goal, setGoal] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [trainingDays, setTrainingDays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri
  const [equipment, setEquipment] = useState('');
  const [gymTime, setGymTime] = useState('');
  const [injuries, setInjuries] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleDay(day: number) {
    setTrainingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleFinish() {
    setSaving(true);
    const profile: UserProfile = {
      name: name.trim() || 'Athlete',
      trainingAge: trainingAge as UserProfile['trainingAge'],
      goal,
      daysPerWeek,
      trainingDays: trainingDays.sort(),
      gymTime: gymTime || undefined,
      equipment,
      injuries,
      onboardingComplete: true,
      createdAt: new Date().toISOString(),
    };
    await saveProfile(profile);
    await scheduleWorkoutNotifications(trainingDays, gymTime || undefined).catch(() => {});
    router.replace('/(tabs)');
  }

  function canAdvance() {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return trainingAge !== '';
    if (step === 2) return goal !== '';
    if (step === 3) return trainingDays.length > 0;
    if (step === 4) return equipment !== '';
    if (step === 5) return true; // gym time is optional
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
              <Text style={styles.subText}>Be honest. It changes your programme.</Text>
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

          {/* Step 3 – Training days */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 4 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>Which days do you train?</Text>
              <Text style={styles.subText}>Tap to toggle. We'll schedule reminders around this.</Text>
              <View style={styles.daysGrid}>
                {DAY_LABELS.map((label, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayButton, trainingDays.includes(i) && styles.dayButtonActive]}
                    onPress={() => toggleDay(i)}
                  >
                    <Text style={[styles.dayLabel, trainingDays.includes(i) && styles.dayLabelActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.subText}>{trainingDays.length} day{trainingDays.length !== 1 ? 's' : ''} selected</Text>
            </View>
          )}

          {/* Step 4 – Equipment */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 5 of {TOTAL_STEPS}</Text>
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

          {/* Step 5 – Gym time */}
          {step === 5 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 6 of {TOTAL_STEPS}</Text>
              <Text style={styles.question}>What time do you usually train?</Text>
              <Text style={styles.subText}>
                We'll send a heads-up 15 mins before, and follow up if you skip.
              </Text>
              <View style={styles.daysGrid}>
                {GYM_TIME_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.timeButton, gymTime === opt.value && styles.dayButtonActive]}
                    onPress={() => setGymTime(gymTime === opt.value ? '' : opt.value)}
                  >
                    <Text style={[styles.dayLabel, gymTime === opt.value && styles.dayLabelActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.subText}>Optional — tap to select, tap again to clear.</Text>
            </View>
          )}

          {/* Step 6 – Injuries */}
          {step === 6 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepLabel}>Step 7 of {TOTAL_STEPS}</Text>
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
  timeButton: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
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
