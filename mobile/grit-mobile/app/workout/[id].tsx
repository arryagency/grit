import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getSessions, deleteSession, WorkoutSession } from '@/utils/storage';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);

  useEffect(() => {
    getSessions().then((sessions) => {
      const found = sessions.find((s) => s.id === id);
      setSession(found ?? null);
    });
  }, [id]);

  function handleDelete() {
    Alert.alert('Delete session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (id) {
            await deleteSession(id);
            router.back();
          }
        },
      },
    ]);
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Session not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const date = new Date(session.date);
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const totalSets = session.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0
  );
  const totalVolume = session.exercises.reduce(
    (acc, ex) =>
      acc + ex.sets.filter((s) => s.completed).reduce((a, s) => a + s.weight * s.reps, 0),
    0
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Session meta */}
        <View style={styles.metaCard}>
          <Text style={styles.dateText}>{dateStr}</Text>
          <View style={styles.statsRow}>
            {session.duration > 0 && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{session.duration}</Text>
                <Text style={styles.statLabel}>min</Text>
              </View>
            )}
            <View style={styles.stat}>
              <Text style={styles.statValue}>{session.exercises.length}</Text>
              <Text style={styles.statLabel}>exercises</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalSets}</Text>
              <Text style={styles.statLabel}>sets</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{(totalVolume / 1000).toFixed(1)}t</Text>
              <Text style={styles.statLabel}>volume</Text>
            </View>
          </View>
        </View>

        {/* Exercises */}
        {session.exercises.map((ex, exIdx) => {
          const completedSets = ex.sets.filter((s) => s.completed);
          const topWeight = completedSets.length > 0 ? Math.max(...completedSets.map((s) => s.weight)) : 0;

          return (
            <View key={exIdx} style={styles.exerciseBlock}>
              <View style={styles.exHeader}>
                <Text style={styles.exName}>{ex.name}</Text>
                {topWeight > 0 && (
                  <Text style={styles.topWeight}>{topWeight}kg top set</Text>
                )}
              </View>

              {/* Set table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, styles.tableHeaderText, { width: 40 }]}>Set</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Weight</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Reps</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Volume</Text>
              </View>

              {ex.sets.map((set, setIdx) => {
                const isPR = set.isPR;
                return (
                  <View
                    key={setIdx}
                    style={[styles.tableRow, !set.completed && styles.tableRowSkipped]}
                  >
                    <Text style={[styles.tableCell, { width: 40 }]}>{setIdx + 1}</Text>
                    <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                      <Text style={styles.setCellText}>{set.weight}kg</Text>
                      {isPR && (
                        <View style={styles.prBadge}>
                          <Text style={styles.prText}>PR</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tableCell, styles.setCellText, { flex: 1 }]}>
                      {set.reps} reps
                    </Text>
                    <Text style={[styles.tableCell, styles.setCellText, { flex: 1 }]}>
                      {set.completed ? `${set.weight * set.reps}kg` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Delete button */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          <Text style={styles.deleteText}>Delete session</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.lg },
  metaCard: {
    margin: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  dateText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.accent,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseBlock: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  exHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  exName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  topWeight: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceAlt,
  },
  tableHeaderText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tableRowSkipped: {
    opacity: 0.4,
  },
  tableCell: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  setCellText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  prBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  prText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.background,
    letterSpacing: 0.5,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,64,64,0.3)',
  },
  deleteText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontWeight: '600',
  },
});
