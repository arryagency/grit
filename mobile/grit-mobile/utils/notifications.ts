import { Platform } from 'react-native';
import { WorkoutSession, getDaysSinceLastWorkout, getStreak } from './storage';

// Lazy import — expo-notifications is native-only
function getNotifications() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-notifications') as typeof import('expo-notifications');
}

let handlerSet = false;

function ensureHandler() {
  if (handlerSet || Platform.OS === 'web') return;
  try {
    const Notifications = getNotifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerSet = true;
  } catch (e: any) {
    console.log('[GRIT notifications] setNotificationHandler failed (non-fatal):', e?.message);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    ensureHandler();
    const Notifications = getNotifications();

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('grit', {
        name: 'GRIT',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e: any) {
    console.log('[GRIT notifications] requestPermissions failed (non-fatal):', e?.message);
    return false;
  }
}

// ─── Message banks ────────────────────────────────────────────────────────────

const MISSED_MESSAGES = [
  'You missed your session. Your future self is disappointed.',
  'Everyone who trained today is ahead of you right now.',
  'You had one job.',
  'Your gains are expiring.',
  "The bar isn't going to lift itself. Obviously.",
  'Session overdue. You know what to do.',
  "You said you'd train. Still waiting.",
  "Rest is earned. This isn't rest.",
];

const TRAINING_DAY_MESSAGES = [
  "Training day. Don't waste it.",
  'Session on the schedule. Get after it.',
  "Today's a training day. No excuses.",
  'Time to work.',
  'The weights are waiting. You going or not?',
  'Get in, get it done.',
];

const STREAK_PROTECTION_MESSAGES = [
  "Your streak dies at midnight. You've got time.",
  "3 hours to save your streak. Even 20 minutes counts.",
  "Streak's on the line tonight. Do something.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Schedule training-day reminders ─────────────────────────────────────────

/**
 * Schedule weekly notifications at 08:00 on each training day.
 * If gymTime is provided, also schedules a "15 mins before" reminder.
 * trainingDays: 0=Sun … 6=Sat
 */
export async function scheduleWorkoutNotifications(
  trainingDays: number[],
  gymTime?: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = getNotifications();
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const day of trainingDays) {
      const expoWeekday = (day + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

      // 08:00 training day reminder
      await Notifications.scheduleNotificationAsync({
        content: { title: 'GRIT', body: pick(TRAINING_DAY_MESSAGES) },
        trigger: {
          type: 'weekly' as const,
          weekday: expoWeekday,
          hour: 8,
          minute: 0,
        } as any,
      });

      // 15-min "you train soon" reminder if gym time set
      if (gymTime) {
        const [h, m] = gymTime.split(':').map(Number);
        let reminderH = h;
        let reminderM = m - 15;
        if (reminderM < 0) { reminderM += 60; reminderH -= 1; }
        if (reminderH >= 0) {
          await Notifications.scheduleNotificationAsync({
            content: { title: 'GRIT', body: 'You train in 15 minutes. No excuse.' },
            trigger: {
              type: 'weekly' as const,
              weekday: expoWeekday,
              hour: reminderH,
              minute: reminderM,
            } as any,
          });
        }
      }
    }

    console.log('[GRIT notifications] scheduled', trainingDays.length, 'training days');
  } catch (e: any) {
    console.log('[GRIT notifications] scheduleWorkoutNotifications failed (non-fatal):', e?.message);
  }
}

// ─── Missed session check ─────────────────────────────────────────────────────

/**
 * Fire an immediate notification if the user has been away too long.
 * Only fires when there is at least 1 logged session.
 */
export async function checkAndNotifyMissedSession(
  sessions: WorkoutSession[],
  daysPerWeek: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  // Guard: never fire if no sessions logged yet
  if (sessions.length === 0) return;

  try {
    const daysSince = getDaysSinceLastWorkout(sessions);
    const expectedGap = Math.ceil(7 / daysPerWeek);
    if (daysSince <= expectedGap + 2) return;

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = getNotifications();
    const body =
      daysSince >= 14
        ? `${daysSince} days. That's not a break, that's quitting. Start again today.`
        : daysSince >= 7
        ? `${daysSince} days since you last trained. What's actually going on?`
        : pick(MISSED_MESSAGES);

    await Notifications.scheduleNotificationAsync({
      content: { title: 'GRIT', body },
      trigger: null,
    });
  } catch (e: any) {
    console.log('[GRIT notifications] checkAndNotifyMissedSession failed (non-fatal):', e?.message);
  }
}

// ─── Gym time "what happened" check ──────────────────────────────────────────

/**
 * If today is a training day, gym time has passed by 2+ hours, and no session
 * logged today — fire an immediate "you said X, what happened" notification.
 */
export async function checkGymTimeMissed(
  sessions: WorkoutSession[],
  trainingDays: number[],
  gymTime: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const now = new Date();
    const todayDow = now.getDay(); // 0=Sun

    if (!trainingDays.includes(todayDow)) return;

    const [h, m] = gymTime.split(':').map(Number);
    const scheduledMs = h * 3600000 + m * 60000;
    const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000;

    // Only fire if 2+ hours after scheduled time
    if (nowMs - scheduledMs < 2 * 3600000) return;

    // Check if already trained today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const trainedToday = sessions.some((s) => {
      const d = new Date(s.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });
    if (trainedToday) return;

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const displayTime = new Date(0, 0, 0, h, m).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    const Notifications = getNotifications();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GRIT',
        body: `You said ${displayTime}. What happened.`,
      },
      trigger: null,
    });
  } catch (e: any) {
    console.log('[GRIT notifications] checkGymTimeMissed failed (non-fatal):', e?.message);
  }
}

