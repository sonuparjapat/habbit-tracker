import { router, type Href } from 'expo-router';
import { Linking } from 'react-native';
import { CONFIG_KEY, DEFAULT_CONFIG, type AppConfig } from './config';
import { queryClient } from './queryClient';

/** Support address from Admin → App settings (falls back to EXPO_PUBLIC_SUPPORT_EMAIL). */
export function supportEmail() {
  const cfg = queryClient.getQueryData<AppConfig>(CONFIG_KEY);
  return cfg?.settings?.support_email || DEFAULT_CONFIG.settings.support_email;
}

/** Opens the user's email app — or the in-app feedback form when no support email is set. */
export async function contactSupport(subject = 'Help with Anchor') {
  const email = supportEmail();
  if (!email) {
    router.push('/feedback' as Href);
    return;
  }
  try {
    await Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}`);
  } catch {
    // No email app installed: use the in-app form instead
    router.push('/feedback' as Href);
  }
}
