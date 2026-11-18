import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { money } from './format';
import { storage } from './storage';
import type { Tracker } from './types';

const CHANNEL = 'reminders';
const ENABLED_KEY = 'notifications_enabled';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function notificationsEnabled() {
  return (await storage.get(ENABLED_KEY)) !== 'false';
}

export async function setNotificationsEnabled(enabled: boolean, trackers: Tracker[], currency: string) {
  await storage.set(ENABLED_KEY, String(enabled));
  if (enabled) return scheduleReminders(trackers, currency, true);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  return true;
}

async function ensurePermission(ask: boolean) {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      // eslint-disable-next-line import/namespace -- exported at runtime via `export *` of a types module
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
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

/**
 * Re-creates every local reminder from the user's trackers.
 * Called on app start and whenever trackers change. Returns false if not permitted.
 */
export async function scheduleReminders(trackers: Tracker[], currency: string, ask = false) {
  try {
    if (!(await notificationsEnabled())) return false;
    if (!(await ensurePermission(ask))) return false;
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const t of trackers) {
      if (t.archived) continue;
      const route = { url: `/tracker/${t.id}` };
      if (t.type === 'trading') {
        const c = t.config;
        for (const d of c.tradingDays) {
          if (c.preMarketReminder)
            await weekly(
              d,
              c.preMarketReminder,
              '🛡️ Pre-market: read your rules',
              `${c.maxTradesPerDay} trade${c.maxTradesPerDay > 1 ? 's' : ''} max · target ${money(c.dailyProfitTarget, currency)} · max loss ${money(c.dailyMaxLoss, currency)}. Then walk away.`,
              route,
            );
          if (c.journalReminder)
            await weekly(d, c.journalReminder, '📓 Close your day', 'Log your trade and write 3 lines in your journal while it is fresh.', route);
        }
      } else if (t.config.reminderTime) {
        for (const d of t.config.days)
          await weekly(
            d,
            t.config.reminderTime,
            t.config.kind === 'quit' ? `🚫 Stay clean: ${t.name}` : `✅ Time for: ${t.name}`,
            t.config.why || 'Small wins, every day. Keep the streak alive.',
            route,
          );
      }
    }
    return true;
  } catch (e) {
    console.warn('Could not schedule reminders', e);
    return false;
  }
}

/** After the day locks, check in once more later to keep the user away from the terminal. */
export async function scheduleStayAwayNudge(pnl: number, currency: string) {
  try {
    if (!(await notificationsEnabled()) || !(await ensurePermission(false))) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔒 Your day is closed',
        body: `Protect today's ${money(pnl, currency, { sign: true })}. Close the charts — the market will be there tomorrow.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 30 * 60, channelId: CHANNEL },
    });
  } catch {}
}