// ─── Water intake check ───────────────────────────────────────────────────────

/**
 * Fire an afternoon notification if today's water intake is below 60% of goal.
 * Only fires between 14:00 and 18:00.
 */
export async function checkAndNotifyLowWater(
  todayWaterMl: number,
  goalMl: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const hour = new Date().getHours();
    if (hour < 14 || hour >= 18) return;
    if (todayWaterMl >= goalMl * 0.6) return;

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = getNotifications();
    const litres = (todayWaterMl / 1000).toFixed(1);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GRIT',
        body: `You've had ${litres}L today. Drink more — performance suffers when you're dehydrated.`,
      },
      trigger: null,
    });
  } catch (e: any) {
    console.log('[GRIT notifications] checkAndNotifyLowWater failed (non-fatal):', e?.message);
  }
}

// ─── Physique photo reminder ──────────────────────────────────────────────────

/**
 * Schedule a weekly Sunday reminder at 10:00 to take a physique photo.
 */
export async function schedulePhysiqueReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = getNotifications();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GRIT',
        body: "Sunday check-in. Take your weekly physique photo to track your transformation.",
      },
      trigger: {
        type: 'weekly' as const,
        weekday: 1, // Sunday = 1 in expo-notifications (1=Sun, 2=Mon, ..., 7=Sat)
        hour: 10,
        minute: 0,
      } as any,
    });
    console.log('[GRIT notifications] physique reminder scheduled');
  } catch (e: any) {
    console.log('[GRIT notifications] schedulePhysiqueReminder failed (non-fatal):', e?.message);
  }
}

// ─── Streak protection ────────────────────────────────────────────────────────

/**
 * If today is a training day, streak > 0, and no session logged today,
 * fire a streak protection notification at 21:00 (or immediately if already past 21:00).
 */
export async function checkStreakProtection(
  sessions: WorkoutSession[],
  trainingDays: number[],
  daysPerWeek: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (sessions.length === 0) return;

  try {
    const now = new Date();
    const todayDow = now.getDay();
    if (!trainingDays.includes(todayDow)) return;

    const streak = getStreak(sessions, daysPerWeek);
    if (streak === 0) return;

    // Only fire after 18:00
    if (now.getHours() < 18) return;

    // Check if already trained today
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const trainedToday = sessions.some((s) => {
      const d = new Date(s.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === todayMidnight.getTime();
    });
    if (trainedToday) return;

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = getNotifications();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GRIT',
        body: pick(STREAK_PROTECTION_MESSAGES).replace(
          "You've got time",
          `${streak} session streak on the line. You've got time`
        ),
      },
      trigger: null,
    });
  } catch (e: any) {
    console.log('[GRIT notifications] checkStreakProtection failed (non-fatal):', e?.message);
  }
}
