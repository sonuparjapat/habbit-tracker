import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors, gradients } from '@/theme';
import { Button, Icon, Input, Row, Screen, Txt } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { login, register } = useAuth();
  const token = useAuth((s) => s.token);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Navigate only after the signed-in state has rendered, so protected screens are available.
  useEffect(() => {
    if (!done || !token) return;
    if (next) router.replace(next as Href);
    else if (mode === 'register') router.replace('/tracker/new');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [done, token, next, mode]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ flexGrow: 1, gap: 28, paddingBottom: 40 }}>
        <Row style={{ justifyContent: 'flex-end' }}>
          <Pressable
            onPress={close}
            hitSlop={12}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </Row>

        <View style={{ alignItems: 'center', gap: 14 }}>
          <LinearGradient
            colors={gradients.primary}
            style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="anchor" size={38} />
          </LinearGradient>
          <Txt variant="title" center>
            {mode === 'login' ? 'Welcome back' : 'Create your free account'}
          </Txt>
          <Txt variant="caption" center style={{ maxWidth: 300 }}>
            {next
              ? 'Sign in to save your trackers, trades and streaks — on any device.'
              : mode === 'login'
                ? 'Your rules are waiting. Stay anchored.'
                : 'Your trackers, trades and streaks are saved securely and synced across devices.'}
          </Txt>
        </View>

        <View style={{ gap: 14 }}>
          {mode === 'register' ? <Input label="Name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" /> : null}
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onSubmitEditing={submit}
          />
          {error ? <Txt color={colors.red} variant="caption">{error}</Txt> : null}
          <Button
            title={mode === 'login' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={loading}
            disabled={!email || !password || (mode === 'register' && !name)}
          />
        </View>

        <Pressable
          onPress={() => router.replace({ pathname: mode === 'login' ? '/register' : '/login', params: next ? { next } : {} })}
          style={{ alignSelf: 'center', padding: 8 }}>
          <Txt variant="caption">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <Txt variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </Txt>
          </Txt>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
