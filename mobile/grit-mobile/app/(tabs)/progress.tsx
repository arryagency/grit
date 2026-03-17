import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import {
  getSessions,
  getPRs,
  getStreak,
  WorkoutSession,
  PRRecord,
} from '@/utils/storage';
import { KEY_LIFTS, matchKeyLift } from '@/constants/exercises';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const screenWidth = Dimensions.get('window').width;

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
  propsForDots: {
    r: '4',
    strokeWidth: '2',
    stroke: COLORS.accent,
  },
  propsForBackgroundLines: {
    stroke: COLORS.border,
    strokeDasharray: '',
  },
};

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [prs, setPRs] = useState<PRRecord>({});

  useFocusEffect(
    useCallback(() => {
      Promise.all([getSessions(), getPRs()]).then(([s, p]) => {
        setSessions(s);
        setPRs(p);
      });
    }, [])
  );

  const streak = getStreak(sessions, 3);
  const liftData = buildLiftData(sessions);
  const prEntries = Object.entries(prs);

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
            <Text style={styles.sectionLabel}>Personal records</Text>
            {prEntries.sort((a, b) => a[0].localeCompare(b[0])).map(([exercise, pr]) => (
              <View key={exercise} style={styles.prRow}>
                <View style={styles.prLeft}>
                  <Text style={styles.prExercise}>{exercise}</Text>
                  <Text style={styles.prDate}>
                    {new Date(pr.date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
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

  // Format labels to avoid clutter
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
  screenTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.text,
  },
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
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.accent,
  },
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
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
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
  chartTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  chartPeak: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '700',
  },
  chart: {
    marginLeft: -SPACING.md,
    borderRadius: RADIUS.md,
  },
  chartEmpty: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
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
  prExercise: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  prDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  prWeight: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accent,
  },
  prReps: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  emptySubText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
