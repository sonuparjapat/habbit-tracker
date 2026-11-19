import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useForest } from '@/lib/queries';
import type { ForestDay, TreeStage } from '@/lib/types';
import { colors, isDark, radius } from '@/theme';
import { Card, Icon, ProgressBar, Row, Txt } from './ui';

export const TREE: Record<TreeStage, string> = { [-1]: '🍂', 0: '', 1: '🌱', 2: '🌳', 3: '🌲' };
export const TREE_LABEL: Record<TreeStage, string> = {
  [-1]: 'Withered — broken rules outweighed the good',
  0: 'Nothing logged',
  1: 'Sprout — one promise kept',
  2: 'Tree — two or three kept',
  3: 'Grand tree — four or more, zero rules broken',
};

const soil = () => (isDark() ? '#1A1712' : '#EFE7DA');

/** One plot of land. Today's tree sways gently. */
function Plot({ day, size, isToday }: { day: ForestDay; size: number; isToday: boolean }) {
  const [sway] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!isToday || day.tree <= 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isToday, day.tree, sway]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3.2,
        backgroundColor: day.tree === -1 ? colors.redSoft : day.tree > 0 ? colors.greenSoft : soil(),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: isToday ? 1.5 : 0,
        borderColor: colors.primary,
      }}>
      {day.tree !== 0 ? (
        <Animated.Text
          style={{
            fontSize: size * (day.tree === 3 ? 0.68 : day.tree === 2 ? 0.6 : 0.5),
            transform: [{ rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) }],
          }}>
          {TREE[day.tree]}
        </Animated.Text>
      ) : null}
    </View>
  );
}

/** The field: one plot per day, oldest top-left, laid out in weeks (columns). */
export function ForestField({ days, width }: { days: ForestDay[]; width: number }) {
  const cols = 7;
  const gap = 6;
  const size = Math.floor((width - gap * (cols - 1)) / cols);
  const last = days.length - 1;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {days.map((d, i) => (
        <Plot key={d.date} day={d} size={size} isToday={i === last} />
      ))}
    </View>
  );
}

/** Compact preview for the Today screen. */
export function ForestPreview() {
  const { data } = useForest();
  if (!data) return null;
  const recent = data.grid.slice(-14);
  return (
    <Card onPress={() => router.push('/forest' as Href)} style={{ marginTop: 14, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10} style={{ flex: 1 }}>
          <Txt style={{ fontSize: 28 }}>{data.stage.emoji}</Txt>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Your forest · {data.stage.name}</Txt>
            <Txt variant="caption">
              {data.alive} {data.alive === 1 ? 'tree' : 'trees'} grown
              {data.todayTree > 0 ? ' · today’s tree is growing 🌱' : data.todayTree === -1 ? ' · today’s tree withered' : ' · plant today’s tree'}
            </Txt>
          </View>
        </Row>
        <Icon name="chevron-right" color={colors.textMuted} />
      </Row>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {recent.map((d) => (
          <View key={d.date} style={{ flex: 1, aspectRatio: 1, borderRadius: radius.sm / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: d.tree === -1 ? colors.redSoft : d.tree > 0 ? colors.greenSoft : soil() }}>
            <Txt style={{ fontSize: 11 }}>{TREE[d.tree]}</Txt>
          </View>
        ))}
      </View>
      {data.next ? <ProgressBar value={(data.alive - data.stage.min) / (data.next.min - data.stage.min)} color={colors.green} height={6} /> : null}
    </Card>
  );
}
