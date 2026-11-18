import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { HabitCard, SpendingCard, TradingCard } from '@/components/cards';
import { GuestHome } from '@/components/guest';
import { AlertCard, Button, Card, EmptyState, ErrorView, Icon, IconButton, Loading, Ring, Row, scoreColor, Screen, SectionTitle, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { greeting, longDate } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import type { DashboardCard, Insight } from '@/lib/types';
import { colors } from '@/theme';

const QUOTES = [
  'Discipline is choosing between what you want now and what you want most.',
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  'Small promises, kept daily, build unshakable self-trust.',
  'The goal is not to do more. The goal is to do what you said you would.',
  'Hitting your target is the signal to stop, not to start.',
  'Motivation gets you started. Habit keeps you going.',
  'Every time you keep a rule, you vote for the person you want to become.',
];

const SECTIONS: { type: DashboardCard['tracker']['type']; title: string }[] = [
  { type: 'trading', title: 'Trading' },
  { type: 'spending', title: 'Money' },
  { type: 'habit', title: 'Habits' },
];

function Banner({ icon, color, title, message, action, onPress }: { icon: string; color: string; title: string; message: string; action: string; onPress: () => void }) {
  return (
    <Card accent={color + '55'} style={{ marginBottom: 14 }}>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <Icon name={icon} size={22} color={color} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="h3">{title}</Txt>
          <Txt variant="caption">{message}</Txt>
          <Pressable onPress={onPress} hitSlop={8} style={{ marginTop: 6 }}>
            <Txt variant="caption" color={color} style={{ fontWeight: '700' }}>{action} →</Txt>
          </Pressable>
        </View>
      </Row>
    </Card>
  );
}

export default function Today() {
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();
  const user = useAuth((s) => s.user);
  const signedIn = useAuth((s) => !!s.token);
  const acceptTerms = useAuth((s) => s.acceptTerms);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  if (!signedIn) return <GuestHome />;
  if (isLoading) return <Loading />;

  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const alerts: Insight[] = (data?.cards ?? [])
    .flatMap((c) => ('alerts' in c.today ? c.today.alerts : []))
    .sort((a, b) => ['danger', 'warning', 'info', 'success'].indexOf(a.level) - ['danger', 'warning', 'info', 'success'].indexOf(b.level));
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 2);
  const score = data?.summary.dayScore ?? 0;
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 24, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption">{data ? longDate(data.date) : ''}</Txt>
          <Txt variant="title">{greeting()}{firstName ? `, ${firstName}` : ''}</Txt>
        </View>
        <IconButton icon="plus" color={colors.text} size={44} onPress={() => router.push('/tracker/new')} />
      </Row>

      {user?.termsOutdated ? (
        <Banner icon="file-document-edit-outline" color={colors.blue} title="We updated our Terms & Privacy Policy" message="Please review and accept to keep using Anchor." action="Accept updated terms" onPress={() => void acceptTerms()} />
      ) : null}
      {user && !user.emailVerified ? (
        <Banner icon="email-alert-outline" color={colors.amber} title="Verify your email" message="It lets you recover your account if you forget your password." action="Enter code" onPress={() => router.push('/verify-email')} />
      ) : null}

      {error ? <ErrorView error={error} onRetry={refetch} /> : null}

      {data && data.cards.length === 0 ? (
        <EmptyState
          icon="anchor"
          title="Start with one promise"
          message="Pick something you want to work on — trading, money, health, focus, or quitting a habit. Start small."
          action="Create your first tracker"
          onAction={() => router.push('/tracker/new')}
        />
      ) : null}

      {data && data.cards.length > 0 ? (
        <>
          <Card>
            <Row gap={20}>
              <Ring value={score / 100} size={92} stroke={9} color={scoreColor(score)}>
                <Txt variant="h2">{score}</Txt>
              </Ring>
              <View style={{ flex: 1, gap: 8 }}>
                <Txt variant="label">Today’s discipline</Txt>
                <Txt variant="h3">
                  {data.summary.habitsDue > 0 ? `${data.summary.habitsDone} of ${data.summary.habitsDue} habits done` : 'No habits due today'}
                </Txt>
                <Row gap={6}>
                  <Icon name={data.summary.ruleBreaksToday ? 'alert-octagon' : 'shield-check'} size={16} color={data.summary.ruleBreaksToday ? colors.red : colors.green} />
                  <Txt variant="caption" color={data.summary.ruleBreaksToday ? colors.red : colors.green}>
                    {data.summary.ruleBreaksToday ? `${data.summary.ruleBreaksToday} limit${data.summary.ruleBreaksToday > 1 ? 's' : ''} broken` : 'All limits respected'}
                  </Txt>
                </Row>
              </View>
            </Row>
          </Card>

          {alerts.length > 0 ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              {visibleAlerts.map((a, i) => (
                <AlertCard key={i} alert={a} />
              ))}
              {alerts.length > 2 ? (
                <Pressable onPress={() => setShowAllAlerts((s) => !s)} style={{ alignSelf: 'center', padding: 6 }}>
                  <Txt variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
                    {showAllAlerts ? 'Show less' : `Show ${alerts.length - 2} more`}
                  </Txt>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {SECTIONS.map(({ type, title }) => {
            const cards = data.cards.filter((c) => c.tracker.type === type);
            if (!cards.length) return null;
            return (
              <View key={type}>
                <SectionTitle>{title}</SectionTitle>
                <View style={{ gap: 12 }}>
                  {cards.map((c) =>
                    c.tracker.type === 'trading' ? (
                      <TradingCard key={c.tracker.id} tracker={c.tracker} today={c.today as any} currency={data.user.currency} />
                    ) : c.tracker.type === 'spending' ? (
                      <SpendingCard key={c.tracker.id} tracker={c.tracker} today={c.today as any} currency={data.user.currency} />
                    ) : (
                      <HabitCard key={c.tracker.id} tracker={c.tracker} today={c.today as any} date={data.date} />
                    ),
                  )}
                </View>
              </View>
            );
          })}

          <Button title="Add another tracker" icon="plus" variant="secondary" style={{ marginTop: 28 }} onPress={() => router.push('/tracker/new')} />

          <View style={{ marginTop: 36, paddingHorizontal: 8, gap: 8 }}>
            <Icon name="format-quote-open" size={24} color={colors.primary} />
            <Txt color={colors.textMuted} style={{ fontStyle: 'italic', fontSize: 16, lineHeight: 24 }}>{quote}</Txt>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
