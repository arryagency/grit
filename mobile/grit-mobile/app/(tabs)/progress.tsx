import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import {
  getSessions,
  getPRs,
  getStreak,
  getBodyWeightEntries,
  addBodyWeightEntry,
  getBodyWeightTrend,
  getWeeklyWaterAverage,
  BodyWeightEntry,
  WorkoutSession,
  PRRecord,
} from '@/utils/storage';
import { KEY_LIFTS, matchKeyLift } from '@/constants/exercises';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const screenWidth = Dimensions.get('window').width;

// ─── Muscle group mapping ──────────────────────────────────────────────────────

const MUSCLE_GROUP_MAP: Record<string, string> = {
  'Bench Press': 'Chest', 'Incline Bench Press': 'Chest', 'Decline Bench Press': 'Chest',
  'Dumbbell Fly': 'Chest', 'Cable Fly': 'Chest', 'Push-Up': 'Chest', 'Dips': 'Chest',
  'Incline Dumbbell Press': 'Chest', 'Chest Press': 'Chest',
  'Pull-Up': 'Back', 'Chin-Up': 'Back', 'Lat Pulldown': 'Back',
  'Barbell Row': 'Back', 'Dumbbell Row': 'Back', 'Cable Row': 'Back',
  'T-Bar Row': 'Back', 'Seated Cable Row': 'Back', 'Chest-Supported Row': 'Back',
  'Deadlift': 'Back', 'Romanian Deadlift': 'Back', 'Good Morning': 'Back',
  'Squat': 'Legs', 'Front Squat': 'Legs', 'Hack Squat': 'Legs',
  'Leg Press': 'Legs', 'Lunges': 'Legs', 'Step-Ups': 'Legs',
  'Leg Curl': 'Legs', 'Leg Extension': 'Legs', 'Calf Raise': 'Legs',
  'Glute Bridge': 'Legs', 'Hip Thrust': 'Legs', 'Bulgarian Split Squat': 'Legs',
  'Walking Lunges': 'Legs', 'Seated Calf Raise': 'Legs',
  'Overhead Press': 'Shoulders', 'Dumbbell OHP': 'Shoulders', 'Arnold Press': 'Shoulders',
  'Lateral Raise': 'Shoulders', 'Front Raise': 'Shoulders', 'Face Pull': 'Shoulders',
  'Upright Row': 'Shoulders', 'Cable Lateral Raise': 'Shoulders',
  'Tricep Pushdown': 'Triceps', 'Skull Crusher': 'Triceps',
  'Close Grip Bench Press': 'Triceps', 'Overhead Tricep Extension': 'Triceps',
  'Tricep Dip': 'Triceps', 'Cable Tricep Extension': 'Triceps',
  'Bicep Curl': 'Biceps', 'Hammer Curl': 'Biceps', 'Preacher Curl': 'Biceps',
  'Cable Curl': 'Biceps', 'Incline Curl': 'Biceps', 'Concentration Curl': 'Biceps',
  'Plank': 'Core', 'Crunch': 'Core', 'Sit-Up': 'Core',
  'Leg Raise': 'Core', 'Ab Wheel': 'Core', 'Russian Twist': 'Core',
  'Cable Crunch': 'Core', 'Hanging Leg Raise': 'Core',
};

function getMuscleGroup(exerciseName: string): string | null {
  return MUSCLE_GROUP_MAP[exerciseName] ?? null;
}

function getMuscleBalance(sessions: WorkoutSession[]): Record<string, number> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const recent = sessions.filter((s) => new Date(s.date) >= twoWeeksAgo);
  const counts: Record<string, number> = {};

  for (const session of recent) {
    for (const ex of session.exercises) {
      const group = getMuscleGroup(ex.name);
      if (group) {
        counts[group] = (counts[group] ?? 0) + 1;
      }
    }
  }

  return counts;
}

function getImbalanceWarnings(balance: Record<string, number>): string[] {
  const warnings: string[] = [];
  const chest = balance['Chest'] ?? 0;
  const back = balance['Back'] ?? 0;
  const legs = balance['Legs'] ?? 0;
  const shoulders = balance['Shoulders'] ?? 0;
  const biceps = balance['Biceps'] ?? 0;
  const triceps = balance['Triceps'] ?? 0;

  if (chest >= 3 && back <= 1)
    warnings.push(`Chest ${chest}× vs back ${back}× this fortnight — that's how you get injured. Add rows.`);
  if (back >= 3 && chest === 0)
    warnings.push(`All back, no chest. Balance your pushing and pulling.`);
  if (legs <= 1 && (chest + back) >= 4)
    warnings.push(`${legs} leg session${legs !== 1 ? 's' : ''} vs ${chest + back} upper sessions. Skipping legs is a cliché — don't be that person.`);
  if (chest >= 4)
    warnings.push(`${chest} chest sessions in two weeks. Your shoulders will notice. Rotate.`);
  if (biceps >= 3 && triceps <= 0)
    warnings.push(`Biceps trained ${biceps}× but no triceps work. Unbalanced arm training.`);
  if (triceps >= 3 && biceps <= 0)
    warnings.push(`Triceps trained ${triceps}× but no bicep work. Balance it out.`);
  if (shoulders === 0 && (chest + back) >= 4)
    warnings.push(`No shoulder work in two weeks. Add some overhead pressing.`);

  return warnings;
}

