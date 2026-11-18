import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, haptic, Icon, Input, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function VerifyEmail() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user, verifyEmail, resendVerification } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const leave = () => (next ? router.replace(next as Href) : router.back());

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyEmail(code);
      haptic.success();
      leave();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await resendVerification();
      setInfo('A new code is on its way.');
      setCooldown(60);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 24, paddingTop: 24 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="email-check-outline" size={36} color={colors.primary} />
        </View>
        <Txt variant="title" center>Check your inbox</Txt>
        <Txt variant="caption" center style={{ maxWidth: 300 }}>
          We sent a 6-digit code to <Txt variant="caption" color={colors.text} style={{ fontWeight: '700' }}>{user?.email}</Txt>. It helps you recover your account if you ever forget your password.
        </Txt>
      </View>
      <Input
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        placeholder="000000"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        style={{ fontSize: 30, fontWeight: '800', letterSpacing: 10, textAlign: 'center' }}
      />
      {error ? <Txt variant="caption" color={colors.red} center>{error}</Txt> : null}
      {info ? <Txt variant="caption" color={colors.green} center>{info}</Txt> : null}
      <Button title="Verify" onPress={submit} loading={loading} disabled={code.length !== 6} />
      <Button title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'} variant="secondary" disabled={cooldown > 0} onPress={resend} />
      <Button title="I’ll do this later" variant="ghost" onPress={leave} />
    </Screen>
  );
}
