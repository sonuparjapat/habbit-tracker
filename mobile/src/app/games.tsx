import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { ForestPreview } from '@/components/forest';
import { BossCard, FortressCard, PiggyBankCard, QuitSavingCard } from '@/components/games';
import { Card, EmptyState, ErrorView, Icon, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useGames } from '@/lib/queries';
import { colors } from '@/theme';

/** A hint card that tells the member how to unlock a game they don't have yet. */
function Unlock({ emoji, title, text, onPress }: { emoji: string; title: string; text: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ opacity: 0.85 }}>
      <Row gap={14}>
        <Txt style={{ fontSize: 34, opacity: 0.5 }}>{emoji}</Txt>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <Icon name="lock-outline" size={15} color={colors.textMuted} />
            <Txt variant="h3">{title}</Txt>
          </Row>
          <Txt variant="caption">{text}</Txt>
        </View>
      </Row>
    </Card>
  );
}

export default function GamesScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useGames();
  if (isLoading) return <Loading />;
  if (error) return <Screen edges={['bottom']}><ErrorView error={error} onRetry={refetch} /></Screen>;
  if (!data) return <Screen edges={['bottom']}><EmptyState icon="gamepad-variant-outline" title="The arcade is closed" message="Games are switched off right now." /></Screen>;

  const newTracker = () => router.push('/tracker/new' as Href);

  return (
    <Screen edges={['bottom']} onRefresh={refetch} refreshing={isRefetching} contentStyle={{ paddingTop: 12 }}>
      <Txt variant="caption" style={{ marginBottom: 14 }}>
        Every game here is built from what you really logged — keep your promises and you win. No shortcuts, no fakes.
      </Txt>

      <BossCard boss={data.boss} />

      <SectionTitle>Your forest</SectionTitle>
      <ForestPreview />

      <SectionTitle>Money saved</SectionTitle>
      <View style={{ gap: 12 }}>
        {data.quitSavings.map((q) => <QuitSavingCard key={q.trackerId} item={q} />)}
        {data.piggyBanks.map((b) => <PiggyBankCard key={b.trackerId} bank={b} />)}
        {!data.quitSavings.length ? (
          <Unlock emoji="💸" title="Money saved by quitting" text="Create a Quit or Limit habit and set “what a bad day costs you”. Watch every clean day add up." onPress={newTracker} />
        ) : null}
        {!data.piggyBanks.length ? (
          <Unlock emoji="🐷" title="Piggy bank" text="Add a Money tracker with a daily or monthly budget. Everything you don’t spend drops into the jar." onPress={newTracker} />
        ) : null}
      </View>

      {data.fortresses.length ? (
        <>
          <SectionTitle>Discipline fortress</SectionTitle>
          <View style={{ gap: 12 }}>
            {data.fortresses.map((f) => <FortressCard key={f.trackerId} fort={f} />)}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
