import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { scheduleReminders } from '@/lib/notifications';
import { useTrackers } from '@/lib/queries';
import { queryClient } from '@/lib/queryClient';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, border: colors.border },
};

/** Keeps local reminders in sync with the user's trackers. */
function ReminderSync() {
  const { data } = useTrackers();
  const currency = useAuth((s) => s.user?.currency ?? 'INR');
  useEffect(() => {
    if (data) void scheduleReminders(data, currency);
  }, [data, currency]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = res.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as any);
    });
    return () => sub.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  const { ready, token, hydrate } = useAuth();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

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
            {/* Open to everyone: guests can browse the app and see what it does */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="register" options={{ headerShown: false, presentation: 'modal' }} />

            {/* Your data: only reachable when signed in (guests are sent to sign-in first) */}
            <Stack.Protected guard={!!token}>
              <Stack.Screen name="tracker/new" options={{ title: 'New tracker', presentation: 'modal' }} />
              <Stack.Screen name="tracker/[id]/index" options={{ title: '' }} />
              <Stack.Screen name="tracker/[id]/edit" options={{ title: 'Edit tracker', presentation: 'modal' }} />
              <Stack.Screen name="tracker/[id]/trade" options={{ title: 'Log trade', presentation: 'modal' }} />
              <Stack.Screen name="tracker/[id]/journal" options={{ title: 'Daily journal', presentation: 'modal' }} />
              <Stack.Screen name="tracker/[id]/report" options={{ title: 'Report' }} />
              <Stack.Screen name="tracker/[id]/breaks" options={{ title: 'Rule breaks' }} />
            </Stack.Protected>
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
