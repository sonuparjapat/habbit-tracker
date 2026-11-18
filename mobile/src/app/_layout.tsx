import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DarkTheme, router, Stack, ThemeProvider, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { scheduleReminders } from '@/lib/notifications';
import { usePrefs } from '@/lib/prefs';
import { useTrackers } from '@/lib/queries';
import { queryClient } from '@/lib/queryClient';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// The home tabs are the base of the app: sign-in and other sheets always open on top of them.
export const unstable_settings = { anchor: '(tabs)' };

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, border: colors.border },
};

/** Keeps local reminders in sync with the user's trackers (only if the user opted in). */
function ReminderSync() {
  const { data } = useTrackers();
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const consent = usePrefs((s) => s.remindersConsent);
  useEffect(() => {
    if (data && consent) void scheduleReminders(data, currency);
  }, [data, currency, consent]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = res.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as Href);
    });
    return () => sub.remove();
  }, []);
  return null;
}

const modal = { presentation: 'modal' as const };

export default function RootLayout() {
  const { ready, token, hydrate } = useAuth();
  const prefs = usePrefs();

  useEffect(() => {
    void hydrate();
    void prefs.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loaded = ready && prefs.loaded;
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  // First launch on this device (and not signed in): welcome, interests, permissions
  const showOnboarding = !prefs.onboarded && !token;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          {token ? <ReminderSync /> : null}
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}>
            {/*
              Every Protected group names its redirect target explicitly. Without redirectTo,
              Expo Router falls back to the first unguarded route in *alphabetical file order*
              (which is the login screen) — exactly the "app opens on login" bug.
            */}
            <Stack.Protected guard={showOnboarding} redirectTo="/">
              <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
            </Stack.Protected>

            <Stack.Protected guard={!showOnboarding} redirectTo="/onboarding">
              {/* Open to everyone: guests can browse the app */}
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack.Protected>

            {/* Always reachable */}
            <Stack.Screen name="login" options={{ headerShown: false, ...modal }} />
            <Stack.Screen name="register" options={{ headerShown: false, ...modal }} />
            <Stack.Screen name="forgot-password" options={{ title: 'Reset password', ...modal }} />
            <Stack.Screen name="legal/[doc]" options={{ title: '' }} />

            {/* Your data: only when signed in. Guests reach these via goProtected() (sign-in sheet first);
                if one is opened any other way (deep link, notification, signing out), go home — never to a login wall. */}
            <Stack.Protected guard={!!token} redirectTo={showOnboarding ? '/onboarding' : '/'}>
              <Stack.Screen name="verify-email" options={{ title: 'Verify email', ...modal }} />
              <Stack.Screen name="account/password" options={{ title: 'Change password', ...modal }} />
              <Stack.Screen name="account/delete" options={{ title: 'Delete account', ...modal }} />
              <Stack.Screen name="tracker/new" options={{ title: 'New tracker', ...modal }} />
              <Stack.Screen name="tracker/[id]/index" options={{ title: '' }} />
              <Stack.Screen name="tracker/[id]/edit" options={{ title: 'Edit tracker', ...modal }} />
              <Stack.Screen name="tracker/[id]/trade" options={{ title: 'Log trade', ...modal }} />
              <Stack.Screen name="tracker/[id]/expense" options={{ title: 'Add expense', ...modal }} />
              <Stack.Screen name="tracker/[id]/journal" options={{ title: 'Daily journal', ...modal }} />
              <Stack.Screen name="tracker/[id]/report" options={{ title: 'Report' }} />
              <Stack.Screen name="tracker/[id]/breaks" options={{ title: 'Rule breaks' }} />
            </Stack.Protected>
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
