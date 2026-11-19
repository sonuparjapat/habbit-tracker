import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { useGames } from '@/lib/queries';
import type { Boss, Fortress, PiggyBank, QuitSaving } from '@/lib/types';
import { colors, gradients } from '@/theme';
import { Card, CountUp, Gradient, haptic, Icon, ProgressBar, Row, Txt } from './ui';

const BOSS_GRADIENT = ['#5B21B6', '#BE123C'] as const;

/** Bobbing boss that flinches once for every hit it took (capped), then keeps floating. */
function BossSprite({ emoji, hits, defeated, size = 84 }: { emoji: string; hits: number; defeated: boolean; size?: number }) {
  const [bob] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const flinches = Math.min(hits, 6);
    const hitSeq = Array.from({ length: flinches }, () => [
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
    ]).flat();
    Animated.sequence([Animated.delay(350), ...hitSeq, Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true })]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, shake, hits]);
  return (
    <Animated.Text
      style={{
        fontSize: size,
        lineHeight: size * 1.15,
        opacity: defeated ? 0.55 : 1,
        transform: [
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) },
          { rotate: defeated ? '90deg' : '0deg' },
        ],
      }}>
      {emoji}
    </Animated.Text>
  );
}

/** Health bar that drains from full to the boss's current health when it appears. */
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const [width] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.timing(width, { toValue: hp / maxHp, duration: 1100, delay: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [width, hp, maxHp]);
  return (
    <View style={{ height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
      <Animated.View style={{ height: '100%', width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: '#FFFFFF', borderRadius: 7 }} />
    </View>
  );
}

export function BossCard({ boss }: { boss: Boss }) {
  return (
    <Gradient colors={boss.defeated ? gradients.green : BOSS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen glow={boss.defeated ? colors.green : '#BE123C'} style={{ borderRadius: 28, padding: 22, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="label">Boss of the week</Txt>
        <Txt variant="label">{boss.daysLeft === 0 ? 'Last day!' : `${boss.daysLeft} day${boss.daysLeft === 1 ? '' : 's'} left`}</Txt>
      </Row>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <BossSprite emoji={boss.emoji} hits={boss.hits} defeated={boss.defeated} />
        <Txt variant="title" center>{boss.name}</Txt>
        <Txt center style={{ fontStyle: 'italic', opacity: 0.9 }}>
          {boss.defeated ? '💥 Defeated! You kept your promises and won the week.' : `“${boss.taunt}”`}
        </Txt>
      </View>
      <HpBar hp={boss.hp} maxHp={boss.maxHp} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="caption">❤️ {boss.hp} / {boss.maxHp} HP</Txt>
        <Txt variant="caption">
          ⚔️ {boss.hits} hit{boss.hits === 1 ? '' : 's'}
          {boss.heals ? `  ·  🩹 healed ${boss.heals}×` : ''}
        </Txt>
      </Row>
      {!boss.defeated ? <Txt variant="caption">Every promise you keep is a hit. Every rule you break heals it. Beat it before Sunday ends.</Txt> : null}
    </Gradient>
  );
}

/** Compact boss card for the Today screen. */
export function BossPreview() {
  const { data } = useGames();
  if (!data) return null;
  const { boss } = data;
  return (
    <Card
      onPress={() => {
        haptic.tap();
        router.push('/games' as Href);
      }}
      style={{ marginTop: 14 }}>
      <Row gap={12}>
        <BossSprite emoji={boss.emoji} hits={0} defeated={boss.defeated} size={36} />
        <View style={{ flex: 1, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
              {boss.defeated ? `You beat ${boss.name}! 🏆` : boss.name}
            </Txt>
            <Txt variant="caption">{boss.hp}/{boss.maxHp}</Txt>
          </Row>
          <ProgressBar value={boss.hp / boss.maxHp} color={boss.defeated ? colors.green : colors.red} height={7} />
          <Txt variant="caption" numberOfLines={1}>{boss.defeated ? 'Open the arcade →' : 'Keep a promise to hit it ⚔️'}</Txt>
        </View>
      </Row>
    </Card>
  );
}

export function PiggyBankCard({ bank }: { bank: PiggyBank }) {
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  return (
    <Card style={{ gap: 12 }}>
      <Row gap={14}>
        <Txt style={{ fontSize: 44 }}>🐷</Txt>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="caption" numberOfLines={1}>{bank.name} · this month</Txt>
          <CountUp value={bank.saved} format={(n) => money(n, currency)} variant="h2" color={colors.green} />
          <Txt variant="caption">kept under budget</Txt>
        </View>
      </Row>
      <ProgressBar value={bank.fill} color={colors.green} height={8} />
      <Txt variant="caption">
        {bank.daysUnder} day{bank.daysUnder === 1 ? '' : 's'} under budget
        {bank.daysOver ? ` · ${bank.daysOver} over` : ''} · jar goal {money(bank.goal, currency)}
      </Txt>
    </Card>
  );
}

export function FortressCard({ fort }: { fort: Fortress }) {
  const progress = fort.next ? (fort.bricks - fort.level.min) / (fort.next.min - fort.level.min) : 1;
  return (
    <Card style={{ gap: 12 }}>
      <Row gap={14}>
        <Txt style={{ fontSize: 44 }}>{fort.level.emoji}</Txt>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="caption" numberOfLines={1}>{fort.name} · discipline fortress</Txt>
          <Txt variant="h2">{fort.level.name}</Txt>
          <Txt variant="caption">
            🧱 {fort.bricks} clean day{fort.bricks === 1 ? '' : 's'} · 💥 {fort.cracks} broken · 🔥 {fort.streak} in a row
          </Txt>
        </View>
      </Row>
      <ProgressBar value={progress} color={colors.amber} height={8} />
      <Txt variant="caption">{fort.next ? `${fort.next.bricksToGo} more clean trading days to build a ${fort.next.emoji} ${fort.next.name}` : 'You built the Citadel. Untouchable.'}</Txt>
    </Card>
  );
}

export function QuitSavingCard({ item }: { item: QuitSaving }) {
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  return (
    <Card style={{ gap: 6 }}>
      <Row gap={14}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: item.color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={item.icon} size={24} color={item.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="caption" numberOfLines={1}>{item.name}</Txt>
          <CountUp value={item.saved} format={(n) => `💸 ${money(n, currency)}`} variant="h2" color={colors.green} />
          <Txt variant="caption">
            saved in {item.cleanDays} clean day{item.cleanDays === 1 ? '' : 's'} ({money(item.costPerDay, currency)} each)
          </Txt>
        </View>
      </Row>
    </Card>
  );
}
