import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CrashScreen } from '@/components/CrashScreen';
import { ActivityBar } from '@/components/activityBar';
import { AppGates } from '@/components/gates';
import { useAuth } from '@/lib/auth';
import { useAppConfig } from '@/lib/config';
import { effectiveLanguage, setLanguage, t, type Language } from '@/lib/i18n';
import { scheduleReminders } from '@/lib/notifications';
import { usePrefs } from '@/lib/prefs';
import { handleNotificationResponse } from '@/lib/notificationActions';
import { refreshPushToken } from '@/lib/push';
import { invalidateAll, useTrackers } from '@/lib/queries';
import { API_URL } from '@/lib/api';
import { flushOutbox, loadOutbox, setOnDelivered } from '@/lib/outbox';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { applyTheme, colors, type ThemeMode } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// If any screen crashes: a friendly screen + an automatic report to Admin → Feedback
export const ErrorBoundary = CrashScreen;

// The home tabs are the base of the app: sign-in and other sheets always open on top of them.
export const unstable_settings = { anchor: '(tabs)' };

function navTheme(mode: ThemeMode) {
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return { ...base, colors: { ...base.colors, background: colors.bg, card: colors.bg, text: colors.text, primary: colors.primary, border: colors.border } };
}

/**
 * Light / dark mode. The member's choice (Profile → Appearance) wins; otherwise the admin's
 * default (Admin → App settings → Default app theme). Switching remounts the screens so every
 * colour is re-read.
 */
function ThemeGate({ children }: { children: (mode: ThemeMode, lang: Language) => ReactNode }) {
  const pref = usePrefs((s) => s.theme);
  const { settings: appSettings } = useAppConfig();
  // English unless the admin has switched Hindi on (Admin → App settings → Look & feel)
  const lang: Language = effectiveLanguage(appSettings.hindi_enabled, usePrefs((s) => s.language));
  setLanguage(lang);
  // Switching language: fetch everything again, so the server's messages come back in the new language
  const firstLang = useRef(lang);
  useEffect(() => {
    if (lang === firstLang.current) return;
    firstLang.current = lang;
    void queryClient.invalidateQueries();
  }, [lang]);
  const cachedDefault = usePrefs((s) => s.adminTheme);
  const update = usePrefs((s) => s.update);
  const { settings } = useAppConfig();
  const system = useColorScheme();
  const adminDefault = settings.default_theme;

  // Remember the admin default so the next launch starts in the right theme without a flash
  useEffect(() => {
    if (adminDefault && adminDefault !== cachedDefault) void update({ adminTheme: adminDefault });
  }, [adminDefault, cachedDefault, update]);

  const wanted = pref === 'default' ? (adminDefault ?? cachedDefault) : pref;
  const mode: ThemeMode = wanted === 'system' ? (system === 'light' ? 'light' : 'dark') : wanted;
  applyTheme(mode);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [mode]);

  return children(mode, lang);
}

/** Keeps local reminders in sync with the user's trackers (only if the user opted in). */
function ReminderSync() {
  const { data } = useTrackers();
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const consent = usePrefs((s) => s.remindersConsent);
  const userId = useAuth((s) => s.user?.id);
  const { settings } = useAppConfig();
  const weeklyReview = settings.weekly_review_enabled;
  useEffect(() => {
    if (data && consent) void scheduleReminders(data, currency, { weeklyReview });
  }, [data, currency, consent, weeklyReview]);

  // If this phone allows notifications, keep the server's copy of its push token fresh
  // (never asks for permission — that only happens when the member taps a switch)
  useEffect(() => {
    if (userId) void refreshPushToken();
  }, [userId, consent]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // A tap on a notification (or its ✓ Done button) — also the one that opened the app from closed
    const sub = Notifications.addNotificationResponseReceivedListener((res) => void handleNotificationResponse(res));
    Notifications.getLastNotificationResponseAsync()
      .then((res) => res && handleNotificationResponse(res))
      .catch(() => {});
    return () => sub.remove();
  }, []);
  return null;
}

/**
 * Offline-first plumbing:
 *  - the outbox of the signed-in member is loaded (and delivered) — changes made offline are never lost
 *  - when changes reach the server, every screen refreshes with the server's real numbers
 *  - the server is poked right away, so a sleeping server starts waking up while the app opens
 */
function OfflineSync() {
  const userId = useAuth((s) => s.user?.id ?? null);
  useEffect(() => {
    setOnDelivered(() => void invalidateAll());
    void loadOutbox(userId);
  }, [userId]);
  useEffect(() => {
    fetch(API_URL.replace(/\/api\/?$/, '') + '/health').catch(() => {});
    // Keep trying while something is waiting (the server may take a minute to wake up)
    const id = setInterval(() => void flushOutbox(), 20_000);
    return () => clearInterval(id);
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
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeGate>
          {(mode, lang) => (
            <ThemeProvider value={navTheme(mode)} key={`${mode}-${lang}`}>
              <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
              <ActivityBar />
              <OfflineSync />
              {token ? <ReminderSync /> : null}
              <AppGates>
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
                  <Stack.Screen name="forgot-password" options={{ title: t('Reset password'), ...modal }} />
                  <Stack.Screen name="unlock" options={{ title: t('Unlock account'), ...modal }} />
                  <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
                  <Stack.Screen name="feedback" options={{ title: t('Send feedback'), ...modal }} />
                  <Stack.Screen name="packs" options={{ title: t('Starter packs') }} />

                  {/* Your data: only when signed in. Guests reach these via goProtected() (sign-in sheet first);
                      if one is opened any other way (deep link, notification, signing out), go home — never to a login wall. */}
                  <Stack.Protected guard={!!token} redirectTo={showOnboarding ? '/onboarding' : '/'}>
                    <Stack.Screen name="verify-email" options={{ title: t('Verify email'), ...modal }} />
                    <Stack.Screen name="achievements" options={{ title: t('Level & badges') }} />
                    <Stack.Screen name="forest" options={{ title: t('Your forest') }} />
                    <Stack.Screen name="games" options={{ title: t('Arcade') }} />
                    <Stack.Screen name="review" options={{ title: t('Weekly review') }} />
                    <Stack.Screen name="focus" options={{ title: t('Focus timer') }} />
                    <Stack.Screen name="invite" options={{ title: t('Invite friends') }} />
                    <Stack.Screen name="account/password" options={{ title: t('Change password'), ...modal }} />
                    <Stack.Screen name="account/delete" options={{ title: t('Delete account'), ...modal }} />
                    <Stack.Screen name="tracker/new" options={{ title: t('New tracker'), ...modal }} />
                    <Stack.Screen name="tracker/[id]/index" options={{ title: '' }} />
                    <Stack.Screen name="tracker/[id]/edit" options={{ title: t('Edit tracker'), ...modal }} />
                    <Stack.Screen name="tracker/[id]/trade" options={{ title: t('Log trade'), ...modal }} />
                    <Stack.Screen name="tracker/[id]/quick" options={{ title: t('Quick day log'), ...modal }} />
                    <Stack.Screen name="tracker/[id]/expense" options={{ title: t('Add expense'), ...modal }} />
                    <Stack.Screen name="tracker/[id]/journal" options={{ title: t('Daily journal'), ...modal }} />
                    <Stack.Screen name="tracker/[id]/report" options={{ title: t('Report') }} />
                    <Stack.Screen name="tracker/[id]/breaks" options={{ title: t('Rule breaks') }} />
                  </Stack.Protected>
                </Stack>
              </AppGates>
            </ThemeProvider>
          )}
        </ThemeGate>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
