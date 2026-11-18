import { router } from 'expo-router';
import { View } from 'react-native';
import { HabitCard, TradingCard } from '@/components/cards';
import { GuestHome } from '@/components/guest';
import {
  AlertCard,
  Card,
  EmptyState,
  ErrorView,
  Icon,
  Loading,
  Ring,
  Row,
  scoreColor,
  Screen,
  SectionTitle,
  Txt,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { greeting, longDate } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import { colors } from '@/theme';

const QUOTES = [
  'Amateurs think about how much they can make. Professionals think about how much they can lose.',
  'The goal is not to trade more. The goal is to trade well.',
  'Discipline is choosing between what you want now and what you want most.',
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  'One good trade and done beats ten trades and undone.',
  'The market rewards patience and punishes ego.',
  'Hitting your target is the signal to stop, not to start.',
];

export default function Today() {
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();
  const name = useAuth((s) => s.user?.name ?? '');
  const signedIn = useAuth((s) => !!s.token);

  if (!signedIn) return <GuestHome />;
  if (isLoading) return <Loading />;

  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const alerts = data?.cards.flatMap((c) => (c.tracker.type === 'trading' ? (c.today as any).alerts : [])) ?? [];
  const trading = data?.cards.filter((c) => c.tracker.type === 'trading') ?? [];
  const habits = data?.cards.filter((c) => c.tracker.type === 'habit') ?? [];
  const score = data?.summary.dayScore ?? 0;

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <View>
          <Txt variant="caption">{data ? longDate(data.date) : ''}</Txt>
          <Txt variant="title">
            {greeting()}
            {name ? `, ${name.split(' ')[0]}` : ''}
          </Txt>
        </View>
      </Row>

      {error ? <ErrorView error={error} onRetry={refetch} /> : null}

      {data && data.cards.length === 0 ? (
        <EmptyState
          icon="anchor"
          title="Start with one rule"
          message="Create a trading plan like “One trade a day” or a habit you want to build. Small, kept promises build discipline."
          action="Create tracker"
          onAction={() => router.push('/tracker/new')}
        />
      ) : null}

      {data && data.cards.length > 0 ? (
        <>
          <Card>
            <Row gap={18}>
              <Ring value={score / 100} size={96} stroke={10} color={scoreColor(score)}>
                <Txt variant="h2">{score}</Txt>
              </Ring>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt variant="label">Discipline today</Txt>
                <Txt variant="h3">
                  {data.summary.habitsDue > 0
                    ? `${data.summary.habitsDone} of ${data.summary.habitsDue} habits done`
                    : 'No habits due today'}
                </Txt>
                <Row gap={6}>
                  <Icon
                    name={data.summary.ruleBreaksToday ? 'alert-octagon' : 'shield-check'}
                    size={16}
                    color={data.summary.ruleBreaksToday ? colors.red : colors.green}
                  />
                  <Txt variant="caption" color={data.summary.ruleBreaksToday ? colors.red : colors.green}>
                    {data.summary.ruleBreaksToday
                      ? `${data.summary.ruleBreaksToday} rule${data.summary.ruleBreaksToday > 1 ? 's' : ''} broken today`
                      : 'No rules broken today'}
                  </Txt>
                </Row>
              </View>
            </Row>
          </Card>

          {alerts.length > 0 ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {alerts.map((a: any, i: number) => (
                <AlertCard key={i} alert={a} />
              ))}
            </View>
          ) : null}

          {trading.length > 0 ? <SectionTitle>Trading</SectionTitle> : null}
          <View style={{ gap: 12 }}>
            {trading.map((c) => (
              <TradingCard key={c.tracker.id} tracker={c.tracker as any} today={c.today as any} currency={data.user.currency} />
            ))}
          </View>

          {habits.length > 0 ? (
            <SectionTitle action="+ Add" onAction={() => router.push('/tracker/new')}>
              Habits
            </SectionTitle>
          ) : null}
          <View style={{ gap: 10 }}>
            {habits.map((c) => (
              <HabitCard key={c.tracker.id} tracker={c.tracker as any} today={c.today as any} date={data.date} />
            ))}
          </View>

          <Card style={{ marginTop: 24 }}>
            <Icon name="format-quote-open" size={22} color={colors.primary} />
            <Txt style={{ marginTop: 6, fontStyle: 'italic' }} color={colors.textMuted}>
              {quote}
            </Txt>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
