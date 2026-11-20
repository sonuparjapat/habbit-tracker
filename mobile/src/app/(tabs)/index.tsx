import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { HabitCard, SpendingCard, TradingCard } from '@/components/cards';
import { CelebrationModal, LevelBar, type Celebration } from '@/components/game';
import { Banners } from '@/components/gates';
import { GuestHome } from '@/components/guest';
import { ForestPreview } from '@/components/forest';
import { QuickActions, ReviewInvite, StartWithPack } from '@/components/quickActions';
import { SyncStatus } from '@/components/syncStatus';
import { BossPreview } from '@/components/games';
import { GuidedTour, parseTourSteps } from '@/components/tour';
import { AlertCard, Button, Card, EmptyState, ErrorView, Icon, IconButton, Loading, Ring, Row, scoreColor, Screen, SectionTitle, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { greeting, longDate } from '@/lib/format';
import { useAppConfig } from '@/lib/config';
import { usePrefs } from '@/lib/prefs';
import { maybeAskForRating } from '@/lib/rating';
import { useDashboard, useMarkAchievementsSeen } from '@/lib/queries';
import type { DashboardCard, Insight } from '@/lib/types';
import { colors } from '@/theme';

const SECTIONS: { type: DashboardCard['tracker']['type']; title: string }[] = [
  { type: 'habit', title: 'Habits' },
  { type: 'spending', title: 'Money' },
  { type: 'trading', title: 'Trading' },
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
  const { settings } = useAppConfig();
  const celebratedLevel = usePrefs((s) => s.celebratedLevel);
  const tourDone = usePrefs((s) => s.tourDone);
  const updatePrefs = usePrefs((s) => s.update);
  const markSeen = useMarkAchievementsSeen();
  const [closedCelebration, setClosedCelebration] = useState<string | null>(null);

  // What to celebrate (derived, so it can't double-fire): new badges first, then a level-up
  const game = data?.game ?? null;
  const pending: Celebration | null = game?.newlyUnlocked.length
    ? { kind: 'badges', badges: game.newlyUnlocked }
    : game && celebratedLevel > 0 && game.level > celebratedLevel
      ? { kind: 'level', level: game.level, levelName: game.levelName }
      : null;
  const pendingKey = pending ? (pending.kind === 'badges' ? `b:${pending.badges.map((b) => b.key).join()}` : `l:${pending.level}`) : null;
  // First visit: remember the current level without celebrating it
  const currentLevel = game?.level ?? 0;
  useEffect(() => {
    if (currentLevel > 0 && celebratedLevel === 0) void updatePrefs({ celebratedLevel: currentLevel });
  }, [currentLevel, celebratedLevel, updatePrefs]);

  const closeCelebration = () => {
    setClosedCelebration(pendingKey);
    if (pending?.kind === 'badges') markSeen.mutate();
    if (game && game.level > celebratedLevel) void updatePrefs({ celebratedLevel: game.level });
    // A happy moment: a good time to ask for a rating (rarely, and never in the first days)
    void maybeAskForRating(settings);
  };

  if (!signedIn) return <GuestHome />;
  if (isLoading) return <Loading />;

  // Guided tour: once per device after sign-in, steps edited in Admin → App settings
  const tourSteps = parseTourSteps(settings.tour_steps);
  const showTour = settings.tour_enabled && !tourDone && tourSteps.length > 0 && !pending;
  const finishTour = () => {
    void updatePrefs({ tourDone: true });
    if (data && data.cards.length === 0) router.push('/tracker/new');
  };

  const quotes = settings.daily_quotes.length ? settings.daily_quotes : [''];
  const quote = quotes[new Date().getDate() % quotes.length];
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
        <IconButton icon="plus" label="Add tracker" color={colors.text} size={44} onPress={() => router.push('/tracker/new')} />
      </Row>

      <Banners />
      <SyncStatus />

      {user?.termsOutdated ? (
        <Banner icon="file-document-edit-outline" color={colors.blue} title="We updated our Terms & Privacy Policy" message="Please review and accept to keep using Anchor." action="Accept updated terms" onPress={() => void acceptTerms()} />
      ) : null}
      {user && !user.emailVerified ? (
        <Banner icon="email-alert-outline" color={colors.amber} title="Verify your email" message="It lets you recover your account if you forget your password." action="Enter code" onPress={() => router.push('/verify-email')} />
      ) : null}

      {/* With saved data on screen, a failed refresh is just a small note (SyncStatus), not an error page */}
      {error && !data ? <ErrorView error={error} onRetry={refetch} /> : null}

      {data && data.cards.length === 0 ? (
        <EmptyState
          icon="anchor"
          title="Start with one promise"
          message="Pick one thing you want to change — a workout, reading, sleep, quitting a habit, or spending less. Start small."
          action="Create your first tracker"
          onAction={() => router.push('/tracker/new')}
        />
      ) : null}
      {data && data.cards.length === 0 ? <StartWithPack /> : null}

      {data && data.cards.length > 0 ? (
        <>
          {game ? (
            <View style={{ marginBottom: 12 }}>
              <LevelBar game={game} onPress={() => router.push('/achievements' as Href)} />
              <QuickActions />
              {data ? <ReviewInvite date={data.date} /> : null}
              <BossPreview />
              <ForestPreview />
            </View>
          ) : null}
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
      <CelebrationModal celebration={pending && pendingKey !== closedCelebration ? pending : null} onClose={closeCelebration} />
      <GuidedTour steps={tourSteps} visible={showTour} onDone={finishTour} />
    </Screen>
  );
}
