import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, haptic, Input, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function ChangePassword() {
  const changePassword = useAuth((s) => s.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await changePassword(current, next);
      haptic.success();
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16, paddingTop: 16 }}>
      <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="At least 8 characters" />
      <View style={{ backgroundColor: colors.surface, padding: 14, borderRadius: 14 }}>
        <Txt variant="caption">For your security, you’ll be signed out on all other devices.</Txt>
      </View>
      {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
      <Button title="Change password" loading={loading} disabled={!current || next.length < 8} onPress={submit} />
    </Screen>
  );
}
