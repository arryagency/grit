import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPRs, PRRecord, savePRManually } from '@/utils/storage';
import { ALL_EXERCISES } from '@/constants/exercises';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function RecordsScreen() {
  const [prs, setPRs] = useState<PRRecord>({});
  const [showAddPR, setShowAddPR] = useState(false);
  const [prExercise, setPrExercise] = useState('');
  const [prWeight, setPrWeight] = useState('');
  const [prReps, setPrReps] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getPRs().then(setPRs);
    }, [])
  );

  const entries = Object.entries(prs).sort((a, b) => a[0].localeCompare(b[0]));
  const totalVolume = entries.reduce((sum, [, pr]) => sum + pr.volume, 0);

  const filteredExercises = exerciseSearch.trim()
    ? ALL_EXERCISES.filter((e) => e.toLowerCase().includes(exerciseSearch.toLowerCase()))
    : ALL_EXERCISES;

  async function handleSavePR() {
    if (!prExercise) {
      Alert.alert('Select an exercise first.');
      return;
    }
    const w = parseFloat(prWeight);
    const r = parseInt(prReps, 10);
    if (!w || w <= 0) {
      Alert.alert('Enter a valid weight.');
      return;
    }
    if (!r || r <= 0) {
      Alert.alert('Enter valid reps.');
      return;
    }
    setSaving(true);
    await savePRManually(prExercise, w, r);
    const updated = await getPRs();
    setPRs(updated);
    setSaving(false);
    setShowAddPR(false);
    setPrExercise('');
    setPrWeight('');
    setPrReps('');
    setExerciseSearch('');
  }

  function openAddPR() {
    setPrExercise('');
    setPrWeight('');
    setPrReps('');
    setExerciseSearch('');
    setShowAddPR(true);
  }

  if (entries.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Records</Text>
          <Text style={styles.screenSubtitle}>Your all-time personal bests</Text>
        </View>
        <TouchableOpacity style={styles.addPRBtn} onPress={openAddPR}>
          <Ionicons name="add" size={18} color={COLORS.background} />
          <Text style={styles.addPRBtnText}>Add PR manually</Text>
        </TouchableOpacity>
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={56} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No records yet.</Text>
          <Text style={styles.emptySubText}>
            Log sessions to set PRs automatically, or add them manually above.
          </Text>
        </View>
        <AddPRModal
          visible={showAddPR}
          exercise={prExercise}
          weight={prWeight}
          reps={prReps}
          search={exerciseSearch}
          filteredExercises={filteredExercises}
          showPicker={showExercisePicker}
          saving={saving}
          onSearchChange={setExerciseSearch}
          onPickerToggle={setShowExercisePicker}
          onSelectExercise={(e) => { setPrExercise(e); setShowExercisePicker(false); }}
          onWeightChange={setPrWeight}
          onRepsChange={setPrReps}
          onSave={handleSavePR}
          onClose={() => setShowAddPR(false)}
        />
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

      {/* Add PR button */}
      <TouchableOpacity style={styles.addPRBtn} onPress={openAddPR}>
        <Ionicons name="add" size={18} color={COLORS.background} />
        <Text style={styles.addPRBtnText}>Add PR manually</Text>
      </TouchableOpacity>

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

      <AddPRModal
        visible={showAddPR}
        exercise={prExercise}
        weight={prWeight}
        reps={prReps}
        search={exerciseSearch}
        filteredExercises={filteredExercises}
        showPicker={showExercisePicker}
        saving={saving}
        onSearchChange={setExerciseSearch}
        onPickerToggle={setShowExercisePicker}
        onSelectExercise={(e) => { setPrExercise(e); setShowExercisePicker(false); }}
        onWeightChange={setPrWeight}
        onRepsChange={setPrReps}
        onSave={handleSavePR}
        onClose={() => setShowAddPR(false)}
      />
    </SafeAreaView>
  );
}

// ─── Add PR Modal ─────────────────────────────────────────────────────────────

interface AddPRModalProps {
  visible: boolean;
  exercise: string;
  weight: string;
  reps: string;
  search: string;
  filteredExercises: string[];
  showPicker: boolean;
  saving: boolean;
  onSearchChange: (v: string) => void;
  onPickerToggle: (v: boolean) => void;
  onSelectExercise: (e: string) => void;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}

function AddPRModal({
  visible, exercise, weight, reps, search, filteredExercises,
  showPicker, saving, onSearchChange, onPickerToggle, onSelectExercise,
  onWeightChange, onRepsChange, onSave, onClose,
}: AddPRModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modal.overlay}
      >
        <View style={modal.sheet}>
          <View style={modal.header}>
            <Text style={modal.title}>Add PR manually</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Exercise selector */}
          <Text style={modal.label}>Exercise</Text>
          <TouchableOpacity
            style={[modal.exerciseBtn, exercise && modal.exerciseBtnSelected]}
            onPress={() => onPickerToggle(!showPicker)}
          >
            <Text style={[modal.exerciseBtnText, exercise && { color: COLORS.text }]}>
              {exercise || 'Select exercise…'}
            </Text>
            <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          {showPicker && (
            <>
              <TextInput
                style={modal.searchInput}
                value={search}
                onChangeText={onSearchChange}
                placeholder="Search exercises…"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
              <View style={modal.exerciseList}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {filteredExercises.slice(0, 20).map((e) => (
                    <TouchableOpacity
                      key={e}
                      style={[modal.exerciseItem, e === exercise && modal.exerciseItemActive]}
                      onPress={() => onSelectExercise(e)}
                    >
                      <Text style={[modal.exerciseItemText, e === exercise && { color: COLORS.accent }]}>
                        {e}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </>
          )}

          {/* Weight + reps */}
          {!showPicker && (
            <>
              <View style={modal.row}>
                <View style={{ flex: 1 }}>
                  <Text style={modal.label}>Weight (kg)</Text>
                  <TextInput
                    style={modal.input}
                    value={weight}
                    onChangeText={onWeightChange}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={modal.label}>Reps</Text>
                  <TextInput
                    style={modal.input}
                    value={reps}
                    onChangeText={onRepsChange}
                    keyboardType="number-pad"
                    placeholder="5"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[modal.saveBtn, saving && { opacity: 0.5 }]}
                onPress={onSave}
                disabled={saving}
              >
                <Text style={modal.saveBtnText}>{saving ? 'Saving…' : 'Save PR'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── PR Card ─────────────────────────────────────────────────────────────────

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
    paddingBottom: SPACING.md,
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
    marginBottom: SPACING.sm,
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
  addPRBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignSelf: 'flex-start',
  },
  addPRBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.background,
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

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.xl,
    gap: SPACING.md,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.text },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  exerciseBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  exerciseBtnSelected: {
    borderColor: COLORS.accent + '60',
  },
  exerciseBtnText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
  },
  searchInput: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontSize: FONT_SIZE.md,
  },
  exerciseList: {
    maxHeight: 220,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exerciseItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  exerciseItemActive: {
    backgroundColor: COLORS.accentDim,
  },
  exerciseItemText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.text,
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  saveBtnText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.background,
  },
});
