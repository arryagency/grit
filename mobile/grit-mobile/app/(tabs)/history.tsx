import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useCallback } from 'react';
import { useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSessions, WorkoutSession, formatDate } from '@/utils/storage';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSessions().then((s) =>
        setSessions([...s].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
      );
    }, [])
  );

  if (sessions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>History</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No sessions yet.</Text>
          <Text style={styles.emptySubText}>
            Log your first workout and it'll appear here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>History</Text>
        <Text style={styles.sessionCount}>{sessions.length} sessions</Text>
      </View>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard session={item} onPress={() => router.push(`/workout/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce((t, ex) =>
    t + ex.sets.reduce((s, set) =>
      s + (set.completed && set.weight > 0 ? set.weight * set.reps : 0), 0), 0);
}

function formatVolume(vol: number): string {
  if (vol === 0) return '';
  return vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : `${Math.round(vol)}kg`;
}

function SessionCard({
  session,
  onPress,
}: {
  session: WorkoutSession;
  onPress: () => void;
}) {
  const topExercises = session.exercises.slice(0, 4);
  const totalSets = session.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0);
  const vol = sessionVolume(session);
  const hasPR = session.exercises.some((ex) => ex.sets.some((s) => s.isPR));

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={styles.cardDateRow}>
          <Text style={styles.cardDate}>{formatDate(session.date)}</Text>
          {hasPR && <Text style={styles.prTag}>PR</Text>}
        </View>
        <View style={styles.cardMeta}>
          {session.duration > 0 && (
            <Text style={styles.metaText}>{session.duration}m</Text>
          )}
          <Text style={styles.metaText}>{totalSets} sets</Text>
          {vol > 0 && <Text style={styles.metaVol}>{formatVolume(vol)}</Text>}
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>
      </View>

      <View style={styles.exercisePills}>
        {topExercises.map((ex, i) => (
          <View key={i} style={styles.pill}>
            <Text style={styles.pillText}>{ex.name}</Text>
          </View>
        ))}
        {session.exercises.length > 4 && (
          <View style={[styles.pill, styles.pillMore]}>
            <Text style={styles.pillText}>+{session.exercises.length - 4}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  screenTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.text,
  },
  sessionCount: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardDate: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  prTag: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.background,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  metaText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  metaVol: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '700',
  },
  exercisePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  pill: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillMore: {
    borderColor: COLORS.textMuted,
  },
  pillText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xxl,
  },
  emptyText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  emptySubText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
