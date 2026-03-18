import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPRs, PRRecord } from '@/utils/storage';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function RecordsScreen() {
  const [prs, setPRs] = useState<PRRecord>({});

  useFocusEffect(
    useCallback(() => {
      getPRs().then(setPRs);
    }, [])
  );

  const entries = Object.entries(prs).sort((a, b) => a[0].localeCompare(b[0]));
  const totalVolume = entries.reduce((sum, [, pr]) => sum + pr.volume, 0);

  if (entries.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Records</Text>
          <Text style={styles.screenSubtitle}>Your all-time personal bests</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={56} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No records yet.</Text>
          <Text style={styles.emptySubText}>
            Log your first session and your PRs will appear here. Lift heavy.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Records</Text>
          <Text style={styles.screenSubtitle}>Your all-time personal bests</Text>
        </View>
        <View style={styles.badgeGroup}>
          <View style={styles.badge}>
            <Text style={styles.badgeValue}>{entries.length}</Text>
            <Text style={styles.badgeLabel}>lifts</Text>
          </View>
        </View>
      </View>

      {/* Summary banner */}
      <View style={styles.summaryBanner}>
        <Ionicons name="trophy" size={18} color={COLORS.accent} />
        <Text style={styles.summaryText}>
          {entries.length} exercises tracked.{' '}
          {totalVolume >= 1000
            ? `${(totalVolume / 1000).toFixed(1)}t`
            : `${Math.round(totalVolume)}kg`}{' '}
          total PR volume across all lifts.
        </Text>
      </View>

      <FlatList
        data={entries}
        keyExtractor={([name]) => name}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: [exercise, pr], index }) => (
          <PRCard
            exercise={exercise}
            weight={pr.weight}
            reps={pr.reps}
            date={pr.date}
            volume={pr.volume}
            rank={index + 1}
          />
        )}
      />
    </SafeAreaView>
  );
}

interface PRCardProps {
  exercise: string;
  weight: number;
  reps: number;
  date: string;
  volume: number;
  rank: number;
}

function PRCard({ exercise, weight, reps, date, volume, rank }: PRCardProps) {
  const dateStr = new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Top 3 get gold/silver/bronze styling
  const isTop = rank <= 3;
  const rankColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32';

  return (
    <View style={[styles.card, isTop && styles.cardTop]}>
      <View style={styles.cardLeft}>
        <View style={styles.rankRow}>
          <Text style={[styles.rankNum, isTop && { color: rankColor }]}>
            {rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
          </Text>
          <Text style={styles.exerciseName}>{exercise}</Text>
        </View>
        <Text style={styles.dateText}>Set on {dateStr}</Text>
        <Text style={styles.volumeText}>{Math.round(volume)}kg total volume</Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.weightText}>{weight}kg</Text>
        <Text style={styles.repsText}>× {reps}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  screenTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.text,
  },
  screenSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  badgeGroup: { alignItems: 'flex-end' },
  badge: {
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  badgeValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.accent,
  },
  badgeLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  summaryText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.sm,
  },
  card: {
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
  cardTop: {
    borderColor: COLORS.accent + '60',
    backgroundColor: COLORS.accentDim,
  },
  cardLeft: { flex: 1, gap: 3 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rankNum: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.textMuted,
    minWidth: 24,
  },
  exerciseName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginLeft: 32,
  },
  volumeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginLeft: 32,
  },
  weightText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.accent,
  },
  repsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
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
    lineHeight: 20,
  },
});
