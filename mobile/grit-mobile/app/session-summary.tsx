import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getSessions, getWeeklyVolume, WorkoutSession } from '@/utils/storage';
import { getSessionComment } from '@/utils/progressiveOverload';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function SessionSummaryScreen() {
  const { sessionId, prs } = useLocalSearchParams<{ sessionId: string; prs: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [weekVolume, setWeekVolume] = useState<{ current: number; best: number }>({ current: 0, best: 0 });

  useEffect(() => {
    getSessions().then((sessions) => {
      const found = sessions.find((s) => s.id === sessionId) ?? null;
      setSession(found);
      setWeekVolume(getWeeklyVolume(sessions));
    });
  }, [sessionId]);

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const newPRsCount = parseInt(prs ?? '0', 10);
  const completedSets = session.exercises.reduce(
    (t, ex) => t + ex.sets.filter((s) => s.completed).length, 0
  );
  const totalVolume = session.exercises.reduce(
    (t, ex) => t + ex.sets.reduce((s, set) =>
      s + (set.completed && set.weight > 0 ? set.weight * set.reps : 0), 0), 0
  );
  const comment = getSessionComment(
    session.exercises.length,
    completedSets,
    totalVolume,
    session.duration,
    newPRsCount
  );

  // Weekly volume PR check — current week > previous best (before this session's week)
  // weekVolume.current includes today; if it equals best, this week is the new best
  const weeklyPR = weekVolume.current > 0 && weekVolume.current >= weekVolume.best;

  const volumeDisplay = totalVolume >= 1000
    ? `${(totalVolume / 1000).toFixed(1)}t`
    : `${Math.round(totalVolume)}kg`;

  function done() {
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>GRIT</Text>
          <Text style={styles.title}>Session complete</Text>
        </View>

        {/* GRIT comment */}
        <View style={styles.commentCard}>
          <Text style={styles.commentText}>{comment}</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatBox label="Volume" value={volumeDisplay} />
          <StatBox label="Sets" value={String(completedSets)} />
          <StatBox label="Exercises" value={String(session.exercises.length)} />
          {session.duration > 0 && (
            <StatBox label="Time" value={`${session.duration}m`} />
          )}
        </View>

        {/* PR banner */}
        {newPRsCount > 0 && (
          <View style={styles.prBanner}>
            <Text style={styles.prBannerEmoji}>🏆</Text>
            <Text style={styles.prBannerText}>
              {newPRsCount === 1 ? '1 new personal record' : `${newPRsCount} new personal records`}
            </Text>
          </View>
        )}

        {/* Weekly volume PR */}
        {weeklyPR && (
          <View style={styles.weekBanner}>
            <Ionicons name="trending-up" size={16} color={COLORS.accent} />
            <Text style={styles.weekBannerText}>
              Best week ever. You did more total work this week than any week before.
            </Text>
          </View>
        )}

        {/* Exercise breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What you did</Text>
          {session.exercises.map((ex, i) => {
            const doneSets = ex.sets.filter((s) => s.completed && s.weight > 0);
            if (doneSets.length === 0) return null;
            const topWeight = Math.max(...doneSets.map((s) => s.weight));
            const totalExVol = doneSets.reduce((t, s) => t + s.weight * s.reps, 0);
            return (
              <View key={i} style={styles.exRow}>
                <View style={styles.exLeft}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exSets}>
                    {doneSets.map((s) => `${s.weight}kg×${s.reps}`).join('  ')}
                  </Text>
                </View>
                <View style={styles.exRight}>
                  <Text style={styles.exTop}>{topWeight}kg</Text>
                  <Text style={styles.exVol}>{Math.round(totalExVol)}kg vol</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Done button */}
        <TouchableOpacity style={styles.doneButton} onPress={done}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: COLORS.textMuted, fontSize: FONT_SIZE.md },
  header: { alignItems: 'center', marginBottom: SPACING.xl, gap: SPACING.xs },
  logo: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 4,
  },
  title: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: '600' },
  commentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  commentText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.accent },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  prBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  prBannerEmoji: { fontSize: 20 },
  prBannerText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.accent },
  weekBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  weekBannerText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '600',
    lineHeight: 20,
  },
  section: { marginTop: SPACING.lg, gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  exLeft: { flex: 1, gap: 2 },
  exRight: { alignItems: 'flex-end', gap: 2 },
  exName: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.text },
  exSets: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  exTop: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.accent },
  exVol: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  doneButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.xxl,
  },
  doneButtonText: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.background },
});
