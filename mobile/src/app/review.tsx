import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { ShareButton } from '@/components/share';
import { Button, Card, CountUp, EmptyState, ErrorView, Gradient, haptic, Icon, Input, Loading, ProgressBar, Row, Screen, SectionTitle, TrackerIcon, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, localToday, money, shortDate } from '@/lib/format';
import { useSaveReview, useWeeklyReview } from '@/lib/queries';
import type { WeeklyReview } from '@/lib/types';
import { colors, gradients } from '@/theme';

/** One tracker's line in the review. */
function ItemRow({ item, currency }: { item: WeeklyReview['items'][number]; currency: string }) {
  let detail = '';
  let progress: number | null = null;
  if (item.type === 'habit') {
    detail = item.planned ? `${item.done} of ${item.planned} days` : 'Not scheduled';
    progress = item.planned ? (item.done ?? 0) / item.planned : null;
  } else if (item.type === 'trading') {
    detail = item.tradingDays
      ? `${item.cleanDays}/${item.tradingDays} clean days · ${money(item.net ?? 0, currency, { sign: true })}`
      : 'No trades';
    progress = item.tradingDays ? (item.cleanDays ?? 0) / item.tradingDays : null;
  } else {
    detail = `${money(item.spent ?? 0, currency)} spent${item.daysOverBudget ? ` · ${item.daysOverBudget} day${item.daysOverBudget === 1 ? '' : 's'} over budget` : ''}`;
  }
  return (
    <View style={{ gap: 8 }}>
      <Row gap={10}>
        <TrackerIcon icon={item.icon} color={item.color} size={32} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '600' }} numberOfLines={1}>{item.name}</Txt>
          <Txt variant="caption" style={{ fontSize: 13 }}>{detail}</Txt>
        </View>
      </Row>
      {progress !== null ? <ProgressBar value={progress} color={progress >= 0.8 ? colors.green : progress >= 0.5 ? colors.amber : colors.red} height={6} /> : null}
    </View>
  );
}

/** Sunday weekly review: how the week went + three questions. */
export default function Review() {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, isLoading, error, refetch } = useWeeklyReview(week);
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const save = useSaveReview();
  // Answers being typed (start from what was saved for the week on screen)
  const [draft, setDraft] = useState<{ week: string; wentWell: string; hard: string; nextFocus: string } | null>(null);
  const [saved, setSaved] = useState(false);

  if (isLoading) return <Loading variant="detail" />;
  if (error || !data) return <Screen edges={['bottom']}><ErrorView error={error} onRetry={refetch} /></Screen>;

  const answers = draft?.week === data.weekStart ? draft : { week: data.weekStart, wentWell: data.answers.wentWell ?? '', hard: data.answers.hard ?? '', nextFocus: data.answers.nextFocus ?? '' };
  const set = (patch: Partial<typeof answers>) => {
    setSaved(false);
    setDraft({ ...answers, ...patch });
  };
  const rate = data.habits.rate;
  const prev = data.habits.previousRate;
  const diff = rate !== null && prev !== null ? rate - prev : null;
  const canGoNext = addDays(data.weekStart, 7) <= localToday();
  const goWeek = (n: number) => {
    setSaved(false);
    setWeek(addDays(data.weekStart, n * 7));
  };

  const submit = () =>
    save.mutate(
      { weekStart: data.weekStart, wentWell: answers.wentWell.trim() || undefined, hard: answers.hard.trim() || undefined, nextFocus: answers.nextFocus.trim() || undefined },
      {
        onSuccess: () => {
          haptic.success();
          setSaved(true);
        },
      },
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']} contentStyle={{ gap: 14, paddingTop: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => goWeek(-1)} hitSlop={10} accessibilityLabel="Previous week">
            <Icon name="chevron-left" size={26} color={colors.textMuted} />
          </Pressable>
          <Txt variant="h3">
            {shortDate(data.weekStart)} – {shortDate(data.weekEnd)}
            {data.complete ? '' : ' (so far)'}
          </Txt>
          <Pressable onPress={() => canGoNext && goWeek(1)} hitSlop={10} disabled={!canGoNext} accessibilityLabel="Next week">
            <Icon name="chevron-right" size={26} color={canGoNext ? colors.textMuted : colors.surfaceHigh} />
          </Pressable>
        </Row>

        {data.items.length === 0 ? (
          <EmptyState icon="calendar-blank-outline" title="Nothing to review for this week" message="Trackers created after this week aren’t counted." />
        ) : (
          <>
            <Gradient colors={rate !== null && rate >= 70 ? gradients.green : gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen style={{ borderRadius: 28, padding: 22, alignItems: 'center', gap: 6 }}>
              <Txt variant="label">Habits kept</Txt>
              {rate !== null ? <CountUp value={rate} format={(n) => `${Math.round(n)}%`} variant="hero" /> : <Txt variant="hero">—</Txt>}
              {diff !== null ? (
                <Txt>{diff === 0 ? 'Same as the week before' : diff > 0 ? `▲ ${diff} points better than the week before` : `▼ ${-diff} points below the week before`}</Txt>
              ) : null}
              <Row gap={16} style={{ marginTop: 8 }}>
                <Txt>🌳 {data.forest.grown} tree{data.forest.grown === 1 ? '' : 's'}</Txt>
                {data.forest.withered ? <Txt>🍂 {data.forest.withered}</Txt> : null}
                {data.bestDay ? <Txt>⭐ Best: {data.bestDay.day}</Txt> : null}
              </Row>
            </Gradient>
            {rate !== null ? (
              <View style={{ alignItems: 'flex-start' }}>
                <ShareButton
                  label="Share my week"
                  card={{ emoji: rate >= 80 ? '🏆' : rate >= 50 ? '💪' : '🌱', title: `${rate}% of my habits kept`, stat: `🌳 ${data.forest.grown} trees grown this week`, colors: gradients.green }}
                />
              </View>
            ) : null}

            <SectionTitle>Tracker by tracker</SectionTitle>
            <Card style={{ gap: 16 }}>
              {data.items.map((item) => <ItemRow key={item.trackerId} item={item} currency={currency} />)}
            </Card>
          </>
        )}

        <SectionTitle>Look back, then forward</SectionTitle>
        <Input label="What went well?" value={answers.wentWell} onChangeText={(t) => set({ wentWell: t })} multiline maxLength={1000} placeholder="Something you’re proud of this week" />
        <Input label="What was hard?" value={answers.hard} onChangeText={(t) => set({ hard: t })} multiline maxLength={1000} placeholder="Where did you slip, and why?" />
        <Input label="One focus for next week" value={answers.nextFocus} onChangeText={(t) => set({ nextFocus: t })} maxLength={1000} placeholder="e.g. In bed by 11 every night" />
        {save.error ? <Txt variant="caption" color={colors.red}>{save.error.message}</Txt> : null}
        <Button
          title={saved ? 'Saved ✓' : 'Save my review'}
          icon="content-save-outline"
          loading={save.isPending}
          disabled={!answers.wentWell.trim() && !answers.hard.trim() && !answers.nextFocus.trim()}
          onPress={submit}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
