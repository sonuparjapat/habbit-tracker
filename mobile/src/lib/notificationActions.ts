/**
 * What happens when a notification is tapped.
 *   - Its ✓ Done button: check the habit in for today, then show Today.
 *   - Anywhere else on it: open the screen it points to (data.url).
 * The same response can arrive twice (live listener + "the one that opened the app"), so each is handled once.
 */
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { haptic } from '@/components/ui';
import { localToday } from './format';
import { DONE_ACTION } from './notifications';
import { enqueue } from './outbox';
import { showEntryChange } from './queries';

const handled = new Set<string>();

export async function handleNotificationResponse(res: Notifications.NotificationResponse) {
  const key = `${res.notification.request.identifier}:${res.notification.date}:${res.actionIdentifier}`;
  if (handled.has(key)) return;
  handled.add(key);

  const data = res.notification.request.content.data ?? {};
  if (res.actionIdentifier === DONE_ACTION && typeof data.trackerId === 'string') {
    try {
      const day = localToday();
      showEntryChange(data.trackerId, day, { kind: 'save', completed: true });
      await enqueue('PUT', `/trackers/${data.trackerId}/entries/${day}`, { completed: true });
      haptic.success();
    } catch {
      // Signed out or offline: just open the tracker so they can check in by hand
      router.push(`/tracker/${data.trackerId}` as Href);
      return;
    } finally {
      Notifications.dismissNotificationAsync(res.notification.request.identifier).catch(() => {});
    }
    router.navigate('/');
    return;
  }
  if (typeof data.url === 'string') router.push(data.url as Href);
}
