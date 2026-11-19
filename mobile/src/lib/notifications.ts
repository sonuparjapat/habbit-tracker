/**
 * Local reminders. Privacy rule: we never ask the OS for notification permission,
 * and never schedule anything, until the user has explicitly opted in
 * (onboarding "Allow reminders" or the toggle in Profile).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { money } from './format';
import { usePrefs } from './prefs';
import type { Tracker } from './types';

const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const consented = () => usePrefs.getState().remindersConsent;

/**
 * Android notification channels — members can mute each one separately in the phone's settings:
 *   reminders  tracker reminders + the evening check-in
 *   updates    news & tips sent by the team (Admin → Notifications)
 */
export async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Reminders',
    // eslint-disable-next-line import/namespace -- exported at runtime via `export *` of a types module
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync('updates', {
    name: 'News & tips',
    // eslint-disable-next-line import/namespace -- exported at runtime via `export *` of a types module
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Ask the OS for permission. Only call this from an explicit user action. */
export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function hasPermission() {
  if (Platform.OS === 'web') return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** User turned reminders on or off. Returns the resulting state. */
export async function setRemindersEnabled(enabled: boolean, trackers: Tracker[], currency: string): Promise<boolean> {
  if (!enabled) {
    await usePrefs.getState().update({ remindersConsent: false });
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    return false;
  }
  const granted = await requestReminderPermission();
  await usePrefs.getState().update({ remindersConsent: granted });
  if (granted) await scheduleReminders(trackers, currency);
  return granted;
}

const parseTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return { hour: h ?? 9, minute: m ?? 0 };
};

async function weekly(weekday0: number, time: string, title: string, body: string, data: Record<string, unknown>) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: weekday0 + 1, // expo: 1 = Sunday
      ...parseTime(time),
      channelId: CHANNEL,
    },
  });
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Re-create all reminders from the user's trackers (only if consented and permitted). */
export async function scheduleReminders(trackers: Tracker[], currency: string) {
  try {
    if (!consented() || !(await hasPermission())) return false;
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const t of trackers) {
      if (t.archived) continue;
      const data = { url: `/tracker/${t.id}` };
      if (t.type === 'trading') {
        const c = t.config;
        for (const d of c.tradingDays) {
          if (c.preMarketReminder)
            await weekly(
              d,
              c.preMarketReminder,
              `🛡️ ${t.name}: read your rules`,
              [
                `Max ${c.maxTradesPerDay} trade${c.maxTradesPerDay > 1 ? 's' : ''}`,
                c.dailyProfitTarget ? `target ${money(c.dailyProfitTarget, currency)}` : null,
                c.dailyMaxLoss ? `max loss ${money(c.dailyMaxLoss, currency)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') + '. Then walk away.',
              data,
            );
          if (c.journalReminder) await weekly(d, c.journalReminder, `📓 ${t.name}: close your day`, 'Log your trades and write three lines in your journal.', data);
        }
      } else if (t.type === 'spending') {
        if (t.config.reminderTime)
          for (const d of EVERY_DAY)
            await weekly(d, t.config.reminderTime, `💰 ${t.name}`, 'Log today’s spending — every rupee, dollar or euro counts.', data);
      } else if (t.config.reminderTime) {
        const kind = t.config.kind;
        for (const d of t.config.days)
          await weekly(
            d,
            t.config.reminderTime,
            kind === 'quit' ? `🚫 Stay clean: ${t.name}` : kind === 'limit' ? `📉 ${t.name}: stay under your limit` : `✅ Time for: ${t.name}`,
            t.config.why || 'Small wins, every day. Keep the streak alive.',
            data,
          );
      }
    }
    return true;
  } catch (e) {
    console.warn('Could not schedule reminders', e);
    return false;
  }
}

/** After a trading day locks, check in once more later to keep the user away. */
export async function scheduleStayAwayNudge(pnl: number, currency: string) {
  try {
    if (!consented() || !(await hasPermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔒 Your day is closed',
        body: `Protect today’s ${money(pnl, currency, { sign: true })}. Close the charts — the market will be there tomorrow.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 30 * 60, channelId: CHANNEL },
    });
  } catch {}
}
