import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { MARKETS } from '@/lib/catalog';
import { money, pnlColor } from '@/lib/format';
import { useDeleteEntry, useSaveEntry } from '@/lib/queries';
import type { HabitToday, HabitTracker, SpendingToday, SpendingTracker, TradingToday, TradingTracker } from '@/lib/types';
import { colors } from '@/theme';
import { Button, Card, haptic, Icon, ProgressBar, Row, Stat, TrackerIcon, Txt } from './ui';

const go = (id: string) => () => router.push(`/tracker/${id}`);

function Pill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <Row gap={4} style={{ backgroundColor: color + '1F', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }}>
      <Icon name={icon} size={13} color={color} />
      <Txt variant="caption" color={color} style={{ fontWeight: '700', fontSize: 12 }}>{label}</Txt>
    </Row>
  );
}

/* --------------------------------- Trading -------------------------------- */

export function TradingCard({ tracker, today, currency, link = true }: { tracker: TradingTracker; today: TradingToday; currency: string; link?: boolean }) {
  const s = today.status;
  const c = tracker.config;
  const lockedColor = s.lossLimitHit ? colors.red : s.targetHit ? colors.green : colors.amber;
  const market = MARKETS.find((m) => m.key === c.market)?.label ?? 'Trading';
  const hasRange = s.profitTarget > 0 || s.maxLoss > 0;

  return (
    <Card onPress={link ? go(tracker.id) : undefined} accent={s.locked ? lockedColor + '77' : undefined}>
      <Row style={{ justifyContent: 'space-between' }} gap={10}>
        <Row gap={12} style={{ flex: 1 }}>
          <TrackerIcon icon={tracker.icon} color={tracker.color} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3" numberOfLines={1}>{tracker.name}</Txt>
            <Txt variant="caption" numberOfLines={1}>{[market, c.instrument].filter(Boolean).join(' · ')}{s.isTradingDay ? '' : ' · day off'}</Txt>
          </View>
        </Row>
        {s.locked ? <Pill icon="lock" label="Closed" color={lockedColor} /> : null}
      </Row>

      <View style={{ marginTop: 22, gap: 12 }}>
        <Txt variant="hero" color={pnlColor(s.netPnl, colors)}>{money(s.netPnl, currency, { sign: true })}</Txt>
        {hasRange ? (
          <>
            <ProgressBar value={Math.abs(s.progress)} color={s.progress >= 0 ? colors.green : colors.red} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="caption">{s.maxLoss ? `Max loss ${money(-s.maxLoss, currency)}` : ' '}</Txt>
              <Txt variant="caption">{s.profitTarget ? `Target ${money(s.profitTarget, currency)}` : ' '}</Txt>
            </Row>
          </>
        ) : null}
      </View>

      <Row style={{ marginTop: 20 }}>
        <Stat label="Trades" value={`${s.trades}/${s.maxTrades}`} color={s.trades > s.maxTrades ? colors.red : undefined} />
        <Stat label="Clean days" value={String(today.streaks.currentClean)} color={colors.primary} />
        <Stat label="Journal" value={today.journalDone ? 'Done' : '—'} color={today.journalDone ? colors.green : colors.textMuted} />
      </Row>

      <Row gap={10} style={{ marginTop: 20 }}>
        <Button
          title={s.locked ? 'Day closed' : 'Log trade'}
          icon={s.locked ? 'lock' : 'plus'}
          variant={s.locked ? 'secondary' : 'primary'}
          small
          style={{ flex: 1 }}
          onPress={() => router.push(`/tracker/${tracker.id}/trade`)}
        />
        <Button title="Journal" icon="notebook-edit-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => router.push(`/tracker/${tracker.id}/journal`)} />
      </Row>
    </Card>
  );
}

/* -------------------------------- Spending -------------------------------- */

