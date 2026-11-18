import { router } from 'expo-router';
import { View } from 'react-native';
import { GuestPrompt, TemplateStrip } from '@/components/guest';
import { Card, EmptyState, ErrorView, Icon, IconButton, Loading, Row, Screen, SectionTitle, TrackerIcon, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CATEGORIES } from '@/lib/catalog';
import { money, WEEKDAY_LETTERS } from '@/lib/format';
import { useTrackers } from '@/lib/queries';
import type { Tracker } from '@/lib/types';
import { colors } from '@/theme';

const days = (d: number[]) => (d.length === 7 ? 'every day' : d.join() === '1,2,3,4,5' ? 'weekdays' : d.map((x) => WEEKDAY_LETTERS[x]).join(' '));

function describe(t: Tracker, currency: string) {
  if (t.type === 'trading') {
    const c = t.config;
    return [
      `${c.maxTradesPerDay} trade${c.maxTradesPerDay > 1 ? 's' : ''}/day`,
      c.dailyProfitTarget ? `target ${money(c.dailyProfitTarget, currency)}` : null,
      c.dailyMaxLoss ? `max loss ${money(c.dailyMaxLoss, currency)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (t.type === 'spending') {
    const c = t.config;
    const parts = [c.dailyLimit ? `${money(c.dailyLimit, currency)}/day` : null, c.monthlyLimit ? `${money(c.monthlyLimit, currency)}/month` : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Track every expense';
  }
  const c = t.config;
  const goal =
    c.kind === 'quit' ? 'Stay clean' : c.kind === 'limit' ? `Max ${c.target} ${c.unit}` : c.goalType === 'boolean' ? 'Daily' : `${c.target} ${c.unit}`;
  return `${goal} · ${days(c.days)}`;
}

export default function Trackers() {
  const { data, isLoading, error, refetch, isRefetching } = useTrackers();
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const signedIn = useAuth((s) => !!s.token);

  if (!signedIn)
    return (
      <Screen>
        <Txt variant="title">Trackers</Txt>
        <Txt variant="caption" style={{ marginTop: 6, marginBottom: 24 }}>Each tracker is a promise to yourself. Pick one to start.</Txt>
        <TemplateStrip />
        <View style={{ marginTop: 28 }}>
          <GuestPrompt icon="view-grid-plus-outline" title="Your trackers live here" message="Create a free account to save your trackers and keep your streaks safe across devices." />
        </View>
      </Screen>
    );
  if (isLoading) return <Loading />;

  const groups = CATEGORIES.map((c) => ({ c, list: (data ?? []).filter((t) => t.category === c.key) })).filter((g) => g.list.length);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <Txt variant="title">Trackers</Txt>
        <IconButton icon="plus" color={colors.text} size={44} onPress={() => router.push('/tracker/new')} />
      </Row>
      <Txt variant="caption" style={{ marginTop: 6 }}>Keep few. Keep them all.</Txt>

      {error ? <View style={{ marginTop: 20 }}><ErrorView error={error} onRetry={refetch} /></View> : null}
      {data?.length === 0 ? (
        <View style={{ marginTop: 24 }}>
          <EmptyState icon="view-grid-plus-outline" title="No trackers yet" message="Pick an area and a template — it takes seconds." action="Create tracker" onAction={() => router.push('/tracker/new')} />
        </View>
      ) : null}

      {groups.map(({ c, list }) => (
        <View key={c.key}>
          <SectionTitle>{c.label}</SectionTitle>
          <View style={{ gap: 10 }}>
            {list.map((t) => (
              <Card key={t.id} onPress={() => router.push(`/tracker/${t.id}`)}>
                <Row gap={14}>
                  <TrackerIcon icon={t.icon} color={t.color} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt variant="h3" numberOfLines={1}>{t.name}</Txt>
                    <Txt variant="caption" numberOfLines={2}>{describe(t, currency)}</Txt>
                  </View>
                  <Icon name="chevron-right" color={colors.textDim} />
                </Row>
              </Card>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
