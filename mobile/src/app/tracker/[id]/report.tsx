import { Stack, useLocalSearchParams } from 'expo-router';
import { Report } from '@/components/Report';
import { Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTracker } from '@/lib/queries';

export default function TrackerReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker } = useTracker(id);
  const currency = useAuth((s) => s.user?.currency ?? 'INR');
  if (!tracker) return <Loading />;
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: `${tracker.name} · Report` }} />
      <Report tracker={tracker} currency={currency} />
    </Screen>
  );
}
