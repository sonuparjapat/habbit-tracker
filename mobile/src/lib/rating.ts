/**
 * "Enjoying Anchor? Rate us" — Google's own in-app review sheet.
 * Only at happy moments (a level-up, a new badge, a boss beaten), never in the first 5 days,
 * and at most once every 2 months. Google may still decide not to show it; that's fine.
 */
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';
import type { AppSettings } from './config';
import { usePrefs } from './prefs';

const DAY = 24 * 60 * 60 * 1000;

export async function maybeAskForRating(settings: AppSettings) {
  try {
    if (Platform.OS === 'web' || !settings.rating_prompt_enabled) return;
    const prefs = usePrefs.getState();
    const now = Date.now();
    if (!prefs.firstOpenAt || now - prefs.firstOpenAt < 5 * DAY) return;
    if (prefs.lastRatingAskAt && now - prefs.lastRatingAskAt < 60 * DAY) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await prefs.update({ lastRatingAskAt: now });
    await StoreReview.requestReview();
  } catch {
    // never let a rating prompt break anything
  }
}
