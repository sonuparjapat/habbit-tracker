import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { addDays, money, shortDate, weekdayOf } from '@/lib/format';
import { colors } from '@/theme';
import { Row, Txt } from './ui';

function useWidth(initial = 300) {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  return { width, onLayout };
}

/* ------------------------------ Equity curve ------------------------------ */

export function EquityChart({
  points,
  height = 180,
  currency,
}: {
  points: { date: string; actual: number; disciplined: number }[];
  height?: number;
  currency: string;
}) {
  const { width, onLayout } = useWidth();
  if (points.length === 0) return null;

  const series = [{ date: '', actual: 0, disciplined: 0 }, ...points];
  const all = series.flatMap((p) => [p.actual, p.disciplined]);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const span = max - min || 1;
  const pad = 8;
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const path = (key: 'actual' | 'disciplined') =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const actualPath = path('actual');
  const area = `${actualPath} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = series[series.length - 1]!;
  const lineColor = last.actual >= 0 ? colors.green : colors.red;

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity={0.35} />
            <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.border} strokeDasharray="4 4" />
        <Path d={area} fill="url(#eq)" />
        <Path d={path('disciplined')} stroke={colors.primary} strokeWidth={2} strokeDasharray="6 4" fill="none" />
        <Path d={actualPath} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
      </Svg>
      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Row gap={6}>
          <View style={{ width: 14, height: 3, backgroundColor: lineColor, borderRadius: 2 }} />
          <Txt variant="caption">Actual {money(last.actual, currency, { sign: true })}</Txt>
        </Row>
        <Row gap={6}>
          <View style={{ width: 14, height: 3, backgroundColor: colors.primary, borderRadius: 2 }} />
          <Txt variant="caption">Rules only {money(last.disciplined, currency, { sign: true })}</Txt>
        </Row>
      </Row>
    </View>
  );
}

/* -------------------------------- P&L bars -------------------------------- */

export function PnlBars({
  data,
  height = 140,
}: {
  data: { label: string; value: number; flagged?: boolean }[];
  height?: number;
}) {
  const { width, onLayout } = useWidth();
  if (data.length === 0) return null;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNeg = data.some((d) => d.value < 0);
  const hasPos = data.some((d) => d.value > 0);
  const zeroY = hasNeg && hasPos ? height / 2 : hasNeg ? 4 : height - 4;
  const scale = (hasNeg && hasPos ? height / 2 - 6 : height - 10) / maxAbs;
  const gap = data.length > 40 ? 1 : 3;
  const bw = Math.max(2, (width - gap * (data.length - 1)) / data.length);

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={colors.border} />
        {data.map((d, i) => {
          const h = Math.max(2, Math.abs(d.value) * scale);
          const yPos = d.value >= 0 ? zeroY - h : zeroY;
          return (
            <Rect
              key={i}
              x={i * (bw + gap)}
              y={yPos}
              width={bw}
              height={h}
              rx={Math.min(3, bw / 2)}
              fill={d.value >= 0 ? colors.green : colors.red}
              opacity={d.flagged ? 0.5 : 0.95}
              stroke={d.flagged ? colors.amber : undefined}
              strokeWidth={d.flagged ? 1.5 : 0}
            />
          );
        })}
      </Svg>
    </View>
  );
}

/* --------------------------- Horizontal bar list -------------------------- */

export function BarList({ items, color = colors.primary }: { items: { label: string; value: number; display: string; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <View style={{ gap: 12 }}>
      {items.map((it) => (
        <View key={it.label} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" color={colors.text}>{it.label}</Txt>
            <Txt variant="caption" color={it.color ?? colors.text} style={{ fontWeight: '700' }}>{it.display}</Txt>
          </Row>
          <View style={{ height: 8, backgroundColor: colors.surfaceHigh, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ width: `${(Math.abs(it.value) / max) * 100}%`, height: '100%', backgroundColor: it.color ?? color, borderRadius: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------------------------- Calendar heatmap ---------------------------- */

export interface CalendarCell {
  color?: string;
  dot?: string;
  text?: string;
}

/** Calendar grid (Mon–Sun columns, one row per week). */
export function CalendarGrid({
  from,
  to,
  cell,
}: {
  from: string;
  to: string;
  cell: (date: string) => CalendarCell | null;
}) {
  const { width, onLayout } = useWidth();
  const start = addDays(from, -((weekdayOf(from) + 6) % 7));
  const weeks: string[][] = [];
  for (let d = start; d <= to; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const gap = 5;
  const size = Math.floor((width - gap * 6) / 7);

  return (
    <View onLayout={onLayout} style={{ gap }}>
      <Row gap={gap}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
          <Txt key={i} variant="caption" center style={{ width: size, fontSize: 11 }}>{l}</Txt>
        ))}
      </Row>
      {weeks.map((week) => (
        <Row gap={gap} key={week[0]}>
          {week.map((d) => {
            const inRange = d >= from && d <= to;
            const c = inRange ? cell(d) : null;
            return (
              <View
                key={d}
                style={{
                  width: size,
                  height: Math.min(size, 44),
                  borderRadius: 8,
                  backgroundColor: !inRange ? 'transparent' : c?.color ?? colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {inRange ? (
                  <Txt variant="caption" style={{ fontSize: 10, color: c?.color ? colors.text : colors.textDim }}>
                    {c?.text ?? String(Number(d.slice(8)))}
                  </Txt>
                ) : null}
                {c?.dot ? (
                  <View style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
                ) : null}
              </View>
            );
          })}
        </Row>
      ))}
    </View>
  );
}

export function pnlCellColor(pnl: number, maxAbs: number) {
  if (pnl === 0) return colors.surfaceHigh;
  const t = Math.min(1, Math.abs(pnl) / Math.max(1, maxAbs));
  const alpha = Math.round((0.25 + 0.75 * t) * 255).toString(16).padStart(2, '0');
  return (pnl > 0 ? colors.green : colors.red) + alpha;
}

export { shortDate };
