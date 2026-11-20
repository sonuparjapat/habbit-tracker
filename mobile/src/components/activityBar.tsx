/**
 * A thin, glowing bar across the top of the screen while anything is loading or saving
 * (data refreshing, a check-in syncing, a trade being judged…), so a tap never feels ignored.
 * It only appears if the work takes more than a moment — quick requests stay invisible.
 */
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutbox } from '@/lib/outbox';
import { gradients } from '@/theme';

const DELAY_MS = 400;

export function ActivityBar() {
  const fetching = useIsFetching();
  const saving = useIsMutating();
  const syncing = useOutbox((s) => s.syncing);
  const busy = fetching + saving > 0 || syncing;
  const [visible, setVisible] = useState(false);
  const [slide] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(0));
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Show only after a short delay; hide (with a fade) as soon as everything is done
  useEffect(() => {
    if (!busy) {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setVisible(false));
      return;
    }
    const id = setTimeout(() => {
      setVisible(true);
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [busy, fade]);

  useEffect(() => {
    if (!visible) return;
    slide.setValue(0);
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [visible, slide]);

  if (!visible) return null;
  const segment = width * 0.4;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: 3, overflow: 'hidden', zIndex: 1000, opacity: fade }}>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ width: segment, height: 3, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] }) }] }}>
          <LinearGradient colors={['transparent', gradients.primary[0], gradients.primary[1], 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1, borderRadius: 2, boxShadow: `0 0 8px ${gradients.primary[0]}` }} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
