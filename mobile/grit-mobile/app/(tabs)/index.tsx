import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getProfile,
  getSessions,
  UserProfile,
  WorkoutSession,
  getStreak,
  formatDate,
  getSavedProgram,
  SavedProgram,
  getProgressionSuggestions,
  ProgressionSuggestion,
} from '@/utils/storage';
import { getQuoteOfTheDay } from '@/utils/progressiveOverload';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HomeScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [savedProgram, setSavedProgram] = useState<SavedProgram | null>(null);
  const [progressionSuggestions, setProgressionSuggestions] = useState<ProgressionSuggestion[]>([]);

  async function load() {
    const [p, s, sp, ps] = await Promise.all([
      getProfile(),
      getSessions(),
      getSavedProgram(),
      getProgressionSuggestions(),
    ]);
    setProfile(p);
    setSessions(s);
    setSavedProgram(sp);
    setProgressionSuggestions(ps);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const streak = getStreak(sessions, profile?.daysPerWeek ?? 3);
  const lastSession = sessions[0] ?? null;

  const today = new Date().getDay();
  // true=training day, false=rest day, null=no program set
  const isTrainingDay: boolean | null = (() => {
    if (savedProgram?.program?.trainingDayIndices?.length) {
      return savedProgram.program.trainingDayIndices.includes(today);
    }
    if (profile?.trainingDays?.length) {
      return profile.trainingDays.includes(today);
    }
    return null;
  })();


  const isGuidedMode = !profile?.userMode || profile.userMode === 'guided';


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>GRIT</Text>
            {profile && (
              <Text style={styles.greeting}>
                {getGreeting()}, {profile.name}
              </Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.streakBadge}>
              <Text style={styles.streakNumber}>{streak}</Text>
              <Text style={styles.streakLabel}>streak</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings' as any)} hitSlop={12}>
              <Ionicons name="menu" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Daily quote */}
        <View style={styles.motivationCard}>
          <Text style={styles.motivationQuoteMark}>{'\u201C'}</Text>
          <Text style={styles.motivationText}>{getQuoteOfTheDay()}</Text>
        </View>

        {/* Progressive overload suggestion cards */}
        {progressionSuggestions.length > 0 && (
          <View style={styles.section}>
            {progressionSuggestions.slice(0, 2).map((s) => (
              <View key={s.exercise} style={styles.progressionCard}>
                <View style={styles.progressionHeader}>
                  <Ionicons name="trending-up" size={16} color={COLORS.background} />
                  <Text style={styles.progressionTag}>READY TO PROGRESS</Text>
                </View>
                <Text style={styles.progressionText}>
                  Add <Text style={styles.progressionHighlight}>{(s.suggestedWeight - s.currentWeight).toFixed(1)}kg</Text> to{' '}
                  <Text style={styles.progressionHighlight}>{s.exercise}</Text> next session.{'\n'}
                  {s.message}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Today's status */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Today</Text>
          <View style={styles.todayCard}>
            <View style={styles.todayLeft}>
              <Text style={styles.todayDayLabel}>
                {DAY_LABELS[today]}, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </Text>
              {isTrainingDay === true ? (
                <Text style={styles.todayStatus}>Training day</Text>
              ) : isTrainingDay === false ? (
                <Text style={[styles.todayStatus, { color: COLORS.textSecondary }]}>Rest day</Text>
              ) : (
                <Text style={[styles.todayStatus, { color: COLORS.textMuted }]}>No program set</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.startButton, isTrainingDay !== true && styles.startButtonAlt]}
              onPress={() => router.push('/(tabs)/workout')}
            >
              <Ionicons name="barbell" size={16} color={isTrainingDay === true ? COLORS.background : COLORS.accent} />
              <Text style={[styles.startButtonText, isTrainingDay !== true && styles.startButtonTextAlt]}>
                {isTrainingDay === true ? 'Start' : 'Log session'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>


        {/* Saved program card — guided mode only */}
        {isGuidedMode && savedProgram && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>My Program</Text>
            <TouchableOpacity
              style={styles.savedProgramCard}
              onPress={() => router.push('/programme')}
              activeOpacity={0.7}
            >
              <View style={styles.savedProgramLeft}>
                <Text style={styles.savedProgramTitle}>{savedProgram.program.title}</Text>
                <Text style={styles.savedProgramSplit}>{savedProgram.program.splitName}</Text>
                <View style={styles.savedProgramMeta}>
                  {getNextSession(savedProgram.program) && (
                    <Text style={styles.savedProgramNext}>
                      {getNextSession(savedProgram.program)}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.savedProgramArrow}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Program builder CTA — visible for all users */}
        <View style={styles.section}>
          {!isGuidedMode && !savedProgram && (
            <Text style={styles.optionalLabel}>Optional — build a program anytime</Text>
          )}
          <TouchableOpacity
            style={styles.programCard}
            onPress={() => router.push('/programme')}
            activeOpacity={0.7}
          >
            <View style={styles.programLeft}>
              <Text style={styles.programTitle}>
                {savedProgram ? 'Rebuild my program' : 'Build my program'}
              </Text>
              <Text style={styles.programSubtitle}>
                {savedProgram
                  ? 'Generate a new program with different settings'
                  : 'Get a personalised plan built around your goal and schedule'}
              </Text>
            </View>
            <View style={styles.programIcon}>
              <Ionicons name="sparkles" size={20} color={COLORS.background} />
            </View>
          </TouchableOpacity>
        </View>


        {/* Last session */}
        {lastSession && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Last session</Text>
            <TouchableOpacity
              style={styles.sessionCard}
              onPress={() => router.push(`/workout/${lastSession.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.sessionCardHeader}>
                <Text style={styles.sessionDate}>{formatDate(lastSession.date)}</Text>
                {lastSession.duration > 0 && (
                  <Text style={styles.sessionDuration}>{lastSession.duration} min</Text>
                )}
              </View>
              <View style={styles.exerciseList}>
                {lastSession.exercises.slice(0, 3).map((ex, i) => {
                  const topSet = ex.sets.filter((s) => s.completed).sort((a, b) => b.weight - a.weight)[0];
                  return (
                    <View key={i} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{ex.name}</Text>
                      {topSet && (
                        <Text style={styles.exerciseWeight}>
                          {topSet.weight}kg × {topSet.reps}
                        </Text>
                      )}
                    </View>
                  );
                })}
                {lastSession.exercises.length > 3 && (
                  <Text style={styles.moreText}>+{lastSession.exercises.length - 3} more</Text>
                )}
              </View>
              <View style={styles.sessionCardFooter}>
                <Text style={styles.viewDetails}>View details →</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}


        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getNextSession(program: import('@/utils/programBuilder').Program): string | null {
  const todayJS = new Date().getDay();
  const { trainingDayIndices, sessions } = program;
  if (!trainingDayIndices?.length || !sessions?.length) return null;

  for (let offset = 0; offset < 7; offset++) {
    const dayIdx = (todayJS + offset) % 7;
    const sessionPos = trainingDayIndices.indexOf(dayIdx);
    if (sessionPos !== -1) {
      const session = sessions[sessionPos % sessions.length];
      const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_LABELS[(todayJS + offset) % 7];
      return `${label}: ${session.label}`;
    }
  }
  return null;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  logo: { fontSize: 32, fontWeight: '900', color: COLORS.accent, letterSpacing: 6 },
  greeting: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: SPACING.sm },
  streakBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  streakNumber: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.accent },
  streakLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  motivationCard: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(232,255,0,0.25)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: 'rgba(232,255,0,1)',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  motivationQuoteMark: {
    fontSize: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: '#e8ff00',
    lineHeight: 28,
    marginBottom: 0,
  },
  motivationText: {
    fontSize: 13,
    color: '#f0f0f0',
    fontStyle: 'italic',
    lineHeight: 20,
    textAlign: 'center',
  },
  section: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  // Progression card
  progressionCard: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  progressionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  progressionTag: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.background,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  progressionText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.background,
    lineHeight: 20,
  },
  progressionHighlight: {
    fontWeight: '900',
    color: COLORS.background,
  },
  // Today card
  todayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayLeft: { gap: 4 },
  todayDayLabel: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text },
  todayStatus: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '600' },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  startButtonAlt: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  startButtonText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.background },
  startButtonTextAlt: { color: COLORS.textSecondary },
  // Body weight widget
  bwWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  bwWidgetIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bwWidgetLeft: { flex: 1, gap: 3 },
  bwValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  bwWeightValue: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.text },
  bwWeightUnit: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, fontWeight: '600' },
  bwLoggedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginLeft: 4,
    marginBottom: 2,
  },
  bwChange: { fontSize: FONT_SIZE.xs, fontWeight: '700' },
  bwWidgetRight: { alignItems: 'flex-end', gap: SPACING.xs },
  bwTrendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bwTrendText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontWeight: '600' },
  bwSeeMore: { fontSize: FONT_SIZE.xs, color: COLORS.accent, fontWeight: '600' },
  bwWidgetEmpty: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bwEmptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  // Saved program card
  savedProgramCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  savedProgramLeft: { flex: 1, gap: 3 },
  savedProgramTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.text },
  savedProgramSplit: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  savedProgramMeta: { marginTop: 3 },
  savedProgramNext: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '700' },
  savedProgramArrow: { opacity: 0.8 },
  optionalLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  // Program card
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  programLeft: { flex: 1, gap: 3 },
  programTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  programSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  programIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Session card
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sessionDate: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text },
  sessionDuration: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  exerciseList: { gap: SPACING.sm },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exerciseName: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, flex: 1 },
  exerciseWeight: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: '600' },
  moreText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: SPACING.xs },
  sessionCardFooter: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  viewDetails: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '600' },
  emptyState: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  emptyText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  emptySubText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 20 },
});
