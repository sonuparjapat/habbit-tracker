import { useAppConfig } from '@/lib/config';

/**
 * Ad placement point.
 *
 * Google AdSense is for websites. For a Play Store app you use Google AdMob
 * (same Google account). To turn ads on:
 *   1. npx expo install react-native-google-mobile-ads
 *   2. Add its config plugin with your AdMob app ID in app.json
 *   3. Build a development build (ads do not work in Expo Go)
 *   4. Render <BannerAd unitId=... size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} /> here
 *
 * Ads show only when the build has AdMob (EXPO_PUBLIC_ADS_ENABLED=true) AND the admin
 * has switched them on (Admin → App settings → Show ads), so they can be paused instantly.
 * Product rule: never show ads on the trade-logging / lock / expense screens.
 */
const BUILD_HAS_ADS = process.env.EXPO_PUBLIC_ADS_ENABLED === 'true';

export function AdSlot(_props: { placement: 'profile' | 'insights' | 'trackers' }) {
  const { settings } = useAppConfig();
  if (!BUILD_HAS_ADS || !settings.ads_enabled) return null;
  return null; // <BannerAd ... /> goes here once AdMob is installed
}
