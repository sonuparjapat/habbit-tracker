import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { money, pnlColor, shortDate } from '@/lib/format';
import { useStats, type Period } from '@/lib/queries';
import { emotionOf, type HabitStats, type Tracker, type TradingStats } from '@/lib/types';
import { colors } from '@/theme';
import { BarList, CalendarGrid, EquityChart, PnlBars, pnlCellColor } from './charts';
import { AlertCard, Card, ErrorView, Loading, Ring, Row, scoreColor, SectionTitle, Segmented, Stat, Txt } from './ui';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '90d', label: '90D' },
  { value: 'year', label: 'Year' },
];

export function Report({ tracker, currency }: { tracker: Tracker; currency: string }) {
  const [period, setPeriod] = useState<Period>('month');
  return (
    <View>
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      <View style={{ marginTop: 16 }}>
        {tracker.type === 'trading' ? (
          <TradingReport trackerId={tracker.id} period={period} currency={currency} />
        ) : (
          <HabitReport tracker={tracker} period={period} />
        )}
      </View>
    </View>
  );
}

function TradingReport({ trackerId, period, currency }: { trackerId: string; period: Period; currency: string }) {
  const { data, isLoading, error, refetch } = useStats<TradingStats>(trackerId, period);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView error={error} onRetry={refetch} />;
  const s = data.summary;
  const d = data.discipline;
  const m = (n: number, sign = false) => money(n, currency, { sign });
  const dailyMap = new Map(data.daily.map((x) => [x.date, x]));
  const maxAbs = Math.max(1, ...data.daily.map((x) => Math.abs(x.pnl)));

  return (
    <View>
      {/* Headline */}
      <Card>
        <Row gap={16}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label">Net P&L</Txt>
            <Txt variant="hero" color={pnlColor(s.netPnl, colors)} style={{ fontSize: 34 }}>{m(s.netPnl, true)}</Txt>
            <Txt variant="caption">
              {s.trades} trades · {s.daysTraded} days · {s.greenDays}🟢 {s.redDays}🔴
            </Txt>
          </View>
          <Ring value={(d.score ?? 0) / 100} size={88} stroke={9} color={scoreColor(d.score)}>
            <Txt variant="h3">{d.score ?? '–'}</Txt>
            <Txt variant="caption" style={{ fontSize: 10 }}>discipline</Txt>
          </Ring>
        </Row>
        <Row style={{ marginTop: 18 }}>
          <Stat label="Win rate" value={`${s.winRate}%`} />
          <Stat label="Profit factor" value={s.profitFactor === null ? '∞' : String(s.profitFactor)} />
          <Stat label="Max DD" value={m(-s.maxDrawdown)} color={s.maxDrawdown ? colors.red : undefined} />
        </Row>
        <Row style={{ marginTop: 14 }}>
          <Stat label="Avg win" value={m(s.avgWin)} color={colors.green} />
          <Stat label="Avg loss" value={m(-s.avgLoss)} color={colors.red} />
          <Stat label="Trades/day" value={String(s.avgTradesPerDay)} />
        </Row>
      </Card>

      {/* Insights */}
      {data.insights.length ? <SectionTitle>What your data says</SectionTitle> : null}
      <View style={{ gap: 10 }}>
        {data.insights.map((i, idx) => (
          <AlertCard key={idx} alert={i} />
        ))}
      </View>

      {/* Discipline vs actual */}
      {data.daily.length ? (
        <>
          <SectionTitle>The cost of breaking rules</SectionTitle>
          <Card>
            <Txt variant="caption" style={{ marginBottom: 12 }}>
              Your real equity vs. what you would have made taking only the trades within your rules.
            </Txt>
            <EquityChart
              currency={currency}
              points={data.daily.map((x) => ({ date: x.date, actual: x.cumulative, disciplined: x.disciplinedCumulative }))}
            />
            <Row style={{ marginTop: 16 }}>
              <Stat label="Within rules" value={m(d.disciplinedPnl, true)} color={pnlColor(d.disciplinedPnl, colors)} />
              <Stat label="Rule breaks" value={m(d.undisciplinedPnl, true)} color={pnlColor(d.undisciplinedPnl, colors)} />
              <Stat label="Clean days" value={`${d.cleanDays}/${d.activeDays}`} />
            </Row>
          </Card>

          <SectionTitle>Daily P&L</SectionTitle>
          <Card>
            <PnlBars data={data.daily.map((x) => ({ label: x.date, value: x.pnl, flagged: x.breaks > 0 }))} />
            <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <Txt variant="caption">{shortDate(data.range.from)}</Txt>
              <Txt variant="caption">Outlined = rule broken</Txt>
              <Txt variant="caption">{shortDate(data.range.to)}</Txt>
            </Row>
          </Card>

          {period !== 'year' ? (
            <>
              <SectionTitle>Calendar</SectionTitle>
              <Card>
                <CalendarGrid
                  from={data.range.from}
                  to={data.range.to}
                  cell={(date) => {
                    const x = dailyMap.get(date);
                    if (!x) return null;
                    return { color: pnlCellColor(x.pnl, maxAbs), dot: x.breaks ? colors.amber : undefined };
                  }}
                />
                <Txt variant="caption" style={{ marginTop: 10 }}>🟡 dot = a rule was broken that day</Txt>
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {d.breakdown.length ? (
        <>
          <SectionTitle action="See all" onAction={() => router.push(`/tracker/${trackerId}/breaks`)}>
            Rules you break most
          </SectionTitle>
          <Card>
            <BarList
              color={colors.red}
              items={d.breakdown.map((b) => ({ label: b.label, value: b.count, display: `${b.count}×` }))}
            />
          </Card>
        </>
      ) : null}

      {data.byEmotion.length ? (
        <>
          <SectionTitle>P&L by emotion</SectionTitle>
          <Card>
            <BarList
              items={data.byEmotion.map((e) => {
                const em = emotionOf(e.emotion);
                return {
                  label: `${em?.emoji ?? '❔'} ${em?.label ?? 'Not tagged'} · ${e.trades} trades · ${e.winRate}% win`,
                  value: e.pnl,
                  display: m(e.pnl, true),
                  color: pnlColor(e.pnl, colors),
                };
              })}
            />
          </Card>
        </>
      ) : null}

      {s.trades ? (
        <>
          <SectionTitle>By weekday</SectionTitle>
          <Card>
            <BarList
              items={data.byWeekday
                .filter((w) => w.trades > 0)
                .map((w) => ({ label: `${w.weekday} · ${w.trades} trades`, value: w.pnl, display: m(w.pnl, true), color: pnlColor(w.pnl, colors) }))}
            />
            {s.bestDay && s.worstDay ? (
              <Row style={{ marginTop: 16 }}>
                <Stat label="Best day" value={m(s.bestDay.pnl, true)} color={colors.green} sub={shortDate(s.bestDay.date)} />
                <Stat label="Worst day" value={m(s.worstDay.pnl, true)} color={colors.red} sub={shortDate(s.worstDay.date)} />
                <Stat label="Target days" value={String(s.targetHitDays)} />
              </Row>
            ) : null}
          </Card>
        </>
      ) : null}
    </View>
  );
}

function HabitReport({ tracker, period }: { tracker: Tracker; period: Period }) {
  const { data, isLoading, error, refetch } = useStats<HabitStats>(tracker.id, period);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView error={error} onRetry={refetch} />;
  const series = new Map(data.series.map((x) => [x.date, x]));
  const rate = data.completionRate;

  return (
    <View>
      <Card>
        <Row gap={16}>
          <Ring value={(rate ?? 0) / 100} size={96} stroke={10} color={tracker.color}>
            <Txt variant="h2">{rate === null ? '–' : `${rate}%`}</Txt>
          </Ring>
          <View style={{ flex: 1, gap: 12 }}>
            <Row>
              <Stat label="Current streak" value={`🔥 ${data.currentStreak}`} />
              <Stat label="Best streak" value={`${data.bestStreak}`} />
            </Row>
            <Row>
              <Stat label="Done" value={`${data.completedDays}/${data.scheduledDays}`} />
              {tracker.type === 'habit' && tracker.config.goalType !== 'boolean' ? (
                <Stat label={`Total ${tracker.config.unit}`} value={String(data.totalValue)} />
              ) : (
                <Stat label="Avg mood" value={data.avgMood ? `${data.avgMood}/5` : '–'} />
              )}
            </Row>
          </View>
        </Row>
      </Card>

      {data.series.length && period !== 'year' ? (
        <>
          <SectionTitle>Calendar</SectionTitle>
          <Card>
            <CalendarGrid
              from={data.range.from}
              to={data.range.to}
              cell={(date) => {
                const x = series.get(date);
                if (!x) return null;
                if (x.completed) return { color: tracker.color };
                if (!x.scheduled) return { color: 'transparent' };
                return null;
              }}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>Consistency by weekday</SectionTitle>
      <Card>
        <BarList
          color={tracker.color}
          items={data.byWeekday
            .filter((w) => w.rate !== null)
            .map((w) => ({ label: w.weekday!, value: w.rate ?? 0, display: `${w.rate}%` }))}
        />
      </Card>
    </View>
  );
}
