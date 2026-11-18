import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { usePrefs } from '@/lib/prefs';
import { colors, gradients } from '@/theme';
import { Button, Checkbox, Icon, IconButton, Input, Row, Screen, Txt } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { login, register } = useAuth();
  const token = useAuth((s) => s.token);
  const interests = usePrefs((s) => s.interests);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Navigate only after the signed-in state has rendered, so protected screens exist.
  useEffect(() => {
    if (!done || !token) return;
    if (mode === 'register') router.replace({ pathname: '/verify-email', params: { next: next ?? '/tracker/new' } });
    else if (next) router.replace(next as Href);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [done, token, next, mode]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register({ name: name.trim(), email: email.trim(), password, acceptTerms, marketingOptIn: marketing, interests });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!email && !!password && (mode === 'login' || (!!name.trim() && acceptTerms && password.length >= 8));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ flexGrow: 1, gap: 28, paddingBottom: 48 }}>
        <Row style={{ justifyContent: 'flex-end' }}>
          <IconButton icon="close" label="Close" onPress={close} />
        </Row>

        <View style={{ alignItems: 'center', gap: 14 }}>
          <LinearGradient colors={gradients.primary} style={{ width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="anchor" size={36} />
          </LinearGradient>
          <Txt variant="title" center>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Txt>
          <Txt variant="caption" center style={{ maxWidth: 300 }}>
            {mode === 'login' ? 'Your rules are waiting. Stay anchored.' : 'Free forever. Your trackers and streaks are saved securely and synced.'}
          </Txt>
        </View>

        <View style={{ gap: 16 }}>
          {mode === 'register' ? <Input label="Name" value={name} onChangeText={setName} placeholder="What should we call you?" autoComplete="name" /> : null}
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <View>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              secureTextEntry={!showPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onSubmitEditing={canSubmit ? submit : undefined}
              style={{ paddingRight: 52 }}
            />
            <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10} style={{ position: 'absolute', right: 16, top: 41 }}>
              <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {mode === 'login' ? (
            <Pressable onPress={() => router.push({ pathname: '/forgot-password', params: email ? { email } : {} })} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
              <Txt variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>Forgot password?</Txt>
            </Pressable>
          ) : (
            <View style={{ gap: 14, marginTop: 4 }}>
              <Checkbox checked={acceptTerms} onChange={setAcceptTerms}>
                <Txt variant="caption" color={colors.text}>
                  I agree to the Terms of Use and Privacy Policy, and confirm I’m at least 13 years old
                </Txt>
              </Checkbox>
              <Row gap={16} style={{ marginLeft: 36 }}>
                <Pressable onPress={() => router.push('/legal/terms' as Href)} hitSlop={6}><Txt variant="caption" color={colors.textMuted} style={{ textDecorationLine: 'underline' }}>Read Terms</Txt></Pressable>
                <Pressable onPress={() => router.push('/legal/privacy' as Href)} hitSlop={6}><Txt variant="caption" color={colors.textMuted} style={{ textDecorationLine: 'underline' }}>Read Privacy Policy</Txt></Pressable>
              </Row>
              <Checkbox checked={marketing} onChange={setMarketing}>
                <Txt variant="caption">Send me occasional tips and product updates (optional)</Txt>
              </Checkbox>
            </View>
          )}

          {error ? (
            <Row gap={8} style={{ backgroundColor: colors.redSoft, padding: 12, borderRadius: 12 }}>
              <Icon name="alert-circle-outline" size={18} color={colors.red} />
              <Txt variant="caption" color={colors.red} style={{ flex: 1 }}>{error}</Txt>
            </Row>
          ) : null}
          <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={loading} disabled={!canSubmit} style={{ marginTop: 4 }} />
        </View>

        <Pressable
          onPress={() => router.replace({ pathname: mode === 'login' ? '/register' : '/login', params: next ? { next } : {} })}
          style={{ alignSelf: 'center', padding: 8, marginTop: 'auto' }}>
          <Txt variant="caption">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <Txt variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Txt>
          </Txt>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
