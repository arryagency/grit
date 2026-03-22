import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  getSessions,
  saveSession,
  deleteSession,
  WorkoutSession,
  ExerciseLog,
  SetLog,
} from '@/utils/storage';
import { ALL_EXERCISES } from '@/constants/exercises';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<WorkoutSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getSessions().then((sessions) => {
      const found = sessions.find((s) => s.id === id) ?? null;
      setSession(found);
    });
  }, [id]);

  // ─── Edit helpers ─────────────────────────────────────────────────────────

  function enterEdit() {
    if (!session) return;
    setDraft(JSON.parse(JSON.stringify(session))); // deep clone
    setEditMode(true);
  }

  function cancelEdit() {
    setDraft(null);
    setEditMode(false);
  }

  async function saveEdit() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveSession(draft);
      router.replace('/(tabs)/');
    } finally {
      setSaving(false);
    }
  }

  function updateSetField(
    exIdx: number,
    setIdx: number,
    field: 'weight' | 'reps',
    value: string
  ) {
    if (!draft) return;
    const d = JSON.parse(JSON.stringify(draft)) as WorkoutSession;
    const num = parseFloat(value) || 0;
    d.exercises[exIdx].sets[setIdx] = { ...d.exercises[exIdx].sets[setIdx], [field]: num };
    setDraft(d);
  }

  function deleteSet(exIdx: number, setIdx: number) {
    if (!draft) return;
    const d = JSON.parse(JSON.stringify(draft)) as WorkoutSession;
    if (d.exercises[exIdx].sets.length <= 1) {
      // Remove entire exercise if last set deleted
      d.exercises = d.exercises.filter((_, i) => i !== exIdx);
    } else {
      d.exercises[exIdx].sets = d.exercises[exIdx].sets.filter((_, i) => i !== setIdx);
    }
    setDraft(d);
  }

  function addSetToExercise(exIdx: number) {
    if (!draft) return;
    const d = JSON.parse(JSON.stringify(draft)) as WorkoutSession;
    const ex = d.exercises[exIdx];
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ ...last, completed: true, isPR: false });
    setDraft(d);
  }

  function addExerciseToDraft(name: string) {
    if (!draft) return;
    const d = JSON.parse(JSON.stringify(draft)) as WorkoutSession;
    const existing = d.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.sets.push({ weight: 0, reps: 8, completed: true, isPR: false });
    } else {
      d.exercises.push({ name, sets: [{ weight: 0, reps: 8, completed: true, isPR: false }] });
    }
    setDraft(d);
    setShowExerciseModal(false);
    setSearch('');
  }

  // ─── Delete session ────────────────────────────────────────────────────────

  function handleDelete() {
    Alert.alert('Delete session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (id) { await deleteSession(id); router.back(); }
        },
      },
    ]);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Session not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayed = editMode && draft ? draft : session;

  const date = new Date(displayed.date);
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const totalSets = displayed.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0
  );
  const totalVolume = displayed.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).reduce((a, s) => a + s.weight * s.reps, 0), 0
  );

  const filteredExercises = search.trim()
    ? ALL_EXERCISES.filter((e) => e.toLowerCase().includes(search.toLowerCase()))
    : ALL_EXERCISES;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header with back button */}
        {!editMode && (
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => router.replace('/(tabs)/')} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.screenHeaderTitle}>Session</Text>
            <View style={{ width: 40 }} />
          </View>
        )}

        {/* Edit mode toolbar */}
        {editMode && (
          <View style={styles.editToolbar}>
            <TouchableOpacity onPress={cancelEdit}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.editingLabel}>Editing session</Text>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={saveEdit}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Session meta */}
          <View style={styles.metaCard}>
            <View style={styles.metaTop}>
              <Text style={styles.dateText}>{dateStr}</Text>
              {!editMode && (
                <TouchableOpacity style={styles.editButton} onPress={enterEdit}>
                  <Ionicons name="pencil" size={15} color={COLORS.accent} />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.statsRow}>
              {displayed.duration > 0 && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{displayed.duration}</Text>
                  <Text style={styles.statLabel}>min</Text>
                </View>
              )}
              <View style={styles.stat}>
                <Text style={styles.statValue}>{displayed.exercises.length}</Text>
                <Text style={styles.statLabel}>exercises</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{totalSets}</Text>
                <Text style={styles.statLabel}>sets</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`}
                </Text>
                <Text style={styles.statLabel}>volume</Text>
              </View>
            </View>
          </View>

          {/* Exercises */}
          {displayed.exercises.map((ex, exIdx) => {
            const completedSets = ex.sets.filter((s) => s.completed);
            const topWeight = completedSets.length > 0
              ? Math.max(...completedSets.map((s) => s.weight))
              : 0;

            return (
              <View key={exIdx} style={styles.exerciseBlock}>
                <View style={styles.exHeader}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  {topWeight > 0 && !editMode && (
                    <Text style={styles.topWeight}>{topWeight}kg top set</Text>
                  )}
                </View>

                {/* Table header */}
                {!editMode && (
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { width: 40 }]}>Set</Text>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Weight</Text>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Reps</Text>
                    <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1 }]}>Volume</Text>
                  </View>
                )}

                {ex.sets.map((set, setIdx) => (
                  editMode
                    ? <EditSetRow
                        key={setIdx}
                        setNum={setIdx + 1}
                        set={set}
                        onWeightChange={(v) => updateSetField(exIdx, setIdx, 'weight', v)}
                        onRepsChange={(v) => updateSetField(exIdx, setIdx, 'reps', v)}
                        onDelete={() => deleteSet(exIdx, setIdx)}
                      />
                    : <ReadSetRow key={setIdx} setNum={setIdx + 1} set={set} />
                ))}

                {/* Edit mode: add set */}
                {editMode && (
                  <TouchableOpacity
                    style={styles.addSetBtn}
                    onPress={() => addSetToExercise(exIdx)}
                  >
                    <Ionicons name="add" size={14} color={COLORS.accent} />
                    <Text style={styles.addSetBtnText}>Add set</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Edit mode: add exercise */}
          {editMode && (
            <TouchableOpacity
              style={styles.addExerciseBtn}
              onPress={() => setShowExerciseModal(true)}
            >
              <Ionicons name="add-circle-outline" size={20} color={COLORS.accent} />
              <Text style={styles.addExerciseBtnText}>Add exercise</Text>
            </TouchableOpacity>
          )}

          {/* Delete / actions */}
          {!editMode && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
              <Text style={styles.deleteText}>Delete session</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add exercise modal */}
      <Modal visible={showExerciseModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add exercise</Text>
            <TouchableOpacity onPress={() => { setShowExerciseModal(false); setSearch(''); }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises..."
            placeholderTextColor={COLORS.textMuted}
            autoFocus
          />
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.exerciseItem}
                onPress={() => addExerciseToDraft(item)}
              >
                <Text style={styles.exerciseItemText}>{item}</Text>
                <Ionicons name="add" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Read-only set row ────────────────────────────────────────────────────────

function ReadSetRow({ setNum, set }: { setNum: number; set: SetLog }) {
  return (
    <View style={[styles.tableRow, !set.completed && styles.tableRowSkipped]}>
      <View style={{ width: 40, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={styles.tableCell}>{setNum}</Text>
        {set.warmUp && <Text style={styles.warmTag}>W</Text>}
      </View>
      <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
        <Text style={styles.setCellText}>{set.weight}kg</Text>
        {set.isPR && (
          <View style={styles.prBadge}>
            <Text style={styles.prText}>PR</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tableCell, styles.setCellText, { flex: 1 }]}>{set.reps} reps</Text>
      <Text style={[styles.tableCell, styles.setCellText, { flex: 1 }]}>
        {set.completed ? `${set.weight * set.reps}kg` : '—'}
      </Text>
    </View>
  );
}

// ─── Editable set row ─────────────────────────────────────────────────────────

function EditSetRow({
  setNum,
  set,
  onWeightChange,
  onRepsChange,
  onDelete,
}: {
  setNum: number;
  set: SetLog;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
  onDelete: () => void;
}) {
  return (
    <View style={editSetStyles.row}>
      <Text style={editSetStyles.setNum}>{setNum}</Text>
      {set.warmUp && <Text style={editSetStyles.warmTag}>W</Text>}

      <View style={editSetStyles.fieldGroup}>
        <TextInput
          style={editSetStyles.input}
          value={set.weight === 0 ? '' : String(set.weight)}
          onChangeText={onWeightChange}
          keyboardType="decimal-pad"
          placeholder="kg"
          placeholderTextColor={COLORS.textMuted}
          selectTextOnFocus
        />
        <Text style={editSetStyles.unit}>kg</Text>
      </View>

      <Text style={editSetStyles.x}>×</Text>

      <View style={editSetStyles.fieldGroup}>
        <TextInput
          style={editSetStyles.input}
          value={set.reps === 0 ? '' : String(set.reps)}
          onChangeText={onRepsChange}
          keyboardType="number-pad"
          placeholder="reps"
          placeholderTextColor={COLORS.textMuted}
          selectTextOnFocus
        />
        <Text style={editSetStyles.unit}>reps</Text>
      </View>

      <TouchableOpacity onPress={onDelete} hitSlop={8}>
        <Ionicons name="close-circle" size={20} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.lg },

  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  screenHeaderTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  backBtn: { width: 40, alignItems: 'flex-start' },

  // Edit toolbar
  editToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent + '40',
  },
  cancelText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: '600' },
  editingLabel: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '700' },
  saveBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  saveBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.background },

  metaCard: {
    margin: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  metaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateText: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text, flex: 1 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentDim,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent + '60',
  },
  editButtonText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.accent },

  statsRow: { flexDirection: 'row', gap: SPACING.xl },
  stat: { alignItems: 'center' },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.accent },
  statLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

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
  exName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.text },
  topWeight: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },

  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceAlt,
  },
  tableHeaderText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
  },
  tableRowSkipped: { opacity: 0.4 },
  tableCell: { fontSize: FONT_SIZE.sm, color: COLORS.text },
  setCellText: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: '600' },
  warmTag: { fontSize: 9, fontWeight: '800', color: COLORS.warning },
  prBadge: { backgroundColor: COLORS.accent, borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 1 },
  prText: { fontSize: 9, fontWeight: '900', color: COLORS.background, letterSpacing: 0.5 },

  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  addSetBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '600' },

  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  addExerciseBtnText: { fontSize: FONT_SIZE.md, color: COLORS.accent, fontWeight: '700' },

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
  deleteText: { fontSize: FONT_SIZE.sm, color: COLORS.danger, fontWeight: '600' },

  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  searchInput: {
    margin: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  exerciseItemText: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: '500' },
});

const editSetStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  setNum: { width: 20, fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  warmTag: { fontSize: 9, fontWeight: '800', color: COLORS.warning, width: 12 },
  fieldGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    gap: 4,
  },
  input: {
    flex: 1,
    height: 36,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  unit: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontWeight: '600' },
  x: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, fontWeight: '300' },
});
