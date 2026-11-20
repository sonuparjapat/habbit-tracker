import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { AlertCard, Button, Card, Chip, Gradient, haptic, Icon, Input, Loading, Row, Screen, SectionTitle, Segmented, Stepper, ToggleRow, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAppConfig } from '@/lib/config';
import { addDays, money } from '@/lib/format';
import { useCreateTrade, useToday, useTracker } from '@/lib/queries';
import { EMOTIONS, type DayStatus, type RuleBreak } from '@/lib/types';
import { colors, gradients } from '@/theme';

/**
 * Quick day log — record a whole day in seconds, after the fact:
 * "today: 6 trades, −22,000". Never blocked (it records what already happened), always judged honestly.
 */
export default function QuickLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker } = useTracker(id);
  const today = useToday(id);
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const create = useCreateTrade(id);
  const [side, setSide] = useState<'profit' | 'loss'>('loss');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState(1);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [followedPlan, setFollowedPlan] = useState(true);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [result, setResult] = useState<{ breaks: RuleBreak[]; status: DayStatus; pnl: number } | null>(null);

  if (!tracker || tracker.type !== 'trading') return <Loading variant="form" />;
  const value = Number(amount) || 0;
  const pnl = side === 'loss' ? -Math.abs(value) : Math.abs(value);

  if (result) return <QuickResult result={result} trackerId={id} currency={currency} />;

  const submit = () =>
    create.mutate(
      {
        pnl,
        tradeCount: count,
        quick: true,
        emotionBefore: feeling,
        followedPlan,
        note: note.trim() || null,
        tradeDate: day === 'yesterday' ? addDays(today, -1) : undefined,
      },
      {
        onSuccess: (r) => {
          if (r.breaks.length) haptic.error();
          else haptic.success();
          setResult({ breaks: r.breaks, status: r.status, pnl });
        },
      },
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <Txt variant="caption" style={{ marginBottom: 14 }}>Log the whole day in seconds — even if it already happened. Honesty is what makes the reports useful.</Txt>
        <Segmented
          options={[
            { value: 'loss', label: '▼ Loss' },
            { value: 'profit', label: '▲ Profit' },
          ]}
          value={side}
          onChange={setSide}
        />
        <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 26 }}>
          <Txt variant="label">Total {side} ({currency})</Txt>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textDim}
            autoFocus
            style={{ fontSize: 46, fontWeight: '800', textAlign: 'center', minWidth: 200, marginTop: 6, color: side === 'loss' ? colors.red : colors.green }}
          />
          <Txt variant="caption">after charges</Txt>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Number of trades</Txt>
              <Txt variant="caption">Your plan: {tracker.config.maxTradesPerDay} a day</Txt>
            </View>
            <Stepper value={count} min={1} onChange={(n) => setCount(Math.min(500, n))} />
          </Row>
        </Card>

        <Row gap={8} style={{ marginTop: 14 }}>
          <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
          <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
        </Row>

        <SectionTitle>How did you feel while trading?</SectionTitle>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {EMOTIONS.map((e) => (
            <Chip key={e.key} label={e.label} icon={e.emoji} selected={feeling === e.key} color={e.risky ? colors.red : colors.primary} onPress={() => setFeeling(feeling === e.key ? null : e.key)} />
          ))}
        </Row>

        <Card style={{ marginTop: 18 }}>
          <ToggleRow label="I followed my plan" hint="Stop-loss, size and number of trades as planned." value={followedPlan} onChange={setFollowedPlan} />
        </Card>

        <View style={{ marginTop: 16 }}>
          <Input label="What happened? (optional)" value={note} onChangeText={setNote} multiline placeholder="e.g. Took a revenge trade after the first loss…" />
        </View>

        {create.error ? <Txt variant="caption" color={colors.red} style={{ marginTop: 12 }}>{create.error.message}</Txt> : null}
        <Button title="Save day" icon="check" disabled={value <= 0} loading={create.isPending} onPress={submit} style={{ marginTop: 22 }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function QuickResult({ result, trackerId, currency }: { result: { breaks: RuleBreak[]; status: DayStatus; pnl: number }; trackerId: string; currency: string }) {
  const { settings } = useAppConfig();
  const broke = result.breaks.length > 0;
  const bigLoss = result.pnl < 0 && (result.status.coolOffNext || result.status.lossLimitHit);
  const xp = settings.feature_gamification ? (broke ? -settings.xp_rule_break * result.breaks.length : settings.xp_clean_trade) : 0;

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16, paddingTop: 12 }}>
      <Gradient colors={result.pnl >= 0 && !broke ? gradients.green : broke ? gradients.red : gradients.primary} sheen style={{ borderRadius: 28, padding: 26, alignItems: 'center', gap: 8 }}>
        <Icon name={bigLoss ? 'heart-outline' : broke ? 'alert-octagon' : 'check-circle'} size={52} />
        <Txt variant="title" center>{bigLoss ? 'A tough day — logged honestly' : broke ? 'Day logged — rules were broken' : 'Day logged'}</Txt>
        <Txt variant="hero" center>{money(result.status.netPnl, currency, { sign: true })}</Txt>
        <Txt center style={{ opacity: 0.92 }}>
          {bigLoss ? 'Writing it down is the first step back. Don’t try to win it back tomorrow.' : broke ? 'It’s recorded. Tomorrow, follow the plan.' : 'Great — that’s what discipline looks like.'}
        </Txt>
      </Gradient>

      {result.status.coolOffNext ? (
        <AlertCard alert={{ level: 'warning', title: `Cool-off: trading locked until ${result.status.coolOffNext}`, message: 'You set this rule to protect yourself after a big loss. Rest, review, come back calm.' }} />
      ) : null}
      {result.breaks.map((b) => (
        <AlertCard key={b.rule} alert={{ level: 'danger', title: b.label ?? b.rule, message: b.description }} />
      ))}
      {xp ? (
        <Txt variant="h3" center color={xp > 0 ? colors.green : colors.red}>
          {xp > 0 ? `+${xp} XP` : `${xp} XP`}
        </Txt>
      ) : null}

      <Button title="Write what you learned" icon="notebook-edit-outline" variant="secondary" onPress={() => router.replace(`/tracker/${trackerId}/journal`)} />
      <Button title="Done" onPress={() => router.back()} />
    </Screen>
  );
}
