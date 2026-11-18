import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { money, pnlColor } from '@/lib/format';
import { useSaveEntry } from '@/lib/queries';
import type { HabitToday, HabitTracker, TradingToday, TradingTracker } from '@/lib/types';
import { colors } from '@/theme';
import { Button, Card, haptic, Icon, ProgressBar, Row, Stat, TrackerIcon, Txt } from './ui';

export function TradingCard({
  tracker,
  today,
  currency,
  link = true,
}: {
  tracker: TradingTracker;
  today: TradingToday;
  currency: string;
  link?: boolean;
}) {
  const s = today.status;
  const lockedColor = s.lossLimitHit ? colors.red : s.targetHit ? colors.green : colors.amber;
  return (
    <Card onPress={link ? () => router.push(`/tracker/${tracker.id}`) : undefined} accent={s.locked ? lockedColor + '88' : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={12} style={{ flex: 1 }}>
          <TrackerIcon icon={tracker.icon} color={tracker.color} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3" numberOfLines={1}>{tracker.name}</Txt>
            <Txt variant="caption">{tracker.config.instrument} · {s.isTradingDay ? 'Trading day' : 'Day off'}</Txt>
          </View>
        </Row>
        {s.locked ? (
          <Row gap={4} style={{ backgroundColor: lockedColor + '22', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }}>
            <Icon name="lock" size={14} color={lockedColor} />
            <Txt variant="caption" color={lockedColor} style={{ fontWeight: '700' }}>Closed</Txt>
          </Row>
        ) : null}
      </Row>

      <View style={{ marginTop: 18, gap: 10 }}>
        <Txt variant="label">Today’s P&amp;L</Txt>
        <Txt variant="hero" color={pnlColor(s.netPnl, colors)}>{money(s.netPnl, currency, { sign: true })}</Txt>
        <ProgressBar value={Math.abs(s.progress)} color={s.progress >= 0 ? colors.green : colors.red} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="caption">Max loss {money(-s.maxLoss, currency)}</Txt>
          <Txt variant="caption">Target {money(s.profitTarget, currency)}</Txt>
        </Row>
      </View>

      <Row style={{ marginTop: 18 }}>
        <Stat label="Trades" value={`${s.trades}/${s.maxTrades}`} color={s.trades > s.maxTrades ? colors.red : undefined} />
        <Stat label="Clean streak" value={`${today.streaks.currentClean}d`} color={colors.primary} />
        <Stat label="Journal" value={today.journalDone ? 'Done' : 'Pending'} color={today.journalDone ? colors.green : colors.textMuted} />
      </Row>

      <Row gap={10} style={{ marginTop: 18 }}>
        <Button
          title={s.locked ? 'Day closed' : 'Log trade'}
          icon={s.locked ? 'lock' : 'plus'}
          variant={s.locked ? 'secondary' : 'primary'}
          small
          style={{ flex: 1 }}
          onPress={() => router.push(`/tracker/${tracker.id}/trade`)}
        />
        <Button
          title="Journal"
          icon="notebook-edit-outline"
          variant="secondary"
          small
          style={{ flex: 1 }}
          onPress={() => router.push(`/tracker/${tracker.id}/journal`)}
        />
      </Row>
    </Card>
  );
}

export function HabitCard({ tracker, today, date, link = true }: { tracker: HabitTracker; today: HabitToday; date: string; link?: boolean }) {
  const save = useSaveEntry(tracker.id);
  const c = tracker.config;
  const done = today.completedToday;
  const isCount = c.goalType !== 'boolean';
  const step = c.goalType === 'duration' ? 5 : 1;

  const toggle = () => {
    if (done) haptic.tap();
    else haptic.success();
    save.mutate({ date, completed: !done });
  };
  const bump = (delta: number) => {
    const next = Math.max(0, today.valueToday + delta);
    if (next >= c.target && today.valueToday < c.target) haptic.success();
    else haptic.tap();
    save.mutate({ date, value: next });
  };

  return (
    <Card onPress={link ? () => router.push(`/tracker/${tracker.id}`) : undefined} style={{ opacity: today.scheduledToday ? 1 : 0.6 }}>
      <Row gap={12}>
        <TrackerIcon icon={tracker.icon} color={tracker.color} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="h3" numberOfLines={1}>{tracker.name}</Txt>
          <Row gap={10}>
            <Row gap={3}>
              <Icon name="fire" size={14} color={today.currentStreak > 0 ? colors.amber : colors.textDim} />
              <Txt variant="caption" color={today.currentStreak > 0 ? colors.amber : undefined}>{today.currentStreak} day streak</Txt>
            </Row>
            {isCount ? (
              <Txt variant="caption">
                {today.valueToday}/{c.target} {c.unit}
              </Txt>
            ) : !today.scheduledToday ? (
              <Txt variant="caption">Rest day</Txt>
            ) : null}
          </Row>
        </View>
        {isCount ? (
          <Row gap={8}>
            <Pressable onPress={() => bump(-step)} hitSlop={8} style={roundBtn}>
              <Icon name="minus" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => bump(step)} hitSlop={8} style={[roundBtn, done && { backgroundColor: tracker.color }]}>
              <Icon name={done ? 'check' : 'plus'} size={20} color={colors.text} />
            </Pressable>
          </Row>
        ) : (
          <Pressable
            onPress={toggle}
            hitSlop={8}
            style={[
              roundBtn,
              { width: 48, height: 48, borderRadius: 16 },
              done && { backgroundColor: tracker.color, borderColor: tracker.color },
            ]}>
            <Icon name={done ? 'check-bold' : c.kind === 'quit' ? 'shield-outline' : 'check'} size={24} color={done ? colors.text : colors.textDim} />
          </Pressable>
        )}
      </Row>
      {isCount ? (
        <View style={{ marginTop: 14 }}>
          <ProgressBar value={today.valueToday / c.target} color={tracker.color} height={6} />
        </View>
      ) : null}
    </Card>
  );
}

const roundBtn = {
  width: 40,
  height: 40,
  borderRadius: 14,
  backgroundColor: colors.surfaceHigh,
  borderWidth: 1,
  borderColor: colors.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
