/**
 * Phone notifications (they show in the phone's notification bar, even when the app is closed)
 * through Expo's push service. The app sends us its "Expo push token"; we post messages to Expo,
 * and Expo delivers them through Firebase (Android) / APNs (iOS).
 *
 * Two kinds of message use this:
 *   - evening check-in nudges (services/nudges.js)      → Android channel "reminders"
 *   - notifications admins send (services/broadcast.js)  → Android channel "updates"
 *
 * `push.send` is an object property (not a plain export) so tests can swap it for a fake.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts up to 100 messages per request

export const isExpoPushToken = (token) => typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);

export const push = {
  /**
   * messages: [{ to, title, body, data?, channelId? }]
   * Returns one result per message, in order: { ok: true } or { ok: false, unregistered, error }.
   */
  async send(messages) {
    const results = [];
    for (let i = 0; i < messages.length; i += BATCH) results.push(...(await sendBatch(messages.slice(i, i + BATCH))));
    return results;
  },
};

async function sendBatch(messages) {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages.map((m) => ({ sound: 'default', channelId: 'reminders', priority: 'high', ...m }))),
    });
    const json = await res.json().catch(() => ({}));
    const tickets = Array.isArray(json.data) ? json.data : [];
    return messages.map((_, i) => {
      const ticket = tickets[i];
      if (ticket?.status === 'ok') return { ok: true };
      // "DeviceNotRegistered" = the app was uninstalled or the token expired: stop using it
      return { ok: false, unregistered: ticket?.details?.error === 'DeviceNotRegistered', error: ticket?.message ?? `HTTP ${res.status}` };
    });
  } catch (err) {
    return messages.map(() => ({ ok: false, unregistered: false, error: err.message }));
  }
}
