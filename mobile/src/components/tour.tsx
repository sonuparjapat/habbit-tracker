import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, gradients, isDark, themed } from '@/theme';
import { Button, Gradient, haptic, Txt } from './ui';

export interface TourStep {
  emoji: string;
  title: string;
  text: string;
}

/** Steps come from Admin → App settings → "Tour steps", one per line: "emoji | title | text". */
export function parseTourSteps(lines: string[]): TourStep[] {
  return lines
    .map((line) => line.split('|').map((p) => p.trim()))
    .filter((p) => p.length >= 3 && p[1] && p[2])
    .map(([emoji, title, ...rest]) => ({ emoji: emoji!, title: title!, text: rest.join(' | ') }));
}

/** Full-screen guided tour shown once after sign-in (replayable from Profile). */
export function GuidedTour({ steps, visible, onDone }: { steps: TourStep[]; visible: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [pop] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(0));
  const step = steps[index];
  const last = index === steps.length - 1;

  // Each step: the emoji pops in, the text fades up
  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [index, visible, pop]);

  // Gentle continuous float of the emoji
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, float]);

  if (!visible || !step) return null;

  const go = (next: number) => {
    haptic.tap();
    setIndex(next);
  };
  const finish = () => {
    haptic.success();
    setIndex(0);
    onDone();
  };

  return (
    <Modal visible animationType="fade" onRequestClose={finish} statusBarTranslucent>
      <LinearGradient colors={[isDark() ? '#1B1446' : '#E6DEFF', colors.bg, colors.bg]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
          <View style={styles.top}>
            <Txt variant="caption" color={colors.textMuted}>{index + 1} / {steps.length}</Txt>
            {!last ? (
              <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip tour">
                <Txt variant="caption" color={colors.textMuted} style={{ fontWeight: '700' }}>Skip</Txt>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.center}>
            <Animated.View
              style={{
                transform: [
                  { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
                ],
                opacity: pop,
              }}>
              <Gradient colors={gradients.primary} style={styles.emojiCircle}>
                <Txt style={{ fontSize: 64, lineHeight: 76 }}>{step.emoji}</Txt>
              </Gradient>
            </Animated.View>
            <Animated.View
              style={{
                gap: 14,
                alignItems: 'center',
                opacity: pop,
                transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              }}>
              <Txt variant="title" center style={{ fontSize: 30, lineHeight: 36 }}>{step.title}</Txt>
              <Txt center color={colors.textMuted} style={{ fontSize: 17, lineHeight: 25, maxWidth: 340 }}>{step.text}</Txt>
            </Animated.View>
          </View>

          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive, i < index && { backgroundColor: colors.primary + '88' }]} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {index > 0 ? <Button title="Back" variant="secondary" onPress={() => go(index - 1)} style={{ flex: 1 }} /> : null}
            <Button title={last ? 'Let’s start' : 'Next'} icon={last ? 'rocket-launch' : 'arrow-right'} onPress={last ? finish : () => go(index + 1)} style={{ flex: 2 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 36 },
  emojiCircle: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 22 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  dotActive: { width: 26, backgroundColor: colors.primary },
}));
