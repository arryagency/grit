import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotificationSettings,
  saveNotificationSettings,
  NotificationSettings,
} from '@/utils/storage';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

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
      'Wipes every session, PR, programme, and your profile. Cannot be undone.',
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
});
