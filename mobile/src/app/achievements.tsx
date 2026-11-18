import { View } from 'react-native';
import { AchievementGrid, LevelBar } from '@/components/game';
import { Card, EmptyState, ErrorView, Icon, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useDashboard } from '@/lib/queries';
import { colors } from '@/theme';

export default function Achievements() {
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();
  if (isLoading) return <Loading />;
  if (error) return <Screen edges={['bottom']}><ErrorView error={error} onRetry={refetch} /></Screen>;
  const game = data?.game;
  if (!game) return <Screen edges={['bottom']}><EmptyState icon="trophy-outline" title="Levels are paused" message="XP and badges are switched off right now." /></Screen>;

  const p = game.points;
  const rules: [string, string, number][] = [
    ['check-circle-outline', 'Complete a habit day', p.habitDay],
    ['shield-check-outline', 'Trade within your rules', p.cleanTrade],
    ['notebook-edit-outline', 'Write your trading journal', p.journal],
    ['wallet-outline', 'Log an expense within budget', p.expense],
    ['alert-octagon-outline', 'Break one of your rules', p.ruleBreak],
  ];

  return (
    <Screen edges={['bottom']} onRefresh={refetch} refreshing={isRefetching}>
      <LevelBar game={game} />

      <SectionTitle>How you earn XP</SectionTitle>
      <Card style={{ gap: 14 }}>
        {rules.map(([icon, label, pts]) => (
          <Row key={label} gap={12}>
            <Icon name={icon} size={20} color={pts < 0 ? colors.red : colors.green} />
            <Txt style={{ flex: 1 }}>{label}</Txt>
            <Txt variant="mono" color={pts < 0 ? colors.red : colors.green}>{pts > 0 ? '+' : ''}{pts}</Txt>
          </Row>
        ))}
        <Txt variant="caption">Every badge adds a bonus too. Undoing a check-in takes its XP back — XP always reflects what you really did.</Txt>
      </Card>

      <SectionTitle>Badges · {game.unlockedCount} of {game.achievements.length}</SectionTitle>
      <AchievementGrid achievements={[...game.achievements].sort((a, b) => Number(b.unlocked) - Number(a.unlocked))} />
      <View style={{ height: 20 }} />
    </Screen>
  );
}
