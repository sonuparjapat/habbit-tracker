import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, haptic, Icon, Input, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

/**
 * Unlock my account. Shown when sign-in says the account is locked for safety
 * (too many wrong passwords, or locked by our team). The owner proves it's them
 * with the 6-digit code we emailed, and is signed straight in.
 */
export default function Unlock() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { requestUnlock, unlock } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']} contentStyle={{ gap: 18, paddingTop: 20 }}>
        <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield-lock-outline" size={32} color={colors.amber} />
          </View>
          <Txt variant="h2" center>Your account is locked</Txt>
          <Txt variant="caption" center style={{ maxWidth: 320 }}>
            We locked it to keep it safe. We emailed a 6-digit code to the address on the account — enter it below to unlock and sign in.
          </Txt>
        </View>

        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
        <Input label="Code from the email" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" maxLength={6} autoComplete="one-time-code" />
        {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
        {notice ? <Txt variant="caption" color={colors.green}>{notice}</Txt> : null}

        <Button
          title="Unlock and sign in"
          icon="lock-open-variant-outline"
          loading={loading}
          disabled={!email.includes('@') || code.length !== 6}
          onPress={() =>
            run(async () => {
              await unlock(email.trim(), code);
              haptic.success();
              router.dismissAll();
              router.replace('/');
            })
          }
        />
        <Button
          title="Email me a new code"
          variant="secondary"
          disabled={!email.includes('@') || loading}
          onPress={() =>
            run(async () => {
              await requestUnlock(email.trim());
              setNotice('If this account is locked, a new code is on its way. Check your spam folder too.');
            })
          }
        />
        <Button title="Reset my password instead" variant="ghost" onPress={() => router.replace({ pathname: '/forgot-password', params: { email } })} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
