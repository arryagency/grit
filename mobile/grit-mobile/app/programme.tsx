import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Alert,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import {
  buildProgramme,
  mapProfileGoal,
  type Goal,
  type Experience,
  type TrainingDays,
  type Gender,
  type Programme,
} from '@/utils/programmeBuilder';
import {
  getProfile,
  getProgrammePrefs,
  saveProgrammePrefs,
  saveProgramme as saveToStorage,
  getSavedProgramme,
} from '@/utils/storage';

// ─── Types ──────────────────────────────────────────────────────────

interface Answers {
  goal: Goal | null;
  experience: Experience | null;
  daysPerWeek: TrainingDays | null;
  trainingDays: number[] | null; // specific weekday indices 1=Mon…6=Sat
  gender: Gender | null;
}

// ─── Option Data ────────────────────────────────────────────────────

const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: 'muscle',   label: 'Build Muscle',   description: 'Hypertrophy-focused. Higher volume, 6-12 rep ranges, progressive overload.' },
  { value: 'strength', label: 'Build Strength', description: 'Drive your squat, bench, deadlift and press numbers up. Heavy compounds, 3-6 reps.' },
  { value: 'fat-loss', label: 'Lose Fat',        description: 'Preserve muscle in a deficit. Loads stay heavy — the deficit does the rest.' },
  { value: 'fitness',  label: 'General Fitness', description: 'Well-rounded strength and conditioning base. Mixed rep ranges, sustainable pace.' },
];

const EXPERIENCE_OPTIONS: { value: Experience; label: string; sub: string; description: string }[] = [
  { value: 'beginner',     label: 'Beginner',     sub: 'Under 12 months', description: 'Linear progression adds weight every session. Keep it simple.' },
  { value: 'intermediate', label: 'Intermediate', sub: '1-3 years',       description: 'Linear progress has slowed. Double progression keeps gains coming.' },
  { value: 'advanced',     label: 'Advanced',     sub: '3+ years',        description: 'Require wave loading and higher volume to force further adaptation.' },
];

const DAY_OPTIONS: { value: TrainingDays; label: string; split: string }[] = [
  { value: 2, label: '2 days', split: 'Full Body ×2' },
  { value: 3, label: '3 days', split: 'Full Body A/B' },
  { value: 4, label: '4 days', split: 'Upper / Lower' },
  { value: 5, label: '5 days', split: 'PPL + Upper/Lower' },
  { value: 6, label: '6 days', split: 'Push / Pull / Legs ×2' },
];

const GENDER_OPTIONS: { value: Gender; label: string; description: string }[] = [
  { value: 'male',   label: 'Male',   description: 'Standard volume and rep ranges.' },
  { value: 'female', label: 'Female', description: '+20% volume, higher rep ranges, shorter rest, glute priority.' },
];

const WEEKDAYS: { index: number; short: string; long: string }[] = [
  { index: 1, short: 'MON', long: 'Monday' },
  { index: 2, short: 'TUE', long: 'Tuesday' },
  { index: 3, short: 'WED', long: 'Wednesday' },
  { index: 4, short: 'THU', long: 'Thursday' },
  { index: 5, short: 'FRI', long: 'Friday' },
  { index: 6, short: 'SAT', long: 'Saturday' },
  { index: 0, short: 'SUN', long: 'Sunday' },
];

const LOADING_MESSAGES = [
  'Analysing your training profile…',
  'Calculating optimal volume…',
  'Structuring your weekly split…',
  'Applying progressive overload model…',
  'Finalising your programme…',
];

const MUSCLE_GROUP_COLORS: Record<string, string> = {
  'CHEST':     '#e8ff00',
  'BACK':      '#4dd0e1',
  'SHOULDERS': '#ce93d8',
  'QUADS':     '#80cbc4',
  'HAMSTRINGS':'#ffb74d',
  'GLUTES':    '#f48fb1',
  'BICEPS':    '#a5d6a7',
  'TRICEPS':   '#ef9a9a',
  'CALVES':    '#b0bec5',
  'REAR DELT': '#ce93d8',
  'CORE':      '#fff59d',
  'FULL BODY': '#e8ff00',
};