// ─── Lift chart helpers ───────────────────────────────────────────────────────

interface LiftData {
  name: string;
  dates: string[];
  weights: number[];
}

function buildLiftData(sessions: WorkoutSession[]): LiftData[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return KEY_LIFTS.map((lift) => {
    const points: { date: string; weight: number }[] = [];
    for (const session of sorted) {
      for (const ex of session.exercises) {
        if (matchKeyLift(ex.name) === lift.name) {
          const completed = ex.sets.filter((s) => s.completed && s.weight > 0);
          if (completed.length > 0) {
            const topWeight = Math.max(...completed.map((s) => s.weight));
            points.push({
              date: new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              weight: topWeight,
            });
          }
        }
      }
    }
    return {
      name: lift.name,
      dates: points.map((p) => p.date),
      weights: points.map((p) => p.weight),
    };
  });
}

const chartConfig = {
  backgroundColor: COLORS.surface,
  backgroundGradientFrom: COLORS.surface,
  backgroundGradientTo: COLORS.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(232, 255, 0, ${opacity})`,
  labelColor: () => COLORS.textSecondary,
  propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.accent },
  propsForBackgroundLines: { stroke: COLORS.border, strokeDasharray: '' },
};

const weightChartConfig = {
  ...chartConfig,
  color: (opacity = 1) => `rgba(0, 204, 68, ${opacity})`,
  propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.success },
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [prs, setPRs] = useState<PRRecord>({});
  const [bodyWeightEntries, setBodyWeightEntries] = useState<BodyWeightEntry[]>([]);
  const [weeklyWater, setWeeklyWater] = useState(0);
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        getSessions(),
        getPRs(),
        getBodyWeightEntries(),
        getWeeklyWaterAverage(),
      ]).then(([s, p, bw, ww]) => {
        setSessions(s);
        setPRs(p);
        setBodyWeightEntries(bw);
        setWeeklyWater(ww);
      });
    }, [])
  );

  const streak = getStreak(sessions, 3);
  const liftData = buildLiftData(sessions);
  const prEntries = Object.entries(prs);
  const muscleBalance = getMuscleBalance(sessions);
  const imbalances = getImbalanceWarnings(muscleBalance);

  // Body weight chart data
  const sortedBW = [...bodyWeightEntries]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);
  const bwTrend = getBodyWeightTrend(bodyWeightEntries);
  const currentWeight = bodyWeightEntries.length > 0 ? bodyWeightEntries[0].weight : null;
  const startWeight = sortedBW.length > 0 ? sortedBW[0].weight : null;
  const weightChange = currentWeight && startWeight ? currentWeight - startWeight : null;

  async function handleLogWeight() {
    const w = parseFloat(weightInput);
    if (!w || w < 20 || w > 350) {
      Alert.alert('Invalid weight', 'Enter a weight between 20 and 350 kg.');
      return;
    }
    await addBodyWeightEntry(w);
    setWeightInput('');
    setShowLogWeight(false);
    const updated = await getBodyWeightEntries();
    setBodyWeightEntries(updated);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Progress</Text>
        </View>

        {/* Top stats */}
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
            <Text style={styles.statValue}>{prEntries.length}</Text>
            <Text style={styles.statLabel}>PRs set</Text>
          </View>
        </View>

        {/* Body weight */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Body weight</Text>
            <TouchableOpacity style={styles.logWeightBtn} onPress={() => setShowLogWeight(true)}>
              <Ionicons name="add" size={14} color={COLORS.background} />
              <Text style={styles.logWeightBtnText}>Log weight</Text>
            </TouchableOpacity>
          </View>

          {currentWeight ? (
            <View style={styles.bwCard}>
              <View style={styles.bwCardTop}>
                <View>
                  <Text style={styles.bwCurrent}>{currentWeight}kg</Text>
                  <Text style={styles.bwLabel}>Current weight</Text>
                </View>
                <View style={styles.bwRight}>
                  {weightChange !== null && Math.abs(weightChange) >= 0.1 && (
                    <View style={[
                      styles.trendBadge,
                      weightChange > 0 ? styles.trendUp : styles.trendDown,
                    ]}>
                      <Ionicons
                        name={weightChange > 0 ? 'trending-up' : 'trending-down'}
                        size={14}
                        color={weightChange > 0 ? COLORS.success : COLORS.warning}
                      />
                      <Text style={[
                        styles.trendText,
                        { color: weightChange > 0 ? COLORS.success : COLORS.warning },
                      ]}>
                        {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}kg
                      </Text>
                    </View>
                  )}
                  {bwTrend && (
                    <Text style={styles.trendLabel}>
                      {bwTrend === 'gaining' ? 'Gaining' : bwTrend === 'losing' ? 'Losing' : 'Maintaining'}
                    </Text>
                  )}
                </View>
              </View>

              {sortedBW.length >= 2 && (
                <LineChart
                  data={{
                    labels: sortedBW.map((e) =>
                      new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    ),
                    datasets: [{ data: sortedBW.map((e) => e.weight) }],
                  }}
                  width={screenWidth - SPACING.xl * 2 - SPACING.lg * 2}
                  height={140}
                  chartConfig={weightChartConfig}
                  bezier
                  withInnerLines={false}
                  withOuterLines={false}
                  style={styles.chart}
                  formatYLabel={(v) => `${v}`}
                  formatXLabel={(v, i) => {
                    if (sortedBW.length <= 5) return v;
                    return Number(i) % Math.ceil(sortedBW.length / 5) === 0 ? v : '';
                  }}
                />
              )}

              {sortedBW.length === 1 && (
                <Text style={styles.bwOneEntry}>
                  Log one more weigh-in to see your trend chart.
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.bwEmptyCard} onPress={() => setShowLogWeight(true)}>
              <Ionicons name="scale-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.bwEmptyText}>Tap to log your weight</Text>
              <Text style={styles.bwEmptySubText}>
                Track your body composition over time. Log daily or weekly.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Water weekly average */}
        {weeklyWater > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Hydration (7-day avg)</Text>
            <View style={styles.waterCard}>
              <Ionicons name="water-outline" size={20} color="#4dd0e1" />
              <Text style={styles.waterAvgValue}>{(weeklyWater / 1000).toFixed(1)}L</Text>
              <Text style={styles.waterAvgLabel}>avg per day this week</Text>
              {weeklyWater < 2000 && (
                <View style={styles.waterWarning}>
                  <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
                  <Text style={styles.waterWarningText}>Below 2L. Performance suffers when dehydrated.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Muscle balance */}
        {Object.keys(muscleBalance).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Muscle balance (14 days)</Text>
            <View style={styles.balanceCard}>
              {Object.entries(muscleBalance)
                .sort((a, b) => b[1] - a[1])
                .map(([group, count]) => (
                  <View key={group} style={styles.balanceRow}>
                    <Text style={styles.balanceGroup}>{group}</Text>
                    <View style={styles.balanceBarContainer}>
                      <View
                        style={[
                          styles.balanceBar,
                          {
                            width: `${Math.min((count / 6) * 100, 100)}%`,
                            backgroundColor:
                              count >= 4 ? COLORS.warning :
                              count >= 2 ? COLORS.accent :
                              COLORS.textMuted,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.balanceCount}>{count}×</Text>
                  </View>
                ))}

              {imbalances.length > 0 && (
                <View style={styles.imbalanceSection}>
                  {imbalances.map((warning, i) => (
                    <View key={i} style={styles.imbalanceRow}>
                      <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
                      <Text style={styles.imbalanceText}>{warning}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Physique nav */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.physiqueNavCard}
            onPress={() => router.push('/physique')}
            activeOpacity={0.7}
          >
            <View style={styles.physiqueNavLeft}>
              <Text style={styles.physiqueNavTitle}>Physique Tracker</Text>
              <Text style={styles.physiqueNavSubtitle}>Weekly photos, side-by-side comparisons</Text>
            </View>
            <Ionicons name="camera-outline" size={24} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        {/* Lift charts */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Key lifts</Text>
          {liftData.map((lift) => (
            <LiftChart key={lift.name} lift={lift} />
          ))}
        </View>

        {/* PRs */}
        {prEntries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Personal records</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/records')}>
                <Text style={styles.seeAllText}>See all →</Text>
              </TouchableOpacity>
            </View>
            {prEntries
              .sort((a, b) => a[0].localeCompare(b[0]))
              .slice(0, 5)
              .map(([exercise, pr]) => (
                <View key={exercise} style={styles.prRow}>
                  <View style={styles.prLeft}>
                    <Text style={styles.prExercise}>{exercise}</Text>
                    <Text style={styles.prDate}>
                      {new Date(pr.date).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={styles.prRight}>
                    <Text style={styles.prWeight}>{pr.weight}kg</Text>
                    <Text style={styles.prReps}>× {pr.reps}</Text>
                  </View>
                </View>
              ))}
          </View>
        )}

        {sessions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No data yet.</Text>
            <Text style={styles.emptySubText}>
              Log sessions and your progress will appear here.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Log weight modal */}
      <Modal visible={showLogWeight} animationType="slide" presentationStyle="pageSheet" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log body weight</Text>
              <TouchableOpacity onPress={() => { setShowLogWeight(false); setWeightInput(''); }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Enter your weight in kg</Text>
            <View style={{ backgroundColor: '#222222', borderRadius: 10, borderWidth: 1, borderColor: '#444444' }}>
              <TextInput
                style={[styles.weightInput, { color: '#ffffff', backgroundColor: 'transparent' }]}
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder="e.g. 82.5"
                placeholderTextColor="#888888"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleLogWeight}
              />
            </View>
            <TouchableOpacity style={styles.logBtn} onPress={handleLogWeight}>
              <Text style={styles.logBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function LiftChart({ lift }: { lift: LiftData }) {
  if (lift.weights.length < 2) {
    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{lift.name}</Text>
        <View style={styles.chartEmpty}>
          <Text style={styles.chartEmptyText}>
            {lift.weights.length === 1
              ? `${lift.weights[0]}kg — log one more session to see the trend.`
              : 'No data yet.'}
          </Text>
        </View>
      </View>
    );
  }

  const maxPoints = 10;
  const recentDates = lift.dates.slice(-maxPoints);
  const recentWeights = lift.weights.slice(-maxPoints);

  const labels = recentDates.map((d, i) => {
    if (recentDates.length <= 5) return d;
    return i % Math.ceil(recentDates.length / 5) === 0 ? d : '';
  });

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{lift.name}</Text>
        <Text style={styles.chartPeak}>{Math.max(...recentWeights)}kg peak</Text>
      </View>
      <LineChart
        data={{ labels, datasets: [{ data: recentWeights }] }}
        width={screenWidth - SPACING.xl * 2 - SPACING.lg * 2}
        height={160}
        chartConfig={chartConfig}
        bezier
        withInnerLines={false}
        withOuterLines={false}
        style={styles.chart}
        formatYLabel={(v) => `${v}kg`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  screenTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.text },
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
  statValue: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.accent },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  section: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    gap: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  logWeightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  logWeightBtnText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.background },
  seeAllText: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '600' },
  // Body weight card
  bwCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  bwCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bwCurrent: { fontSize: FONT_SIZE.xxxl, fontWeight: '900', color: COLORS.success },
  bwLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  bwRight: { alignItems: 'flex-end', gap: SPACING.xs },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  trendUp: { backgroundColor: 'rgba(0,204,68,0.12)' },
  trendDown: { backgroundColor: 'rgba(255,136,0,0.12)' },
  trendText: { fontSize: FONT_SIZE.md, fontWeight: '800' },
  trendLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontWeight: '600' },
  bwOneEntry: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  bwEmptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bwEmptyText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.textSecondary },
  bwEmptySubText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Water
  waterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  waterAvgValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: '#4dd0e1' },
  waterAvgLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, flex: 1 },
  waterWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    width: '100%',
    marginTop: SPACING.xs,
  },
  waterWarningText: { fontSize: FONT_SIZE.xs, color: COLORS.warning, flex: 1 },
  // Muscle balance
  balanceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  balanceGroup: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    width: 80,
  },
  balanceBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  balanceBar: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  balanceCount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.text,
    width: 28,
    textAlign: 'right',
  },
  imbalanceSection: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  imbalanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
  },
  imbalanceText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
    flex: 1,
    lineHeight: 18,
  },
  // Physique nav
  physiqueNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  physiqueNavLeft: { gap: 3 },
  physiqueNavTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  physiqueNavSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  // Charts
  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  chartTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  chartPeak: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '700' },
  chart: { marginLeft: -SPACING.md, borderRadius: RADIUS.md },
  chartEmpty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: 'center' },
  // PRs
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  prLeft: { gap: 2 },
  prRight: { alignItems: 'flex-end', gap: 2 },
  prExercise: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text },
  prDate: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  prWeight: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.accent },
  prReps: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
  },
  emptyText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySubText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: 'center' },
  // Log weight modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  modalSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  weightInput: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  logBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  logBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.background },
});
