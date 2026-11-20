import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, View } from 'react-native';
import { HabitCard, SpendingCard, TradingCard } from '@/components/cards';
import { Report } from '@/components/Report';
import { AlertCard, Button, Card, ErrorView, Icon, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { money, pnlColor, shortDate, WEEKDAY_LETTERS } from '@/lib/format';
import { useDeleteExpense, useDeleteTrade, useExpenses, useTracker, useTrackerToday, useTrades } from '@/lib/queries';
import {
  emotionOf,
  type Expense,
  type HabitToday,
  type SpendingToday,
  type SpendingTracker,
  type Trade,
  type TradingToday,
  type TradingTracker,
} from '@/lib/types';
import { colors } from '@/theme';
import { t } from '@/lib/i18n';

function confirmDelete(title: string, msg: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(t(msg))) onYes();
  } else
    Alert.alert(t(title), t(msg), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: onYes },
    ]);
}

function SpendingDetail({ tracker, today, currency }: { tracker: SpendingTracker; today?: SpendingToday; currency: string }) {
  const { data: expenses } = useExpenses(tracker.id, '90d');
  const del = useDeleteExpense();
  const remove = (e: Expense) =>
    confirmDelete('Delete expense?', `Delete ${money(e.amount, currency)} (${e.category}) from ${shortDate(e.spentOn)}?`, () => del.mutate(e.id));

  return (
    <View>
      {today?.alerts.length ? (
        <View style={{ gap: 10, marginTop: 16 }}>
          {today.alerts.map((a, i) => (
            <AlertCard key={i} alert={a} />
          ))}
        </View>
      ) : null}
      {tracker.config.why ? (
        <Card style={{ marginTop: 16 }}>
          <Txt variant="label">Why</Txt>
          <Txt style={{ marginTop: 6, fontStyle: 'italic' }}>“{tracker.config.why}”</Txt>
        </Card>
      ) : null}

      <SectionTitle>Report</SectionTitle>
      <Report tracker={tracker} currency={currency} />

      <SectionTitle>Recent expenses</SectionTitle>
      {expenses?.length === 0 ? <Txt variant="caption">Nothing logged in the last 90 days.</Txt> : null}
      <View style={{ gap: 8 }}>
        {expenses?.slice(0, 60).map((e) => (
          <Pressable key={e.id} onLongPress={() => remove(e)}>
            <Card padded={false} style={{ padding: 16 }} accent={e.isRuleBreak ? colors.red + '55' : undefined}>
              <Row style={{ justifyContent: 'space-between' }} gap={12}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="h3">{e.category}</Txt>
                  <Txt variant="caption" numberOfLines={1}>
                    {shortDate(e.spentOn)}
                    {e.note ? ` · ${e.note}` : ''}
                    {e.isRuleBreak ? ` · ⚠️ ${e.breaks.map((b) => b.label).join(', ')}` : ''}
                  </Txt>
                </View>
                <Txt variant="mono">{money(e.amount, currency)}</Txt>
              </Row>
            </Card>
          </Pressable>
        ))}
      </View>
      {expenses?.length ? <Txt variant="caption" center style={{ marginTop: 12 }}>Long-press an expense to delete it</Txt> : null}
    </View>
  );
}

export default function TrackerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker, isLoading, error, refetch } = useTracker(id);
  const today = useTrackerToday<TradingToday | HabitToday | SpendingToday>(id);
  const currency = useAuth((s) => s.user?.currency ?? 'USD');

  if (isLoading) return <Loading variant="detail" />;
  if (error || !tracker) return <Screen><ErrorView error={error} onRetry={refetch} /></Screen>;

  return (
    <Screen edges={['bottom']} onRefresh={() => { void refetch(); void today.refetch(); }} refreshing={today.isRefetching}>
      <Stack.Screen
        options={{
          title: tracker.name,
          headerRight: () => (
            <Pressable onPress={() => router.push(`/tracker/${id}/edit`)} hitSlop={12}>
              <Icon name="cog-outline" size={22} />
            </Pressable>
          ),
        }}
      />
      {today.data ? (
        tracker.type === 'trading' ? (
          <TradingCard tracker={tracker} today={today.data as TradingToday} currency={currency} link={false} />
        ) : tracker.type === 'spending' ? (
          <SpendingCard tracker={tracker} today={today.data as SpendingToday} currency={currency} link={false} />
        ) : (
          <HabitCard tracker={tracker} today={today.data as HabitToday} date={(today.data as HabitToday).date} link={false} />
        )
      ) : null}

      {tracker.type === 'trading' ? (
        <TradingDetail tracker={tracker} today={today.data as TradingToday | undefined} currency={currency} />
      ) : tracker.type === 'spending' ? (
        <SpendingDetail tracker={tracker} today={today.data as SpendingToday | undefined} currency={currency} />
      ) : (
        <View style={{ marginTop: 20 }}>
          {tracker.config.why ? (
            <Card style={{ marginBottom: 16 }}>
              <Txt variant="label">Why</Txt>
              <Txt style={{ marginTop: 6, fontStyle: 'italic' }}>“{tracker.config.why}”</Txt>
            </Card>
          ) : null}
          <Report tracker={tracker} currency={currency} />
        </View>
      )}
    </Screen>
  );
}

