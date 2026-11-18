import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AlertCard, Button, Input, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function DeleteAccount() {
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await deleteAccount(password);
      router.dismissAll();
      router.replace('/');
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16, paddingTop: 16 }}>
      <AlertCard
        alert={{
          level: 'danger',
          title: 'This cannot be undone',
          message: 'Your account, trackers, check-ins, trades, expenses, journal and rule-break history will be permanently deleted.',
        }}
      />
      <View style={{ backgroundColor: colors.surface, padding: 14, borderRadius: 14 }}>
        <Txt variant="caption">Tip: export your data from Profile first if you want a copy.</Txt>
      </View>
      <Input label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
      <Button title="Permanently delete my account" variant="danger" loading={loading} disabled={!password} onPress={submit} />
      <Button title="Keep my account" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