// ─── Component ───────────────────────────────────────────────────────

export default function ProgrammeScreen() {
  const [step, setStep] = useState(-1); // -1 = loading profile
  const [answers, setAnswers] = useState<Answers>({
    goal: null, experience: null, daysPerWeek: null, trainingDays: null, gender: null,
  });
  const [generating, setGenerating] = useState(false);
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [showBeginnerWarning, setShowBeginnerWarning] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // ── Profile pre-fill on mount ──────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [profile, prefs, existing] = await Promise.all([
        getProfile(),
        getProgrammePrefs(),
        getSavedProgramme(),
      ]);

      // Build prefilled answers.
      // goal + experience can come from onboarding profile as a convenience.
      // daysPerWeek must NEVER come from the profile — onboarding days (general
      // training frequency) is not the same as programme days. Only use a
      // previously saved programme-builder pref, or leave null so the user
      // must pick explicitly.
      const goalSource         = prefs?.goal         ?? mapProfileGoal(profile?.goal) ?? null;
      const experienceSource   = prefs?.experience   ?? (profile?.trainingAge as Experience) ?? null;
      const daysSource         = prefs?.daysPerWeek  ?? null; // never read from profile
      const trainingDaysSource = prefs?.trainingDays ?? null;
      const genderSource       = prefs?.gender       ?? null;

      const prefilled: Answers = {
        goal:         goalSource,
        experience:   experienceSource,
        daysPerWeek:  daysSource,
        trainingDays: trainingDaysSource,
        gender:       genderSource,
      };
      setAnswers(prefilled);

      // If there's already a saved programme, show it right away (can regenerate)
      if (existing) {
        setProgramme(existing.programme);
        setSaved(true);
        setStep(5);
        return;
      }

      // Always show questions so the user explicitly confirms their selection.
      const firstBlank =
        prefilled.goal         === null ? 0 :
        prefilled.experience   === null ? 1 :
        prefilled.daysPerWeek  === null ? 2 :
        prefilled.trainingDays === null ? 3 :
        prefilled.gender       === null ? 4 : 4;
      setStep(firstBlank);
    }
    init();
  }, []);

  // ── Rotating loading messages ──────────────────────────────────────
  useEffect(() => {
    if (!generating) return;
    setLoadingMsg(0);
    const interval = setInterval(() => {
      setLoadingMsg(m => Math.min(m + 1, LOADING_MESSAGES.length - 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [generating]);

  // ── Generate ──────────────────────────────────────────────────────
  function runGenerate(a: Answers) {
    setStep(5);
    setGenerating(true);
    setProgramme(null);
    setSaved(false);
    progressAnim.setValue(0);

    const goal        = a.goal!;
    const experience  = a.experience!;
    const daysPerWeek = a.daysPerWeek!;
    const trainingDays = a.trainingDays ?? undefined;
    const gender      = a.gender!;

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    }).start(() => {
      const result = buildProgramme({ goal, experience, daysPerWeek, trainingDays, gender });
      setProgramme(result);
      setGenerating(false);
      saveProgrammePrefs({ goal, experience, daysPerWeek, trainingDays: trainingDays ?? result.trainingDayIndices, gender });
    });
  }

  function proceed() {
    if (step === 4) {
      runGenerate({ ...answers });
      return;
    }
    // Warn beginners who pick 5+ days before advancing
    if (step === 2 && answers.experience === 'beginner' && answers.daysPerWeek && answers.daysPerWeek >= 5) {
      setShowBeginnerWarning(true);
      return;
    }
    // When days/week changes, clear the specific day selection so user must re-pick
    if (step === 2) {
      setAnswers(a => ({ ...a, trainingDays: null }));
    }
    setStep(s => s + 1);
  }

  function goBack() {
    if (showBeginnerWarning) { setShowBeginnerWarning(false); return; }
    if (step === 0) { router.back(); return; }
    if (step < 5) { setStep(s => s - 1); return; }
    // On result screen — go directly home
    router.replace('/(tabs)/');
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return answers.goal !== null;
      case 1: return answers.experience !== null;
      case 2: return answers.daysPerWeek !== null;
      case 3: return (answers.trainingDays?.length ?? 0) === (answers.daysPerWeek ?? 0);
      case 4: return answers.gender !== null;
      default: return false;
    }
  }

  function restart() {
    setAnswers({ goal: null, experience: null, daysPerWeek: null, trainingDays: null, gender: null });
    setProgramme(null);
    setSaved(false);
    progressAnim.setValue(0);
    setStep(0);
  }

  function editDays() {
    // Jump back to day picker with current answers preserved
    setStep(3);
  }

  async function handleSave() {
    if (!programme) return;
    await saveToStorage(programme);
    setSaved(true);
    Alert.alert('Saved', 'Your programme is saved to the home screen.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/') },
    ]);
  }

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  // ── Loading skeleton ───────────────────────────────────────────────
  if (step === -1) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={12} disabled={generating}>
          <Ionicons name="arrow-back" size={22} color={generating ? COLORS.textMuted : COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Build my programme</Text>
          {step >= 0 && step < 5 && (
            <Text style={styles.headerStep}>
              Step {step + 1} of 5
            </Text>
          )}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Step progress bar */}
      {step >= 0 && step < 5 && (
        <View style={styles.stepProgressBar}>
          <View style={[styles.stepProgressFill, { width: `${((step + 1) / 5) * 100}%` }]} />
        </View>
      )}

      {/* ── Beginner Warning Interstitial ── */}
      {showBeginnerWarning && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepTitle}>Hold on.</Text>
          <View style={styles.rationaleCard}>
            <Text style={styles.rationaleText}>
              {`You're a beginner training ${answers.daysPerWeek} days — we recommend starting with 3–4 days to build the habit and recover properly. Most beginners who start with ${answers.daysPerWeek} days burn out within 3 weeks. But it's your call.`}
            </Text>
          </View>
          <View style={styles.optionList}>
            <TouchableOpacity
              style={[styles.optionCard, styles.optionCardActive]}
              onPress={() => {
                setAnswers(a => ({ ...a, daysPerWeek: 3, trainingDays: null }));
                setShowBeginnerWarning(false);
                setStep(3);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.optionTop}>
                <Text style={[styles.optionLabel, styles.optionLabelActive]}>
                  Take the recommendation — 3 days
                </Text>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
              </View>
              <Text style={styles.optionDesc}>
                Full Body A/B alternating. Linear progression adds weight every session. The most effective structure at your level.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => {
                setShowBeginnerWarning(false);
                setStep(3);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.optionTop}>
                <Text style={styles.optionLabel}>Keep my {answers.daysPerWeek} days</Text>
              </View>
              <Text style={styles.optionDesc}>
                {`We'll build you a beginner-appropriate ${answers.daysPerWeek}-day programme.`}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ── Step 0: Goal ── */}
      {!showBeginnerWarning && step === 0 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepTitle}>What's your goal?</Text>
          <Text style={styles.stepSubtitle}>Your entire programme is built around this.</Text>
          <View style={styles.optionList}>
            {GOAL_OPTIONS.map(opt => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                description={opt.description}
                selected={answers.goal === opt.value}
                onPress={() => setAnswers(a => ({ ...a, goal: opt.value }))}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Step 1: Experience ── */}
      {!showBeginnerWarning && step === 1 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepTitle}>Training experience?</Text>
          <Text style={styles.stepSubtitle}>Sets your volume, rep ranges, and progression model.</Text>
          <View style={styles.optionList}>
            {EXPERIENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionCard, answers.experience === opt.value && styles.optionCardActive]}
                onPress={() => setAnswers(a => ({ ...a, experience: opt.value }))}
                activeOpacity={0.7}
              >
                <View style={styles.optionTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, answers.experience === opt.value && styles.optionLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionSub}>{opt.sub}</Text>
                  </View>
                  {answers.experience === opt.value && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                  )}
                </View>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Step 2: Days per week ── */}
      {!showBeginnerWarning && step === 2 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepTitle}>Days per week?</Text>
          <Text style={styles.stepSubtitle}>Determines your split. Be realistic — consistency beats ambition.</Text>
          <View style={styles.optionList}>
            {DAY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.dayCard, answers.daysPerWeek === opt.value && styles.optionCardActive]}
                onPress={() => setAnswers(a => ({ ...a, daysPerWeek: opt.value }))}
                activeOpacity={0.7}
              >
                <View style={styles.dayCardLeft}>
                  <Text style={[styles.dayNum, answers.daysPerWeek === opt.value && styles.optionLabelActive]}>
                    {opt.value}
                  </Text>
                  <View>
                    <Text style={[styles.optionLabel, answers.daysPerWeek === opt.value && styles.optionLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionDesc}>{opt.split}</Text>
                  </View>
                </View>
                {answers.daysPerWeek === opt.value && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                )}
              </TouchableOpacity>
            ))}
            {/* "Not sure" option */}
            <TouchableOpacity
              style={styles.notSureCard}
              onPress={() => {
                const recommended: TrainingDays = answers.experience === 'beginner' ? 3 : 4;
                setAnswers(a => ({ ...a, daysPerWeek: recommended, trainingDays: null }));
              }}
              activeOpacity={0.7}
            >
              <View style={styles.optionTop}>
                <Text style={styles.notSureLabel}>Not sure yet — recommend me something</Text>
              </View>
              <Text style={styles.optionDesc}>
                {answers.experience === 'beginner'
                  ? 'We\'ll use 3 days/week — the most effective full body split for your level.'
                  : 'We\'ll use 4 days/week — the most effective upper/lower split for your level.'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ── Step 3: Which days ── */}
      {!showBeginnerWarning && step === 3 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepTitle}>Which days?</Text>
          <Text style={styles.stepSubtitle}>
            Pick exactly {answers.daysPerWeek} day{answers.daysPerWeek === 1 ? '' : 's'}.
            Your sessions are assigned in order.
          </Text>
          <View style={styles.dayPickerGrid}>
            {WEEKDAYS.map(({ index, short, long }) => {
              const selected = answers.trainingDays?.includes(index) ?? false;
              const count = answers.trainingDays?.length ?? 0;
              const maxReached = count >= (answers.daysPerWeek ?? 0);
              const disabled = !selected && maxReached;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayPickerCell, selected && styles.dayPickerCellActive, disabled && styles.dayPickerCellDisabled]}
                  onPress={() => {
                    if (selected) {
                      setAnswers(a => ({ ...a, trainingDays: (a.trainingDays ?? []).filter(d => d !== index) }));
                    } else if (!maxReached) {
                      setAnswers(a => ({
                        ...a,
                        trainingDays: [...(a.trainingDays ?? []), index].sort((x, y) => {
                          // Sort Mon–Sun (treat 0=Sun as 7 for sorting purposes)
                          const xi = x === 0 ? 7 : x;
                          const yi = y === 0 ? 7 : y;
                          return xi - yi;
                        }),
                      }));
                    }
                  }}
                  activeOpacity={disabled ? 1 : 0.7}
                >
                  <Text style={[styles.dayPickerShort, selected && styles.dayPickerShortActive, disabled && styles.dayPickerTextDisabled]}>{short}</Text>
                  <Text style={[styles.dayPickerLong, disabled && styles.dayPickerTextDisabled]}>{long}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} style={{ marginTop: 4 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
          {(answers.trainingDays?.length ?? 0) > 0 && (
            <View style={styles.dayPickerSummary}>
              <Text style={styles.dayPickerSummaryText}>
                {answers.trainingDays!.map(d => WEEKDAYS.find(w => w.index === d)?.short).join('  ·  ')}
              </Text>
              <Text style={styles.dayPickerSummaryCount}>
                {answers.trainingDays!.length} / {answers.daysPerWeek} selected
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Step 4: Gender ── */}
      {!showBeginnerWarning && step === 4 && (
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepTitle}>Gender</Text>
          <Text style={styles.stepSubtitle}>
            Affects volume, rep ranges, rest periods, and exercise selection.
          </Text>
          <View style={styles.optionList}>
            {GENDER_OPTIONS.map(opt => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                description={opt.description}
                selected={answers.gender === opt.value}
                onPress={() => setAnswers(a => ({ ...a, gender: opt.value }))}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Step 5: Generating / Result ── */}
      {!showBeginnerWarning && step === 5 && (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Loading state */}
          {generating && (
            <View style={styles.loadingState}>
              <View style={styles.loadingIconWrap}>
                <Ionicons name="sparkles" size={32} color={COLORS.accent} />
              </View>
              <Text style={styles.loadingTitle}>Building your programme…</Text>
              <Text style={styles.loadingMsg}>{LOADING_MESSAGES[loadingMsg]}</Text>
              <View style={styles.loadingBarTrack}>
                <Animated.View style={[styles.loadingBarFill, { width: progressWidth }]} />
              </View>
            </View>
          )}

          {/* Result */}
          {programme && !generating && (
            <ProgrammeResult
              programme={programme}
              saved={saved}
              onSave={handleSave}
              onRestart={restart}
              onEditDays={editDays}
            />
          )}
        </ScrollView>
      )}

      {/* Footer button */}
      {!showBeginnerWarning && step >= 0 && step < 5 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
            onPress={proceed}
            disabled={!canProceed()}
          >
            <Text style={styles.nextBtnText}>
              {step === 4 ? 'Build my programme' : 'Next'}
            </Text>
            {step === 4 && <Ionicons name="flash" size={16} color={COLORS.background} />}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function OptionCard({
  label, description, selected, onPress,
}: { label: string; description: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.optionTop}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>{label}</Text>
        {selected && <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />}
      </View>
      <Text style={styles.optionDesc}>{description}</Text>
    </TouchableOpacity>
  );
}

function ProgrammeResult({
  programme, saved, onSave, onRestart, onEditDays,
}: {
  programme: Programme;
  saved: boolean;
  onSave: () => void;
  onRestart: () => void;
  onEditDays: () => void;
}) {
  const goalLabel: Record<string, string> = {
    muscle: 'Muscle', strength: 'Strength', 'fat-loss': 'Fat Loss', fitness: 'Fitness',
  };
  const expLabel: Record<string, string> = {
    beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
  };

  return (
    <>
      {/* Header */}
      <View style={styles.resultHeader}>
        <Text style={styles.resultBadge}>YOUR PROGRAMME</Text>
        <Text style={styles.resultTitle}>{programme.title}</Text>
        <Text style={styles.resultSplit}>{programme.splitName}</Text>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <StatPill icon="calendar-outline" value={`${programme.stats.sessionsPerWeek}×`} label="per week" />
        <StatPill icon="time-outline" value={programme.stats.estimatedDuration} label="per session" />
        <StatPill icon="body-outline" value={`${programme.stats.muscleGroups.length}`} label="muscle groups" />
      </View>

      {/* 7-day calendar */}
      <View style={styles.calendarStrip}>
        {programme.schedule.map((day, i) => (
          <View key={i} style={[styles.calendarDay, !day.isRest && styles.calendarDayActive]}>
            <Text style={[styles.calendarDayName, !day.isRest && styles.calendarDayNameActive]}>
              {day.dayName}
            </Text>
            {!day.isRest && day.sessionShort ? (
              <Text style={styles.calendarSessionLabel}>{day.sessionShort}</Text>
            ) : (
              <View style={styles.calendarRestDot} />
            )}
          </View>
        ))}
      </View>

      {/* Rationale */}
      <View style={styles.rationaleCard}>
        <Text style={styles.rationaleText}>{programme.rationale}</Text>
      </View>

      {/* Sessions */}
      {programme.sessions.map((session, si) => (
        <SessionCard key={si} session={session} index={si} />
      ))}

      {/* Progression + Deload */}
      <InfoBlock icon="trending-up-outline" label="PROGRESSION" text={programme.progression} />
      <InfoBlock icon="refresh-outline" label="DELOAD" text={programme.deload} />
      {programme.fatLossNote && (
        <InfoBlock icon="alert-circle-outline" label="FAT LOSS PHASE" text={programme.fatLossNote} accent />
      )}
      <InfoBlock icon="bulb-outline" label="KEY FOCUS" text={programme.keyNote} accent />

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {!saved ? (
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Ionicons name="bookmark-outline" size={16} color={COLORS.background} />
            <Text style={styles.saveBtnText}>Save this programme</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.savedBadgeText}>Saved to home screen</Text>
          </View>
        )}
        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onEditDays}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.secondaryBtnText}>Edit days</Text>
          </TouchableOpacity>
          <View style={styles.secondaryDivider} />
          <TouchableOpacity style={styles.secondaryBtn} onPress={onRestart}>
            <Ionicons name="refresh" size={14} color={COLORS.textSecondary} />
            <Text style={styles.secondaryBtnText}>Rebuild</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ height: 48 }} />
    </>
  );
}

