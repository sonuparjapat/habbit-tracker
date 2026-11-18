import { router } from 'expo-router';
import { View } from 'react-native';
import { GuestPrompt, TemplateStrip } from '@/components/guest';
import { Button, Card, EmptyState, ErrorView, Icon, Loading, Row, Screen, SectionTitle, TrackerIcon, Txt } from '@/components/ui';
import { money, WEEKDAY_LETTERS } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useTrackers } from '@/lib/queries';
import type { Tracker } from '@/lib/types';
import { colors } from '@/theme';

function describe(t: Tracker, currency: string) {
  if (t.type === 'trading') {
    const c = t.config;
    return `${c.maxTradesPerDay} trade${c.maxTradesPerDay > 1 ? 's' : ''}/day · target ${money(c.dailyProfitTarget, currency)} · max loss ${money(c.dailyMaxLoss, currency)}`;
  }
  const c = t.config;
  const goal = c.goalType === 'boolean' ? (c.kind === 'quit' ? 'Avoid' : 'Daily') : `${c.target} ${c.unit}`;
  const days = c.days.length === 7 ? 'every day' : c.days.map((d) => WEEKDAY_LETTERS[d]).join(' ');
  return `${goal} · ${days}`;
}

export default function Trackers() {
  const { data, isLoading, error, refetch, isRefetching } = useTrackers();
  const currency = useAuth((s) => s.user?.currency ?? 'INR');
  const signedIn = useAuth((s) => !!s.token);

  if (!signedIn)
    return (
      <Screen>
        <Txt variant="title">Trackers</Txt>
        <Txt variant="caption" style={{ marginBottom: 20 }}>Each tracker is a promise to yourself. Pick one to start.</Txt>
        <TemplateStrip />
        <View style={{ marginTop: 20 }}>
          <GuestPrompt
            icon="view-grid-plus-outline"
            title="Your trackers live here"
            message="Create a free account to save trading plans and habits, and keep your streaks safe across devices."
          />
        </View>
      </Screen>
    );
  if (isLoading) return <Loading />;

  const trading = data?.filter((t) => t.type === 'trading') ?? [];
  const habits = data?.filter((t) => t.type === 'habit') ?? [];

  const renderList = (list: Tracker[]) => (
    <View style={{ gap: 10 }}>
      {list.map((t) => (
        <Card key={t.id} onPress={() => router.push(`/tracker/${t.id}`)}>
          <Row gap={12}>
            <TrackerIcon icon={t.icon} color={t.color} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="h3" numberOfLines={1}>{t.name}</Txt>
              <Txt variant="caption" numberOfLines={2}>{describe(t, currency)}</Txt>
            </View>
            <Icon name="chevron-right" color={colors.textDim} />
          </Row>
        </Card>
      ))}
    </View>
  );

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Txt variant="title">Trackers</Txt>
        <Button title="New" icon="plus" small onPress={() => router.push('/tracker/new')} />
      </Row>
      <Txt variant="caption">Each tracker is a promise to yourself. Keep few, keep them all.</Txt>

      {error ? <ErrorView error={error} onRetry={refetch} /> : null}
      {data?.length === 0 ? (
        <View style={{ marginTop: 20 }}>
          <EmptyState
            icon="view-grid-plus-outline"
            title="No trackers yet"
            message="Pick a template to start in seconds."
            action="Create tracker"
            onAction={() => router.push('/tracker/new')}
          />
        </View>
      ) : null}

      {trading.length ? <SectionTitle>Trading plans</SectionTitle> : null}
      {renderList(trading)}
      {habits.length ? <SectionTitle>Habits</SectionTitle> : null}
      {renderList(habits)}
    </Screen>
  );
}
