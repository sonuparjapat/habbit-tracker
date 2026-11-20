import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { GuestPrompt, SampleReport } from '@/components/guest';
import { Report } from '@/components/Report';
import { Chip, EmptyState, Loading, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTrackers } from '@/lib/queries';

export default function Insights() {
  const { data, isLoading } = useTrackers();
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const [selected, setSelected] = useState<string | null>(null);
  const signedIn = useAuth((s) => !!s.token);

  if (!signedIn)
    return (
      <Screen>
        <Txt variant="title">Insights</Txt>
        <Txt variant="caption" style={{ marginBottom: 16 }}>Here is a sample. Yours is built from your own habits and progress.</Txt>
        <SampleReport />
        <View style={{ marginTop: 20 }}>
          <GuestPrompt icon="chart-box-outline" title="See your own numbers" message="Sign up and log a few days. The patterns behind your wins and losses show up fast." />
        </View>
      </Screen>
    );
  if (isLoading) return <Loading variant="detail" />;

  // Same order as the Trackers tab
  const trackers = data ?? [];
  const tracker = trackers.find((t) => t.id === selected) ?? trackers[0];

  return (
    <Screen>
      <Txt variant="title">Insights</Txt>
      <Txt variant="caption" style={{ marginBottom: 16 }}>
        Weekly, monthly and yearly analysis of what you actually do.
      </Txt>
      {!tracker ? (
        <EmptyState
          icon="chart-box-outline"
          title="Nothing to analyse yet"
          message="Create a tracker and log a few days — patterns appear fast."
          action="Create tracker"
          onAction={() => router.push('/tracker/new')}
        />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
            {trackers.map((t) => (
              <Chip key={t.id} label={t.name} selected={t.id === tracker.id} color={t.color} onPress={() => setSelected(t.id)} />
            ))}
          </ScrollView>
          <View>
            <Report key={tracker.id} tracker={tracker} currency={currency} />
          </View>
        </>
      )}
    </Screen>
  );
}
