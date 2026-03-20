import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { getProfile, getSessions } from '@/utils/storage';
import {
  checkAndNotifyMissedSession,
  checkGymTimeMissed,
  checkStreakProtection,
} from '@/utils/notifications';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      console.log('[GRIT] init start');
      try {
        const profile = await getProfile();
        console.log('[GRIT] profile:', profile ? `found, onboarding=${profile.onboardingComplete}` : 'null');

        if (!profile?.onboardingComplete) {
          router.replace('/onboarding');
        } else {
          // Run all notification checks in background — never block rendering
          getSessions()
            .then((sessions) => {
              checkAndNotifyMissedSession(sessions, profile.daysPerWeek).catch(() => {});

              if (profile.gymTime) {
                checkGymTimeMissed(
                  sessions,
                  profile.trainingDays,
                  profile.gymTime
                ).catch(() => {});
              }

              checkStreakProtection(
                sessions,
                profile.trainingDays,
                profile.daysPerWeek
              ).catch(() => {});
            })
            .catch(() => {});
        }
      } catch (e: any) {
        console.error('[GRIT] init() crashed:', e?.message ?? e);
        try { router.replace('/onboarding'); } catch {}
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    }

    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0a' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen
          name="session-summary"
          options={{
            headerShown: false,
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="workout/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#0a0a0a' },
            headerTintColor: '#ffffff',
            headerTitle: 'Session',
            headerBackTitle: 'Back',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
