/**
 * A small, calm line on the Today screen that says what's happening behind the scenes:
 *   - changes waiting to reach the server (they're safe on the phone)
 *   - the server is waking up / unreachable, so the last saved data is shown
 *   - a change the server could not accept (rare) — with the reason
 * Shows nothing at all when everything is in sync.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { dismissRejected, useOutbox } from '@/lib/outbox';
import { useDashboard } from '@/lib/queries';
import { colors, radius } from '@/theme';
import { Icon, Row, Txt } from './ui';

function PulseDot({ color }: { color: string }) {
  const [pulse] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: pulse, transform: [{ scale: pulse }] }} />;
}

function Pill({ color, icon, text, pulse }: { color: string; icon: string; text: string; pulse?: boolean }) {
  return (
    <Row gap={8} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: color + '1F', marginBottom: 12 }}>
      {pulse ? <PulseDot color={color} /> : <Icon name={icon} size={14} color={color} />}
      <Txt variant="caption" color={color} style={{ fontSize: 13, fontWeight: '600' }}>{text}</Txt>
    </Row>
  );
}

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

export function SyncStatus() {
  const { ops, syncing, waiting, rejected } = useOutbox();
  const { data, isFetching, isError } = useDashboard();
  // Only call a refresh "slow" after a few seconds — normal refreshes stay invisible
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!isFetching) return;
    const id = setTimeout(() => setSlow(true), 3000);
    return () => {
      clearTimeout(id);
      setSlow(false);
    };
  }, [isFetching]);

  if (rejected.length) {
    const last = rejected[rejected.length - 1]!;
    return (
      <View style={{ marginBottom: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.redSoft, gap: 6 }}>
        <Row gap={8}>
          <Icon name="alert-circle-outline" size={18} color={colors.red} />
          <Txt variant="h3" color={colors.red} style={{ flex: 1, fontSize: 15 }}>
            {rejected.length === 1 ? 'One change couldn’t be saved' : `${rejected.length} changes couldn’t be saved`}
          </Txt>
          <Pressable onPress={dismissRejected} hitSlop={10} accessibilityLabel="Dismiss">
            <Icon name="close" size={18} color={colors.red} />
          </Pressable>
        </Row>
        <Txt variant="caption">{last.error}. Your screen now shows what’s really saved.</Txt>
      </View>
    );
  }
  if (ops.length) {
    return syncing && !waiting ? (
      <Pill color={colors.primary} icon="sync" pulse text={`Saving ${plural(ops.length)}…`} />
    ) : (
      <Pill color={colors.amber} icon="cloud-upload-outline" pulse text={`${plural(ops.length)} saved on your phone · syncing automatically`} />
    );
  }
  if (data && isError && !isFetching) return <Pill color={colors.textMuted} icon="cloud-off-outline" text="Offline · showing your last saved data" />;
  if (data && isFetching && slow) return <Pill color={colors.blue} icon="cloud-sync-outline" pulse text="Connecting… showing your last data" />;
  return null;
}