function SessionCard({ session, index }: { session: import('@/utils/programmeBuilder').ProgrammeSession; index: number }) {
  return (
    <View style={styles.sessionCard}>
      {/* Card header */}
      <View style={styles.sessionCardHeader}>
        <View style={styles.sessionIndexBadge}>
          <Text style={styles.sessionIndexText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionLabel}>{session.label.toUpperCase()}</Text>
        </View>
      </View>

      {/* Exercises */}
      <View style={styles.exerciseList}>
        {session.exercises.map((ex, ei) => {
          const color = MUSCLE_GROUP_COLORS[ex.muscleGroup] ?? COLORS.accent;
          return (
            <View key={ei} style={[styles.exerciseRow, ei < session.exercises.length - 1 && styles.exerciseRowBorder]}>
              <View style={styles.exerciseMain}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <View style={styles.exerciseMeta}>
                  <View style={styles.setsPill}>
                    <Text style={styles.setsPillText}>{ex.sets} × {ex.reps}</Text>
                  </View>
                  <View style={styles.restBadge}>
                    <Ionicons name="timer-outline" size={11} color={COLORS.textMuted} />
                    <Text style={styles.restText}>{ex.rest}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.muscleTag, { borderColor: color + '60' }]}>
                <Text style={[styles.muscleTagText, { color }]}>{ex.muscleGroup}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatPill({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon} size={14} color={COLORS.accent} />
      <Text style={styles.statPillValue}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

function InfoBlock({ icon, label, text, accent }: { icon: any; label: string; text: string; accent?: boolean }) {
  return (
    <View style={[styles.infoBlock, accent && styles.infoBlockAccent]}>
      <View style={styles.infoBlockHeader}>
        <Ionicons name={icon} size={14} color={accent ? COLORS.accent : COLORS.textMuted} />
        <Text style={[styles.infoBlockLabel, accent && { color: COLORS.accent }]}>{label}</Text>
      </View>
      <Text style={styles.infoBlockText}>{text}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

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

  stepProgressBar: {
    height: 3,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  stepProgressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: RADIUS.full },

  stepContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.lg },
  stepTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.text },
  stepSubtitle: {
    fontSize: FONT_SIZE.md, color: COLORS.textSecondary, lineHeight: 22, marginTop: -SPACING.sm,
  },

  optionList: { gap: SPACING.sm },
  optionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  optionCardActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  optionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  optionLabel: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  optionLabelActive: { color: COLORS.accent },
  optionSub: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 1 },
  optionDesc: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 18 },

  dayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCardLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  dayNum: { fontSize: 28, fontWeight: '900', color: COLORS.textMuted, width: 32 },

  notSureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    padding: SPACING.lg,
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  notSureLabel: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.textSecondary },

  footer: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
  },
  nextBtnDisabled: { opacity: 0.3 },
  nextBtnText: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.background },

  // Loading
  resultContent: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl },

  loadingState: {
    paddingVertical: SPACING.xxl * 2,
    alignItems: 'center',
    gap: SPACING.lg,
  },
  loadingIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  loadingTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.text },
  loadingMsg: {
    fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 20, minHeight: 40,
  },
  loadingBarTrack: {
    width: '85%', height: 4, backgroundColor: COLORS.border,
    borderRadius: RADIUS.full, overflow: 'hidden',
  },
  loadingBarFill: {
    height: '100%', backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
  },

  // Result header
  resultHeader: { marginBottom: SPACING.lg, gap: SPACING.xs },
  resultBadge: {
    fontSize: FONT_SIZE.xs, fontWeight: '900', color: COLORS.accent, letterSpacing: 2,
  },
  resultTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.text, lineHeight: 32 },
  resultSplit: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },

  // Stats strip
  statsStrip: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg,
  },
  statPill: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, alignItems: 'center', gap: 3,
  },
  statPillValue: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.text },
  statPillLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, textAlign: 'center' },

  // Calendar strip
  calendarStrip: {
    flexDirection: 'row', gap: 5, marginBottom: SPACING.lg,
  },
  calendarDay: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: SPACING.sm, alignItems: 'center', gap: 4,
  },
  calendarDayActive: {
    borderColor: COLORS.accent, backgroundColor: COLORS.accentDim,
  },
  calendarDayName: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
  calendarDayNameActive: { color: COLORS.accent },
  calendarSessionLabel: { fontSize: 7, fontWeight: '800', color: COLORS.accent, textAlign: 'center' },
  calendarRestDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted,
  },

  // Rationale
  rationaleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  rationaleText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 20 },

  // Session card
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  sessionCardHeader: {
    backgroundColor: COLORS.surfaceAlt,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sessionIndexBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sessionIndexText: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: COLORS.background },
  sessionLabel: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.text, letterSpacing: 0.5 },

  exerciseList: { paddingHorizontal: SPACING.lg },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  exerciseRowBorder: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  exerciseMain: { flex: 1, gap: 5 },
  exerciseName: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text },
  exerciseMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  setsPill: {
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
  },
  setsPillText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.accent },
  restBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  restText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  muscleTag: {
    borderRadius: RADIUS.xs, borderWidth: 1,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  muscleTagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  // Info blocks
  infoBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  infoBlockAccent: { borderColor: COLORS.accent + '40', backgroundColor: COLORS.accentDim },
  infoBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  infoBlockLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: '900', color: COLORS.textMuted,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  infoBlockText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 20 },

  // Actions
  actionRow: {
    gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.xl,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md, paddingVertical: SPACING.lg,
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.background },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, borderRadius: RADIUS.md, paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.success + '40',
  },
  savedBadgeText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.success },
  secondaryActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.md,
  },
  secondaryBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '600' },
  secondaryDivider: { width: 1, height: 20, backgroundColor: COLORS.border },
  // Day picker
  dayPickerGrid: { gap: SPACING.sm },
  dayPickerCell: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  dayPickerCellActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  dayPickerCellDisabled: { opacity: 0.35 },
  dayPickerShort: {
    fontSize: FONT_SIZE.sm, fontWeight: '900', color: COLORS.textMuted,
    width: 36,
  },
  dayPickerShortActive: { color: COLORS.accent },
  dayPickerLong: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text },
  dayPickerTextDisabled: { color: COLORS.textMuted },
  dayPickerSummary: {
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayPickerSummaryText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.accent, letterSpacing: 1 },
  dayPickerSummaryCount: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
});
