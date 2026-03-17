// This file is a leftover from the Expo template and is hidden from the tab bar.
// It must exist so Expo Router doesn't throw a "missing route" error,
// but it should never be rendered (href: null in _layout.tsx).
import { Redirect } from 'expo-router';
export default function ExploreRedirect() {
  return <Redirect href="/(tabs)" />;
}