function TradingDetail({ tracker, today, currency }: { tracker: TradingTracker; today?: TradingToday; currency: string }) {
  const c = tracker.config;
  const { data: trades } = useTrades(tracker.id, '90d');
  const del = useDeleteTrade();

  const removeTrade = (t: Trade) =>
    confirmDelete(
      'Delete trade?',
      `Delete this ${money(t.net, currency, { sign: true })} trade from ${shortDate(t.tradeDate)}? Rule breaks for that day are recalculated.`,
      () => del.mutate(t.id),
    );

  return (
    <View>
      {today?.alerts.length ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          {today.alerts.map((a, i) => (
            <AlertCard key={i} alert={a} />
          ))}
        </View>
      ) : null}

      {today ? (
        <Row gap={10} style={{ marginTop: 14 }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="hero" color={colors.primary} style={{ fontSize: 30 }}>{today.streaks.currentClean}</Txt>
            <Txt variant="caption" center>clean days</Txt>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="hero" style={{ fontSize: 30 }}>{today.streaks.bestClean}</Txt>
            <Txt variant="caption" center>best streak</Txt>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="hero" color={today.breaksLast7Days ? colors.red : colors.green} style={{ fontSize: 30 }}>{today.breaksLast7Days}</Txt>
            <Txt variant="caption" center>breaks (7d)</Txt>
          </Card>
        </Row>
      ) : null}

      <Row gap={10} style={{ marginTop: 14 }}>
        <Button title="Full report" icon="chart-box-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => router.push(`/tracker/${tracker.id}/report`)} />
        <Button title="Rule breaks" icon="alert-octagon-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => router.push(`/tracker/${tracker.id}/breaks`)} />
      </Row>

      <SectionTitle action="Edit" onAction={() => router.push(`/tracker/${tracker.id}/edit`)}>Your rules</SectionTitle>
      <Card style={{ gap: 10 }}>
        <RuleLine icon="numeric-1-circle" text={`Max ${c.maxTradesPerDay} trade${c.maxTradesPerDay > 1 ? 's' : ''} per day`} />
        {c.dailyProfitTarget ? <RuleLine icon="flag-checkered" text={`Target ${money(c.dailyProfitTarget, currency)}${c.stopAfterTarget ? ' — then stop' : ''}`} /> : null}
        {c.dailyMaxLoss ? <RuleLine icon="hand-back-left" text={`Max daily loss ${money(c.dailyMaxLoss, currency)}`} /> : null}
        <RuleLine icon="calendar-week" text={`Trading days: ${c.tradingDays.map((d) => WEEKDAY_LETTERS[d]).join(' ')}`} />
        {c.customRules.map((r) => (
          <RuleLine key={r} icon="check-decagram" text={r} />
        ))}
      </Card>

      <SectionTitle>Recent trades</SectionTitle>
      {trades?.length === 0 ? <Txt variant="caption">No trades in the last 90 days.</Txt> : null}
      <View style={{ gap: 8 }}>
        {trades?.slice(0, 50).map((t) => {
          const emo = emotionOf(t.emotionBefore);
          return (
            <Pressable key={t.id} onLongPress={() => removeTrade(t)}>
              <Card padded={false} style={{ padding: 14 }} accent={t.isRuleBreak ? colors.red + '66' : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ gap: 2, flex: 1 }}>
                    <Txt variant="h3">
                      {shortDate(t.tradeDate)} {t.direction ? (t.direction === 'long' ? '· Long' : '· Short') : ''} {emo ? emo.emoji : ''}
                    </Txt>
                    <Txt variant="caption" numberOfLines={1}>
                      {t.setup || t.instrument}
                      {t.isRuleBreak ? ` · ⚠️ ${t.breaks.map((b) => b.label ?? b.rule).join(', ')}` : ''}
                    </Txt>
                  </View>
                  <Txt variant="mono" color={pnlColor(t.net, colors)}>{money(t.net, currency, { sign: true })}</Txt>
                </Row>
              </Card>
            </Pressable>
          );
        })}
      </View>
      {trades?.length ? <Txt variant="caption" center style={{ marginTop: 10 }}>Long-press a trade to delete it</Txt> : null}
    </View>
  );
}

function RuleLine({ icon, text }: { icon: string; text: string }) {
  return (
    <Row gap={10}>
      <Icon name={icon} size={18} color={colors.primary} />
      <Txt style={{ flex: 1 }}>{text}</Txt>
    </Row>
  );
}
