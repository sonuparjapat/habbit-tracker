/**
 * Server push: notifications that show in the phone's notification bar even when the app is closed.
 * The phone gets an "Expo push token" and we save it on the server, which uses it for:
 *   - the evening check-in (only if the member opted in and missed a tracker)
 *   - news & tips sent from Admin → Notifications (only if "News & tips" is on)
 * We only ever get a token after the member allowed notifications — we never ask on our own.
 *
 * Android needs Firebase set up once for this (see PLAY_STORE.md → "Push notifications").
 * Until then getting a token fails, and we simply fall back to email — nothing breaks.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { put } from './api';
import { ensureChannel, requestReminderPermission } from './notifications';

const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
let lastSaved: string | null = null;

/** This phone's push token, or null if push isn't possible (no permission, web, no Firebase yet). */
async function getToken(askPermission: boolean): Promise<string | null> {
  if (Platform.OS === 'web' || !projectId) return null;
  try {
    const granted = askPermission ? await requestReminderPermission() : (await Notifications.getPermissionsAsync()).granted;
    if (!granted) return null;
    await ensureChannel();
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/**
 * Turn on push for the evening check-in: asks for permission (only call from a tap),
 * saves the token on the server.
 *   'ok'          → done
 *   'denied'      → the member blocked notifications for the app
 *   'unavailable' → this build can't receive server push yet (e.g. Firebase not set up)
 */
export async function enablePush(): Promise<'ok' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !projectId) return 'unavailable';
  if (!(await requestReminderPermission())) return 'denied';
  const token = await getToken(false);
  if (!token) return 'unavailable';
  await put('/auth/me/push-token', { token });
  lastSaved = token;
  return 'ok';
}

/** Tokens can change (reinstall, restore): re-send it quietly on app start. Never asks for permission. */
export async function refreshPushToken() {
  const token = await getToken(false);
  if (!token || token === lastSaved) return;
  try {
    await put('/auth/me/push-token', { token });
    lastSaved = token;
  } catch {
    // try again next launch
  }
}

/** On sign-out: this phone should stop receiving this member's nudges. */
export async function forgetPushToken() {
  lastSaved = null;
  try {
    await put('/auth/me/push-token', { token: null });
  } catch {
    // session already gone — the server drops dead tokens by itself
  }
}
