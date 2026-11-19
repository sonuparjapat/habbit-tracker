import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { post } from '@/lib/api';
import { APP_VERSION } from '@/lib/config';
import { colors } from '@/theme';
import { Button, Gradient, Icon, Txt } from './ui';

const reported = new Set<string>();

/** Send one crash report per distinct error to Admin → Feedback (kind "App crash"). Never throws. */
function reportCrash(error: Error) {
  const key = `${error.name}:${error.message}`;
  if (reported.has(key)) return;
  reported.add(key);
  const stack = (error.stack ?? '').split('\n').slice(0, 8).join('\n');
  void post('/feedback', {
    kind: 'crash',
    message: `${error.name}: ${error.message}\n\n${stack}`.slice(0, 4000),
    appVersion: APP_VERSION,
    platform: Platform.OS,
  }).catch(() => {});
}

/**
 * Shown instead of a blank screen if something crashes. The crash is reported automatically
 * (no personal data — just the error), and "Try again" re-opens the screen.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportCrash(error), [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
      <Gradient colors={['#F59E0B', '#F43F5E']} style={{ width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lifebuoy" size={42} />
      </Gradient>
      <Txt variant="title" center>Something went wrong</Txt>
      <Txt variant="caption" center style={{ maxWidth: 320 }}>
        Sorry about that. We’ve been told automatically, and your data is safe. Try again — it usually works.
      </Txt>
      <Button title="Try again" icon="refresh" onPress={() => void retry()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
    </View>
  );
}