export function SpendingCard({ tracker, today, currency, link = true }: { tracker: SpendingTracker; today: SpendingToday; currency: string; link?: boolean }) {
  const s = today.status;
  const over = s.overDaily || (s.noSpendDay && s.spentToday > 0);
  const dayShare = s.dailyLimit ? s.spentToday / s.dailyLimit : 0;
  const monthShare = s.monthlyLimit ? s.spentMonth / s.monthlyLimit : 0;
  return (
    <Card onPress={link ? go(tracker.id) : undefined} accent={over ? colors.red + '77' : undefined}>
      <Row style={{ justifyContent: 'space-between' }} gap={10}>
        <Row gap={12} style={{ flex: 1 }}>
          <TrackerIcon icon={tracker.icon} color={tracker.color} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3" numberOfLines={1}>{tracker.name}</Txt>
            <Txt variant="caption">{s.noSpendDay ? 'No-spend day' : today.streak > 0 ? `${today.streak} days within budget` : 'Spending'}</Txt>
          </View>
        </Row>
        {over ? <Pill icon="alert" label="Over" color={colors.red} /> : null}
      </Row>

      <View style={{ marginTop: 22, gap: 6 }}>
        <Txt variant="label">Spent today</Txt>
        <Txt variant="hero" color={over ? colors.red : colors.text}>{money(s.spentToday, currency)}</Txt>
        {s.leftToday !== null ? (
          <Txt variant="caption" color={s.leftToday < 0 ? colors.red : colors.textMuted}>
            {s.leftToday >= 0 ? `${money(s.leftToday, currency)} left of ${money(s.dailyLimit, currency)}` : `${money(-s.leftToday, currency)} over your daily limit`}
          </Txt>
        ) : null}
      </View>
      {s.dailyLimit ? (
        <View style={{ marginTop: 14 }}>
          <ProgressBar value={dayShare} color={dayShare > 1 ? colors.red : dayShare > 0.8 ? colors.amber : tracker.color} />
        </View>
      ) : null}
      {s.monthlyLimit ? (
        <View style={{ marginTop: 18, gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption">This month</Txt>
            <Txt variant="caption" color={monthShare > 1 ? colors.red : colors.text}>{money(s.spentMonth, currency)} / {money(s.monthlyLimit, currency)}</Txt>
          </Row>
          <ProgressBar value={monthShare} height={6} color={monthShare > 1 ? colors.red : monthShare > 0.8 ? colors.amber : colors.blue} />
        </View>
      ) : null}

      <Button title="Add expense" icon="plus" small style={{ marginTop: 20 }} onPress={() => router.push(`/tracker/${tracker.id}/expense`)} />
    </Card>
  );
}

/* ---------------------------------- Habit --------------------------------- */

export function HabitCard({ tracker, today, date, link = true }: { tracker: HabitTracker; today: HabitToday; date: string; link?: boolean }) {
  const save = useSaveEntry(tracker.id);
  const undo = useDeleteEntry(tracker.id);
  const c = tracker.config;
  const done = today.completedToday;
  const measured = c.kind === 'limit' || (c.kind === 'build' && c.goalType !== 'boolean');
  const step = c.goalType === 'duration' ? 5 : 1;

  const toggle = () => {
    if (done) {
      haptic.tap();
      undo.mutate(date);
    } else {
      haptic.success();
      save.mutate({ date, completed: true });
    }
  };
  const bump = (delta: number) => {
    const next = Math.max(0, today.valueToday + delta);
    if (c.kind === 'limit' && next > c.target && today.valueToday <= c.target) haptic.warning();
    else if (c.kind === 'build' && next >= c.target && today.valueToday < c.target) haptic.success();
    else haptic.tap();
    save.mutate({ date, value: next });
  };

  const status =
    c.kind === 'limit'
      ? today.overLimit
        ? { text: `${today.valueToday}/${c.target} ${c.unit} · over limit`, color: colors.red }
        : { text: `${today.valueToday}/${c.target} ${c.unit} max`, color: colors.textMuted }
      : measured
        ? { text: `${today.valueToday}/${c.target} ${c.unit}`, color: done ? colors.green : colors.textMuted }
        : !today.scheduledToday
          ? { text: 'Rest day', color: colors.textMuted }
          : null;

  const barColor = c.kind === 'limit' ? (today.overLimit ? colors.red : today.valueToday / c.target > 0.8 ? colors.amber : colors.green) : tracker.color;

  return (
    <Card onPress={link ? go(tracker.id) : undefined} style={{ opacity: today.scheduledToday ? 1 : 0.55 }}>
      <Row gap={14}>
        <TrackerIcon icon={tracker.icon} color={tracker.color} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="h3" numberOfLines={1}>{tracker.name}</Txt>
          <Row gap={10} style={{ flexWrap: 'wrap' }}>
            <Row gap={3}>
              <Icon name="fire" size={14} color={today.currentStreak > 0 ? colors.amber : colors.textDim} />
              <Txt variant="caption" color={today.currentStreak > 0 ? colors.amber : undefined}>
                {today.currentStreak} {c.kind === 'quit' ? 'clean days' : 'day streak'}
              </Txt>
            </Row>
            {status ? <Txt variant="caption" color={status.color}>{status.text}</Txt> : null}
          </Row>
        </View>
        {measured ? (
          <Row gap={8}>
            <Pressable onPress={() => bump(-step)} hitSlop={8} style={roundBtn}>
              <Icon name="minus" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => bump(step)} hitSlop={8} style={[roundBtn, c.kind === 'build' && done && { backgroundColor: tracker.color, borderColor: tracker.color }]}>
              <Icon name={c.kind === 'build' && done ? 'check' : 'plus'} size={20} color={colors.text} />
            </Pressable>
          </Row>
        ) : (
          <Pressable
            onPress={toggle}
            hitSlop={8}
            style={[roundBtn, { width: 50, height: 50, borderRadius: 17 }, done && { backgroundColor: tracker.color, borderColor: tracker.color }]}>
            <Icon name={done ? 'check-bold' : c.kind === 'quit' ? 'shield-outline' : 'check'} size={24} color={done ? colors.text : colors.textDim} />
          </Pressable>
        )}
      </Row>
      {measured ? (
        <View style={{ marginTop: 16 }}>
          <ProgressBar value={today.valueToday / c.target} color={barColor} height={6} />
        </View>
      ) : null}
    </Card>
  );
}

const roundBtn = {
  width: 42,
  height: 42,
  borderRadius: 14,
  backgroundColor: colors.surfaceHigh,
  borderWidth: 1,
  borderColor: colors.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
