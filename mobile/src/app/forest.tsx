import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';
import { ForestField, TREE, TREE_LABEL } from '@/components/forest';
import { Button, Card, EmptyState, ErrorView, Gradient, Loading, ProgressBar, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useForest } from '@/lib/queries';
import type { TreeStage } from '@/lib/types';
import { colors, gradients } from '@/theme';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt variant="h2">{value}</Txt>
      <Txt variant="caption" style={{ fontSize: 12 }}>{label}</Txt>
    </View>
  );
}

export default function ForestScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useForest();
  const { width } = useWindowDimensions();
  const [grow] = useState(() => new Animated.Value(0));
  const ready = !!data;
  useEffect(() => {
    if (ready) Animated.spring(grow, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, [ready, grow]);

  if (isLoading) return <Loading />;
  if (error) return <Screen edges={['bottom']}><ErrorView error={error} onRetry={refetch} /></Screen>;
  if (!data) return <Screen edges={['bottom']}><EmptyState icon="tree-outline" title="The forest is resting" message="Games are switched off right now." /></Screen>;

  const progress = data.next ? (data.alive - data.stage.min) / (data.next.min - data.stage.min) : 1;
  const fieldWidth = Math.min(width, 520) - 40 - 40; // screen padding + card padding

  return (
    <Screen edges={['bottom']} onRefresh={refetch} refreshing={isRefetching} contentStyle={{ paddingTop: 12 }}>
      <Gradient colors={gradients.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen glow={colors.green} style={{ borderRadius: 28, padding: 24, alignItems: 'center', gap: 6 }}>
        <Animated.Text style={{ fontSize: 72, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
          {data.stage.emoji}
        </Animated.Text>
        <Txt variant="title" center>{data.stage.name}</Txt>
        <Txt center>
          {data.alive} {data.alive === 1 ? 'tree' : 'trees'} grown from promises you kept
        </Txt>
        {data.next ? (
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 10 }}>
            <ProgressBar value={progress} color="#FFFFFF" height={8} />
            <Txt variant="caption" center>
              {data.next.treesToGo} more to reach {data.next.emoji} {data.next.name}
            </Txt>
          </View>
        ) : (
          <Txt variant="caption" center>You reached the highest stage. Legendary.</Txt>
        )}
      </Gradient>

      <Card style={{ marginTop: 14 }}>
        <Row>
          <Stat value={data.streak} label="day streak" />
          <Stat value={data.grand} label="grand trees" />
          <Stat value={data.withered} label="withered" />
          <Stat value={data.health == null ? '—' : `${data.health}%`} label="health · 30d" />
        </Row>
      </Card>

      <SectionTitle>Last 12 weeks</SectionTitle>
      <Card>
        <Animated.View style={{ opacity: grow }}>
          <ForestField days={data.grid} width={fieldWidth} />
        </Animated.View>
        <Txt variant="caption" style={{ marginTop: 12 }}>
          Oldest top-left, today bottom-right (outlined).{' '}
          {data.todayTree > 0 ? 'Today’s tree is already growing.' : data.todayTree === -1 ? 'Today’s tree withered — tomorrow is a fresh plot.' : 'Today’s plot is still empty.'}
        </Txt>
      </Card>

      <SectionTitle>How your forest grows</SectionTitle>
      <Card style={{ gap: 12 }}>
        {([3, 2, 1, -1] as TreeStage[]).map((t) => (
          <Row key={t} gap={12}>
            <Txt style={{ fontSize: 24, width: 32, textAlign: 'center' }}>{TREE[t]}</Txt>
            <Txt variant="caption" style={{ flex: 1 }} color={t === -1 ? colors.red : undefined}>{TREE_LABEL[t]}</Txt>
          </Row>
        ))}
        <Txt variant="caption">
          A “promise kept” is a habit done, a trade inside your rules, a journal written or an expense inside budget. Broken rules
          count against the day. The forest is built only from what you log — it can’t be faked.
        </Txt>
      </Card>

      {data.todayTree <= 0 ? <Button title="Plant today’s tree" icon="sprout" onPress={() => router.navigate('/')} style={{ marginTop: 20 }} /> : null}
    </Screen>
  );
}
