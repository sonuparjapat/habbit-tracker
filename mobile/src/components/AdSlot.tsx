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
 * Product rule: never show ads on the trade-logging / lock screens — those are
 * moments where the user must stay focused on their discipline.
 */
export const ADS_ENABLED = process.env.EXPO_PUBLIC_ADS_ENABLED === 'true';

export function AdSlot(_props: { placement: 'profile' | 'insights' | 'trackers' }) {
  if (!ADS_ENABLED) return null;
  return null;
}
