import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotificationSettings,
  saveNotificationSettings,
  NotificationSettings,
} from '@/utils/storage';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

// ─── Time picker data ─────────────────────────────────────────────────────────

interface TimeOption { label: string; value: string }

function buildTimes(): TimeOption[] {
  const times: TimeOption[] = [];
  for (let h = 5; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 23 && m > 0) break;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const value = `${hh}:${mm}`;
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? 'pm' : 'am';
      const label = m === 0 ? `${h12}:00 ${ampm}` : `${h12}:${mm} ${ampm}`;
      times.push({ label, value });
    }
  }
  return times;
}

const TIME_OPTIONS = buildTimes();
const TIME_ITEM_H = 52;
const PICKER_VISIBLE = 5;
const PICKER_H = TIME_ITEM_H * PICKER_VISIBLE;

// ─── SettingsTimeItem ─────────────────────────────────────────────────────────

const SettingsTimeItem = memo(function SettingsTimeItem({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={pickerStyles.item} activeOpacity={0.6} onPress={onPress}>
      <Text style={[pickerStyles.itemText, isSelected && pickerStyles.itemTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ─── SettingsTimePicker ───────────────────────────────────────────────────────

const SettingsTimePicker = memo(function SettingsTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [localSelected, setLocalSelected] = useState(
    () => value || TIME_OPTIONS[12].value
  );

  const initialOffset = useRef(
    Math.max(0, TIME_OPTIONS.findIndex((t) => t.value === (value || TIME_OPTIONS[12].value))) *
      TIME_ITEM_H
  );

  useEffect(() => {
    if (!value && localSelected !== TIME_OPTIONS[12].value) {
      setLocalSelected(TIME_OPTIONS[12].value);
      scrollRef.current?.scrollTo({ y: 12 * TIME_ITEM_H, animated: true });
    }
  }, [value]);

  function commitIdx(rawY: number) {
    const idx = Math.max(
      0,
      Math.min(Math.round(rawY / TIME_ITEM_H), TIME_OPTIONS.length - 1)
    );
    const v = TIME_OPTIONS[idx].value;
    setLocalSelected(v);
    onChangeRef.current(v);
  }

  return (
    <View style={pickerStyles.wrapper}>
      <View pointerEvents="none" style={pickerStyles.selectionBand} />
      <ScrollView
        ref={scrollRef}
        style={{ height: PICKER_H }}
        contentContainerStyle={{
          paddingVertical: TIME_ITEM_H * Math.floor(PICKER_VISIBLE / 2),
        }}
        contentOffset={{ x: 0, y: initialOffset.current }}
        snapToInterval={TIME_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScrollEndDrag={(e) => commitIdx(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => commitIdx(e.nativeEvent.contentOffset.y)}
      >
        {TIME_OPTIONS.map((item, index) => (
          <SettingsTimeItem
            key={item.value}
            label={item.label}
            isSelected={item.value === localSelected}
            onPress={() => {
              scrollRef.current?.scrollTo({ y: index * TIME_ITEM_H, animated: true });
              setLocalSelected(item.value);
              onChangeRef.current(item.value);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings>({
    trainingDayReminder: true,
    missedSessionAlert: false,
    streakProtection: false,
    progressionSuggestions: false,
    creatineReminder: false,
    creatineReminderTime: '08:00',
    customReminder: false,
    customReminderText: '',
    customReminderTime: '09:00',
  });

  useFocusEffect(
    useCallback(() => {
      getNotificationSettings().then(setSettings);
    }, [])
  );

  async function toggle(key: keyof NotificationSettings, value: boolean) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveNotificationSettings({ [key]: value });
  }

  function confirmReset() {
    Alert.alert(
      'Reset all data?',
      'Wipes every session, PR, program, and your profile. Cannot be undone.',
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Training day reminders"
            description="Morning reminder on scheduled training days"
            value={settings.trainingDayReminder}
            onToggle={(v) => toggle('trainingDayReminder', v)}
          />
          <Divider />
          <ToggleRow
            label="Missed session alerts"
            description="Notification when you've gone too long without training"
            value={settings.missedSessionAlert}
            onToggle={(v) => toggle('missedSessionAlert', v)}
          />
          <Divider />
          <ToggleRow
            label="Streak protection"
            description="Evening nudge if your streak is at risk"
            value={settings.streakProtection}
            onToggle={(v) => toggle('streakProtection', v)}
          />
          <Divider />
          <ToggleRow
            label="Progression suggestions"
            description="Notify when you're ready to increase weight"
            value={settings.progressionSuggestions}
            onToggle={(v) => toggle('progressionSuggestions', v)}
          />
        </View>

        {/* Custom reminders */}
        <Text style={styles.sectionLabel}>Custom Reminders</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Creatine reminder"
            description={`Daily reminder at ${settings.creatineReminderTime}`}
            value={settings.creatineReminder}
            onToggle={(v) => toggle('creatineReminder', v)}
          />
          {settings.creatineReminder && (
            <View style={styles.inlineInputs}>
              <Text style={styles.inlineLabel}>Time</Text>
              <SettingsTimePicker
                value={settings.creatineReminderTime}
                onChange={(t) => {
                  const updated = { ...settings, creatineReminderTime: t };
                  setSettings(updated);
                  saveNotificationSettings({ creatineReminderTime: t });
                }}
              />
            </View>
          )}
          <Divider />
          <ToggleRow
            label="Custom reminder"
            description={
              settings.customReminderText
                ? `"${settings.customReminderText}" at ${settings.customReminderTime}`
                : 'Set your own daily reminder'
            }
            value={settings.customReminder}
            onToggle={(v) => toggle('customReminder', v)}
          />
          {settings.customReminder && (
            <View style={styles.inlineInputs}>
              <TextInput
                style={styles.reminderTextInput}
                value={settings.customReminderText}
                onChangeText={(text) => {
                  const updated = { ...settings, customReminderText: text };
                  setSettings(updated);
                  saveNotificationSettings({ customReminderText: text });
                }}
                placeholder="e.g. Take your supplements"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="done"
              />
              <Text style={styles.inlineLabel}>Time</Text>
              <SettingsTimePicker
                value={settings.customReminderTime}
                onChange={(t) => {
                  const updated = { ...settings, customReminderTime: t };
                  setSettings(updated);
                  saveNotificationSettings({ customReminderTime: t });
                }}
              />
            </View>
          )}
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.dangerRow} onPress={confirmReset}>
            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerLabel}>Reset all data</Text>
              <Text style={styles.dangerDescription}>
                Permanently delete all sessions, PRs, and your profile
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.danger} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

function ToggleRow({ label, description, value, onToggle }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.accent + '80' }}
        thumbColor={value ? COLORS.accent : COLORS.textMuted}
        ios_backgroundColor={COLORS.border}
      />
    </View>
  );
}

// ─── Picker styles ────────────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.xs,
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: TIME_ITEM_H * Math.floor(PICKER_VISIBLE / 2),
    height: TIME_ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
    zIndex: 1,
  },
  item: {
    height: TIME_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  itemTextSelected: {
    color: COLORS.accent,
    fontWeight: '800',
    fontSize: FONT_SIZE.xl,
  },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.text },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  toggleLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  toggleDescription: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.lg,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  dangerLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.danger,
  },
  dangerDescription: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  inlineInputs: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
  },
  reminderTextInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontSize: FONT_SIZE.sm,
  },
  inlineLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.xs,
  },
});
