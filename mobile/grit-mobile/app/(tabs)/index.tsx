import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  getProfile,
  getSessions,
  UserProfile,
  WorkoutSession,
  getStreak,
  getDaysSinceLastWorkout,
  getWeeklyVolume,
  formatDate,
  getBodyWeightEntries,
  getBodyWeightTrend,
  getTodayWater,
  addWater,
  getSavedProgramme,
  SavedProgramme,
  BodyWeightEntry,
  WaterEntry,
} from '@/utils/storage';
import { getMotivationalLine, getQuoteOfTheDay } from '@/utils/progressiveOverload';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function confirmReset() {
  Alert.alert(
    'Reset all data?',
    'Wipes every session, PR, and your profile. Cannot be undone. Use for testing only.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset everything',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          router.replace('/onboarding');
        },
      },
    ]
  );
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bodyWeightEntries, setBodyWeightEntries] = useState<BodyWeightEntry[]>([]);
  const [water, setWater] = useState<WaterEntry>({ date: '', amount: 0, goal: 2500 });
  const [savedProgramme, setSavedProgramme] = useState<SavedProgramme | null>(null);

  async function load() {
    const [p, s, bw, w, sp] = await Promise.all([
      getProfile(),
      getSessions(),
      getBodyWeightEntries(),
      getTodayWater(),
      getSavedProgramme(),
    ]);
    setProfile(p);
    setSessions(s);
    setBodyWeightEntries(bw);
    setWater(w);
    setSavedProgramme(sp);
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
  const daysSince = getDaysSinceLastWorkout(sessions);
  const motivationalLine = getMotivationalLine(streak, daysSince);
  const lastSession = sessions[0] ?? null;
  const weekVol = getWeeklyVolume(sessions);

  const today = new Date().getDay();
  const isTrainingDay = profile?.trainingDays?.includes(today) ?? false;

  // Body weight
  const currentWeight = bodyWeightEntries.length > 0 ? bodyWeightEntries[0].weight : null;
  const bwTrend = getBodyWeightTrend(bodyWeightEntries);
  const sortedBW = [...bodyWeightEntries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const startWeight = sortedBW.length > 0 ? sortedBW[0].weight : null;
  const weightChange =
    currentWeight && startWeight ? currentWeight - startWeight : null;

  // Water
  const waterPct = water.goal > 0 ? Math.min(water.amount / water.goal, 1) : 0;

  async function handleAddWater(ml: number) {
    const updated = await addWater(ml);
    setWater(updated);
  }

  function formatVol(v: number) {
    if (v === 0) return '—';
    return v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;
  }

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
            <TouchableOpacity onPress={confirmReset} hitSlop={12}>
              <Ionicons name="settings-outline" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Daily quote */}
        <View style={styles.motivationCard}>
          <Text style={styles.motivationText}>{getQuoteOfTheDay()}</Text>
        </View>

        {/* Contextual status line — only shown when there's something worth saying */}
        {sessions.length > 0 && daysSince < 999 && (
          <View style={styles.contextLine}>
            <Text style={styles.contextLineText}>{motivationalLine}</Text>
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
              {isTrainingDay ? (
                <Text style={styles.todayStatus}>Training day</Text>
              ) : (
                <Text style={[styles.todayStatus, { color: COLORS.textSecondary }]}>Rest day</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.startButton, !isTrainingDay && styles.startButtonAlt]}
              onPress={() => router.push('/(tabs)/workout')}
            >
              <Ionicons name="barbell" size={16} color={isTrainingDay ? COLORS.background : COLORS.accent} />
              <Text style={[styles.startButtonText, !isTrainingDay && styles.startButtonTextAlt]}>
                {isTrainingDay ? 'Start' : 'Log anyway'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Body weight widget */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Body weight</Text>
          <TouchableOpacity
            style={styles.bwWidget}
            onPress={() => router.push('/(tabs)/progress')}
            activeOpacity={0.7}
          >
            {currentWeight ? (
              <>
                <View style={styles.bwWidgetLeft}>
                  <Text style={styles.bwWeightValue}>{currentWeight}kg</Text>
                  <Text style={styles.bwWeightLabel}>Current</Text>
                </View>
                <View style={styles.bwWidgetRight}>
                  {weightChange !== null && Math.abs(weightChange) >= 0.1 && (
                    <Text style={[
                      styles.bwChange,
                      { color: weightChange > 0 ? COLORS.success : COLORS.warning },
                    ]}>
                      {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}kg since start
                    </Text>
                  )}
                  {bwTrend && (
                    <View style={styles.bwTrendBadge}>
                      <Ionicons
                        name={
                          bwTrend === 'gaining' ? 'trending-up' :
                          bwTrend === 'losing' ? 'trending-down' :
                          'remove'
                        }
                        size={12}
                        color={
                          bwTrend === 'gaining' ? COLORS.success :
                          bwTrend === 'losing' ? COLORS.warning :
                          COLORS.textSecondary
                        }
                      />
                      <Text style={styles.bwTrendText}>
                        {bwTrend === 'gaining' ? 'Gaining' : bwTrend === 'losing' ? 'Losing' : 'Maintaining'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.bwSeeMore}>Log weight →</Text>
                </View>
              </>
            ) : (
              <View style={styles.bwWidgetEmpty}>
                <Ionicons name="scale-outline" size={18} color={COLORS.textMuted} />
                <Text style={styles.bwEmptyText}>Tap to log your weight</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Water intake widget */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Water today</Text>
          <View style={styles.waterWidget}>
            <View style={styles.waterInfo}>
              <Text style={styles.waterAmount}>
                {(water.amount / 1000).toFixed(1)}L
              </Text>
              <Text style={styles.waterGoal}>/ {(water.goal / 1000).toFixed(1)}L goal</Text>
            </View>
            <View style={styles.waterProgressBar}>
              <View
                style={[
                  styles.waterProgressFill,
                  { width: `${waterPct * 100}%` },
                  waterPct >= 1 && styles.waterProgressComplete,
                ]}
              />
            </View>
            <View style={styles.waterButtons}>
              <TouchableOpacity style={styles.waterBtn} onPress={() => handleAddWater(250)}>
                <Text style={styles.waterBtnText}>+250ml</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.waterBtn} onPress={() => handleAddWater(500)}>
                <Text style={styles.waterBtnText}>+500ml</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.waterBtn, styles.waterBtnCustom]}
                onPress={() => handleAddWater(750)}
              >
                <Text style={[styles.waterBtnText, { color: COLORS.accent }]}>+750ml</Text>
              </TouchableOpacity>
            </View>
            {waterPct >= 1 && (
              <View style={styles.waterComplete}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                <Text style={styles.waterCompleteText}>Goal hit. Keep it up.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Saved programme card */}
        {savedProgramme && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>My Programme</Text>
            <TouchableOpacity
              style={styles.savedProgrammeCard}
              onPress={() => router.push('/programme')}
              activeOpacity={0.7}
            >
              <View style={styles.savedProgrammeLeft}>
                <Text style={styles.savedProgrammeTitle}>{savedProgramme.programme.title}</Text>
                <Text style={styles.savedProgrammeSplit}>{savedProgramme.programme.splitName}</Text>
                <View style={styles.savedProgrammeMeta}>
                  {getNextSession(savedProgramme.programme) && (
                    <Text style={styles.savedProgrammeNext}>
                      {getNextSession(savedProgramme.programme)}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.savedProgrammeArrow}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Programme builder CTA */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.programmeCard}
            onPress={() => router.push('/programme')}
            activeOpacity={0.7}
          >
            <View style={styles.programmeLeft}>
              <Text style={styles.programmeTitle}>
                {savedProgramme ? 'Rebuild my programme' : 'Build my programme'}
              </Text>
              <Text style={styles.programmeSubtitle}>
                {savedProgramme
                  ? 'Generate a new programme with different settings'
                  : 'Get a personalised plan built around your goal and schedule'}
              </Text>
            </View>
            <View style={styles.programmeIcon}>
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

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{sessions.length}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, weekVol.current > 0 && weekVol.current >= weekVol.best && { color: COLORS.accent }]}>
              {formatVol(weekVol.current)}
            </Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
        </View>

        {/* Empty state */}
        {sessions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No sessions logged yet.</Text>
            <Text style={styles.emptySubText}>Hit the Workout tab to log your first session.</Text>
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getNextSession(programme: import('@/utils/programmeBuilder').Programme): string | null {
  const todayJS = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
  const { trainingDayIndices, sessions } = programme;
  if (!trainingDayIndices?.length || !sessions?.length) return null;

  // Check today and the next 7 days
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
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  streakNumber: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.accent },
  streakLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  motivationCard: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    paddingVertical: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    paddingLeft: SPACING.md,
  },
  motivationText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  contextLine: {
    marginHorizontal: SPACING.xl,
    marginTop: -SPACING.lg,
    marginBottom: SPACING.xl,
  },
  contextLineText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
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
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  bwWidgetLeft: { gap: 2 },
  bwWeightValue: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.success },
  bwWeightLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  bwWidgetRight: { alignItems: 'flex-end', gap: SPACING.xs },
  bwChange: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
  bwTrendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bwTrendText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontWeight: '600' },
  bwSeeMore: { fontSize: FONT_SIZE.xs, color: COLORS.accent, fontWeight: '600' },
  bwWidgetEmpty: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  bwEmptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  // Water widget
  waterWidget: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  waterInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.xs,
  },
  waterAmount: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: '#4dd0e1' },
  waterGoal: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  waterProgressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  waterProgressFill: {
    height: '100%',
    backgroundColor: '#4dd0e1',
    borderRadius: RADIUS.full,
  },
  waterProgressComplete: { backgroundColor: COLORS.success },
  waterButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  waterBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  waterBtnCustom: {
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.accentDim,
  },
  waterBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  waterComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  waterCompleteText: { fontSize: FONT_SIZE.xs, color: COLORS.success, fontWeight: '600' },
  // Saved programme card
  savedProgrammeCard: {
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
  savedProgrammeLeft: { flex: 1, gap: 3 },
  savedProgrammeTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.text },
  savedProgrammeSplit: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  savedProgrammeMeta: { marginTop: 3 },
  savedProgrammeNext: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '700' },
  savedProgrammeArrow: { opacity: 0.8 },
  // Programme card
  programmeCard: {
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
  programmeLeft: { flex: 1, gap: 3 },
  programmeTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  programmeSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  programmeIcon: {
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
  // Stats row
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.xl,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.text },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    marginHorizontal: SPACING.xl,
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySubText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: 'center' },
});
