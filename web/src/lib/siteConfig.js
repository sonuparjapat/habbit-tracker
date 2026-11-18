import { cacheLife } from 'next/cache';
import { API_URL, APP_NAME, PLAY_STORE_URL, SUPPORT_EMAIL } from './config';

/**
 * Public settings from Admin → App settings, used by the public pages (privacy, terms, footer).
 * Cached for a few minutes; falls back to the .env values if the API is unreachable.
 */
export async function getSiteConfig() {
  'use cache';
  cacheLife('minutes');
  const fallback = { appName: APP_NAME, supportEmail: SUPPORT_EMAIL, playStoreUrl: PLAY_STORE_URL };
  try {
    const res = await fetch(`${API_URL}/config`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return fallback;
    const { appName, settings } = await res.json();
    return {
      appName: appName || fallback.appName,
      supportEmail: settings.support_email || fallback.supportEmail,
      playStoreUrl: settings.play_store_url || fallback.playStoreUrl,
    };
  } catch {
    return fallback;
  }
}
