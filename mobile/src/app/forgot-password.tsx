import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, haptic, Icon, Input, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']} contentStyle={{ gap: 20, paddingTop: 20 }}>
        <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock-reset" size={32} color={colors.primary} />
          </View>
          <Txt variant="caption" center style={{ maxWidth: 300 }}>
            {step === 'email'
              ? 'Enter the email you signed up with. We’ll send you a 6-digit code.'
              : `If an account exists for ${email}, a code is on its way. Enter it with your new password.`}
          </Txt>
        </View>

        {step === 'email' ? (
          <>
            <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
            {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
            <Button title="Send code" loading={loading} disabled={!email.includes('@')} onPress={() => run(async () => { await requestPasswordReset(email.trim()); setStep('code'); })} />
          </>
        ) : (
          <>
            <Input label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" maxLength={6} autoComplete="one-time-code" />
            <Input label="New password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" autoComplete="new-password" />
            {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
            <Button
              title="Set new password"
              loading={loading}
              disabled={code.length !== 6 || password.length < 8}
              onPress={() =>
                run(async () => {
                  await resetPassword(email.trim(), code, password);
                  haptic.success();
                  router.dismissAll();
                  router.replace('/');
                })
              }
            />
            <Button title="Use a different email" variant="ghost" onPress={() => setStep('email')} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
