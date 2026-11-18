import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Achievement, Game } from '@/lib/types';
import { colors, gradients, radius } from '@/theme';
import { Button, haptic, Icon, ProgressBar, Row, Txt } from './ui';

/* --------------------------------- Level bar -------------------------------- */

export function LevelBar({ game, onPress }: { game: Game; onPress?: () => void }) {
  const toNext = game.nextLevelXp - game.xp;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Level ${game.level}, ${game.levelName}. ${toNext} XP to next level.`}>
      <View style={styles.levelCard}>
        <LinearGradient colors={gradients.primary} style={styles.levelBadge}>
          <Txt variant="h2" style={{ fontSize: 18 }}>{game.level}</Txt>
        </LinearGradient>
        <View style={{ flex: 1, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="h3">{game.levelName}</Txt>
            <Txt variant="caption" style={{ fontSize: 12 }}>{game.xp} XP</Txt>
          </Row>
          <ProgressBar value={game.progress} height={6} />
          <Txt variant="caption" style={{ fontSize: 12 }}>{toNext} XP to level {game.level + 1} · {game.unlockedCount}/{game.achievements.length} badges</Txt>
        </View>
        <Icon name="chevron-right" size={20} color={colors.textDim} />
      </View>
    </Pressable>
  );
}

/* ------------------------------- Badge grid -------------------------------- */

export function AchievementGrid({ achievements }: { achievements: Achievement[] }) {
  return (
    <View style={styles.grid}>
      {achievements.map((a) => (
        <View key={a.key} style={[styles.badge, !a.unlocked && { opacity: 0.4 }]} accessibilityLabel={`${a.title}: ${a.description}${a.unlocked ? ', unlocked' : ', locked'}`}>
          {a.unlocked ? (
            <LinearGradient colors={['#F59E0B', '#F43F5E']} style={styles.badgeIcon}>
              <Icon name={a.icon} size={26} />
            </LinearGradient>
          ) : (
            <View style={[styles.badgeIcon, { backgroundColor: colors.surfaceHigh }]}>
              <Icon name="lock" size={22} color={colors.textDim} />
            </View>
          )}
          <Txt variant="caption" center color={colors.text} style={{ fontWeight: '700', fontSize: 12 }} numberOfLines={2}>{a.title}</Txt>
          <Txt variant="caption" center style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={3}>{a.description}</Txt>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------- Celebration ------------------------------- */

const CONFETTI = ['🎉', '✨', '🔥', '⭐', '🏆', '💪', '🎯'];

function Confetti() {
  const { width, height } = useWindowDimensions();
  const [pieces] = useState(() =>
    Array.from({ length: 22 }, (_, i) => ({
      key: i,
      x: Math.random() * width,
      delay: Math.random() * 500,
      drift: (Math.random() - 0.5) * 120,
      emoji: CONFETTI[i % CONFETTI.length],
      v: new Animated.Value(0),
    })),
  );
  useEffect(() => {
    Animated.stagger(
      30,
      pieces.map((p) =>
        Animated.timing(p.v, { toValue: 1, duration: 1800 + Math.random() * 800, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <Animated.Text
          key={p.key}
          style={{
            position: 'absolute',
            left: p.x,
            top: -40,
            fontSize: 22,
            opacity: p.v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.drift * 3}deg`] }) },
            ],
          }}>
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

export type Celebration = { kind: 'level'; level: number; levelName: string } | { kind: 'badges'; badges: Achievement[] };

/** Full-screen celebration for a new level or newly unlocked badges. */
export function CelebrationModal({ celebration, onClose }: { celebration: Celebration | null; onClose: () => void }) {
  const [scale] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    if (!celebration) return;
    haptic.success();
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [celebration, scale]);

  if (!celebration) return null;
  const isLevel = celebration.kind === 'level';
  const badge = !isLevel ? celebration.badges[0] : null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Confetti />
        <Animated.View style={[styles.celebrateCard, { transform: [{ scale }] }]}>
          <LinearGradient colors={isLevel ? gradients.primary : ['#F59E0B', '#F43F5E']} style={styles.celebrateIcon}>
            {isLevel ? <Txt variant="hero" style={{ fontSize: 44 }}>{celebration.level}</Txt> : <Icon name={badge!.icon} size={52} />}
          </LinearGradient>
          <Txt variant="label" center color={colors.amber}>{isLevel ? 'Level up!' : celebration.badges.length > 1 ? `${celebration.badges.length} badges unlocked!` : 'Badge unlocked!'}</Txt>
          <Txt variant="title" center>{isLevel ? celebration.levelName : badge!.title}</Txt>
          <Txt variant="caption" center style={{ fontSize: 15, lineHeight: 22 }}>
            {isLevel
              ? 'Every kept promise got you here. Keep the chain going.'
              : celebration.badges.length > 1
                ? celebration.badges.map((b) => b.title).join(' · ')
                : badge!.description}
          </Txt>
          <Button title="Keep going" icon="arrow-right" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/* --------------------------------- XP pop ---------------------------------- */

/** A small "+10 XP" that floats up and fades. Change `trigger` to play it. */
export function XpPop({ trigger, amount }: { trigger: number; amount: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!trigger) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trigger, v]);
  if (!trigger || !amount) return null;
  const positive = amount > 0;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: 12,
        top: 4,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) }, { scale: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) }],
      }}>
      <View style={{ backgroundColor: positive ? colors.greenSoft : colors.redSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
        <Txt variant="caption" color={positive ? colors.green : colors.red} style={{ fontWeight: '800' }}>
          {positive ? '+' : ''}
          {amount} XP
        </Txt>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14 },
  levelBadge: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  badge: { width: '31.5%', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  badgeIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(5,6,10,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  celebrateCard: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, padding: 28, alignItems: 'center', gap: 10 },
  celebrateIcon: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
