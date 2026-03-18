import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useRef } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const API_BASE = 'http://192.168.1.105:3000';

type Goal = 'strength' | 'muscle' | 'fat-loss' | 'athletic';
type TrainingDays = 1 | 2 | 3 | 4 | 5 | 6;

interface ProgrammeAnswers {
  goal: Goal | null;
  daysPerWeek: TrainingDays | null;
  busyDays: string;
  trainingTime: string;
  sessionDuration: string;
}

const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: 'strength', label: 'Strength', description: 'Bigger lifts. Prioritise compound movements and progressive overload.' },
  { value: 'muscle', label: 'Muscle', description: 'Build size and mass. Hypertrophy-focused training with higher volume.' },
  { value: 'fat-loss', label: 'Fat Loss', description: 'Lean out while preserving muscle. Higher frequency, metabolic sessions.' },
  { value: 'athletic', label: 'Athletic', description: 'Power, speed, and conditioning. Functional strength training.' },
];

const STEP_LABELS = [
  'Your goal',
  'Days per week',
  'Your schedule',
  'Training time',
  'Your programme',
];

export default function ProgrammeScreen() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ProgrammeAnswers>({
    goal: null,
    daysPerWeek: null,
    busyDays: '',
    trainingTime: '',
    sessionDuration: '',
  });
  const [loading, setLoading] = useState(false);
  const [programme, setProgramme] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  function goBack() {
    if (step === 0) {
      router.back();
    } else if (step < 4) {
      setStep((s) => s - 1);
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return answers.goal !== null;
      case 1: return answers.daysPerWeek !== null;
      case 2: return answers.busyDays.trim().length > 0;
      case 3: return answers.trainingTime.trim().length > 0 && answers.sessionDuration.trim().length > 0;
      default: return false;
    }
  }

  async function generateProgramme() {
    setStep(4);
    setLoading(true);
    setError('');
    setProgramme('');

    const goalLabels: Record<Goal, string> = {
      strength: 'Strength (bigger lifts)',
      muscle: 'Muscle building (hypertrophy)',
      'fat-loss': 'Fat loss (while preserving muscle)',
      athletic: 'Athletic performance',
    };

    const prompt = `Generate a complete, specific, personalised weekly workout programme for me based on my information:

GOAL: ${goalLabels[answers.goal!]}
TRAINING DAYS PER WEEK: ${answers.daysPerWeek} days
BUSY/HARD DAYS: ${answers.busyDays}
USUAL TRAINING TIME: ${answers.trainingTime}
SESSION DURATION: ${answers.sessionDuration} minutes available

Requirements:
- Build the programme around my schedule (avoid heavy sessions on my busy days)
- Be specific: name each day, list exercises with sets and reps
- Include warm-up recommendations
- Explain the weekly structure and why you chose it
- For each session, note roughly how long it should take
- If I only have 30 minutes on a day, suggest a condensed version I can do
- Keep the tone direct and practical, no fluff

Format it clearly with headers for each training day.`;

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          workoutHistory: [],
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let result = '';

      if (!reader) throw new Error('No response body');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'delta' && parsed.text) {
              result += parsed.text;
              setProgramme(result);
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          } catch (_) {}
        }
      }

      if (!result) throw new Error('No programme generated');
    } catch (e: any) {
      if (e?.message?.includes('Network request failed') || e?.message?.includes('fetch')) {
        setError(
          "Can't reach the GRIT server. Make sure the backend is running and your phone is on the same network."
        );
      } else {
        setError(`Failed to generate programme: ${e?.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setStep(0);
    setAnswers({
      goal: null,
      daysPerWeek: null,
      busyDays: '',
      trainingTime: '',
      sessionDuration: '',
    });
    setProgramme('');
    setError('');
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={12} disabled={step === 4 && loading}>
            <Ionicons
              name="arrow-back"
              size={22}
              color={step === 4 && loading ? COLORS.textMuted : COLORS.text}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Build my programme</Text>
            {step < 4 && (
              <Text style={styles.headerStep}>
                Step {step + 1} of {STEP_LABELS.length}
              </Text>
            )}
          </View>
          <View style={{ width: 22 }} />
        </View>

        {/* Progress bar */}
        {step < 4 && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
          </View>
        )}

        {/* Step content */}
        {step === 0 && (
          <ScrollView contentContainerStyle={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your goal?</Text>
            <Text style={styles.stepSubtitle}>GRIT will build your programme around this.</Text>
            <View style={styles.optionList}>
              {GOAL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionCard,
                    answers.goal === opt.value && styles.optionCardActive,
                  ]}
                  onPress={() => setAnswers((a) => ({ ...a, goal: opt.value }))}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionTop}>
                    <Text style={[
                      styles.optionLabel,
                      answers.goal === opt.value && styles.optionLabelActive,
                    ]}>
                      {opt.label}
                    </Text>
                    {answers.goal === opt.value && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                    )}
                  </View>
                  <Text style={styles.optionDesc}>{opt.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {step === 1 && (
          <ScrollView contentContainerStyle={styles.stepContent}>
            <Text style={styles.stepTitle}>How many days per week?</Text>
            <Text style={styles.stepSubtitle}>Be realistic. Consistency beats ambition.</Text>
            <View style={styles.daysGrid}>
              {([2, 3, 4, 5, 6] as TrainingDays[]).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.dayChip,
                    answers.daysPerWeek === d && styles.dayChipActive,
                  ]}
                  onPress={() => setAnswers((a) => ({ ...a, daysPerWeek: d }))}
                >
                  <Text style={[
                    styles.dayChipNum,
                    answers.daysPerWeek === d && styles.dayChipNumActive,
                  ]}>
                    {d}
                  </Text>
                  <Text style={[
                    styles.dayChipLabel,
                    answers.daysPerWeek === d && styles.dayChipLabelActive,
                  ]}>
                    {d === 2 ? 'Full body' : d === 3 ? 'Push/Pull/Legs' : d === 4 ? 'Upper/Lower' : d === 5 ? 'PPL + Arms' : 'Daily'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView contentContainerStyle={styles.stepContent}>
            <Text style={styles.stepTitle}>Which days are hardest?</Text>
            <Text style={styles.stepSubtitle}>
              Tell GRIT about your week — work deadlines, long days, commute days, etc.
              GRIT will avoid placing heavy sessions there.
            </Text>
            <TextInput
              style={styles.textArea}
              value={answers.busyDays}
              onChangeText={(t) => setAnswers((a) => ({ ...a, busyDays: t }))}
              placeholder="e.g. Monday and Wednesday are long work days. Friday I usually finish late. Weekends are free."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              autoFocus
            />
          </ScrollView>
        )}

        {step === 3 && (
          <ScrollView contentContainerStyle={styles.stepContent}>
            <Text style={styles.stepTitle}>When do you train?</Text>
            <Text style={styles.stepSubtitle}>
              GRIT uses this to make sure the programme fits your actual life.
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Usual training time</Text>
              <TextInput
                style={styles.textInput}
                value={answers.trainingTime}
                onChangeText={(t) => setAnswers((a) => ({ ...a, trainingTime: t }))}
                placeholder="e.g. 6pm after work, 7am before work"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>How long do you usually have? (minutes)</Text>
              <TextInput
                style={styles.textInput}
                value={answers.sessionDuration}
                onChangeText={(t) => setAnswers((a) => ({ ...a, sessionDuration: t }))}
                placeholder="e.g. 60, or 45 on weekdays / 75 on weekends"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="default"
              />
            </View>
          </ScrollView>
        )}

        {step === 4 && (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.programmeContent}
            showsVerticalScrollIndicator={false}
          >
            {loading && (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Building your programme…</Text>
                <Text style={styles.loadingSubText}>
                  Analysing your schedule and goal. This takes a few seconds.
                </Text>
              </View>
            )}

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons name="warning-outline" size={24} color={COLORS.warning} />
                <Text style={styles.errorTitle}>Couldn't reach GRIT</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={generateProgramme}>
                  <Text style={styles.retryBtnText}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={restart} style={styles.restartLink}>
                  <Text style={styles.restartLinkText}>Start over</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {programme ? (
              <>
                <View style={styles.programmeHeader}>
                  <Text style={styles.programmeBadge}>YOUR PROGRAMME</Text>
                  <Text style={styles.programmeGoalLabel}>
                    {GOAL_OPTIONS.find((g) => g.value === answers.goal)?.label} — {answers.daysPerWeek} days/week
                  </Text>
                </View>
                <View style={styles.programmeCard}>
                  <Text style={styles.programmeText}>{programme}</Text>
                </View>
                <TouchableOpacity style={styles.newProgrammeBtn} onPress={restart}>
                  <Ionicons name="refresh" size={16} color={COLORS.background} />
                  <Text style={styles.newProgrammeBtnText}>Generate new programme</Text>
                </TouchableOpacity>
                <View style={{ height: 40 }} />
              </>
            ) : null}
          </ScrollView>
        )}

        {/* Next/Generate button */}
        {step < 4 && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
              onPress={step === 3 ? generateProgramme : () => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              <Text style={styles.nextBtnText}>
                {step === 3 ? 'Build my programme' : 'Next'}
              </Text>
              {step === 3 && (
                <Ionicons name="sparkles" size={16} color={COLORS.background} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  headerStep: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  progressBar: {
    height: 3,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },
  stepContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  stepTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.text,
  },
  stepSubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginTop: -SPACING.sm,
  },
  // Goal options
  optionList: { gap: SPACING.sm },
  optionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  optionCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  optionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  optionLabelActive: { color: COLORS.accent },
  optionDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  // Days grid
  daysGrid: {
    gap: SPACING.sm,
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  dayChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  dayChipNum: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.textSecondary,
    width: 32,
  },
  dayChipNumActive: { color: COLORS.accent },
  dayChipLabel: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: '600' },
  dayChipLabelActive: { color: COLORS.text },
  // Text inputs
  textArea: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    lineHeight: 22,
    minHeight: 140,
  },
  inputGroup: { gap: SPACING.xs },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  // Footer
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
  },
  nextBtnDisabled: { opacity: 0.3 },
  nextBtnText: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.background },
  // Programme output
  programmeContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  loadingState: {
    paddingVertical: SPACING.xxl * 2,
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  loadingSubText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xl,
  },
  errorTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  errorText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  retryBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.background },
  restartLink: { marginTop: SPACING.xs },
  restartLinkText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '600' },
  programmeHeader: {
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  programmeBadge: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 2,
  },
  programmeGoalLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  programmeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  programmeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    lineHeight: 22,
  },
  newProgrammeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
  },
  newProgrammeBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.background },
});
