import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { AlertCard, Button, Card, Chip, Gradient, haptic, Icon, Input, Loading, Row, Screen, SectionTitle, Segmented, ToggleRow, Txt } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAppConfig } from '@/lib/config';
import { addDays, money } from '@/lib/format';
import { scheduleStayAwayNudge } from '@/lib/notifications';
import { useCreateTrade, useDashboard, useDayStatus, useToday, useTracker, type NewTrade } from '@/lib/queries';
import { EMOTIONS, emotionOf, type DayStatus, type RuleBreak, type TradingTracker } from '@/lib/types';
import { colors, gradients } from '@/theme';

type Step = 'locked' | 'cooldown' | 'confess' | 'checklist' | 'form' | 'result';
const CONFESSION = 'I am breaking my rule';

export default function LogTrade() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker } = useTracker(id);
  const { data: status, isLoading } = useDayStatus(id);
  const [chosenStep, setStep] = useState<Step | null>(null);
  const [override, setOverride] = useState<{ reason: string } | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [result, setResult] = useState<{ breaks: RuleBreak[]; status: DayStatus } | null>(null);

  // First screen depends on whether the day is already locked
  const step: Step | null = chosenStep ?? (status ? (status.locked ? 'locked' : 'checklist') : null);

  if (isLoading || !tracker || !status || !step) return <Loading variant="form" />;
  if (tracker.type !== 'trading') return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {step === 'locked' && <LockedView tracker={tracker} status={status} onBreak={() => setStep('cooldown')} />}
      {step === 'cooldown' && <CooldownView seconds={tracker.config.cooldownSeconds} why={tracker.config.why} onDone={() => setStep('confess')} />}
      {step === 'confess' && (
        <ConfessView
          onConfirm={(reason) => {
            setOverride({ reason });
            setStep('checklist');
          }}
        />
      )}
      {step === 'checklist' && (
        <ChecklistView
          tracker={tracker}
          status={status}
          checked={checked}
          setChecked={setChecked}
          emotion={emotion}
          setEmotion={setEmotion}
          onNext={() => setStep('form')}
        />
      )}
      {step === 'form' && (
        <TradeForm
          tracker={tracker}
          base={{ checklistDone: checked, emotionBefore: emotion, override: !!override, breakReason: override?.reason }}
          onLocked={() => setStep('locked')}
          onDone={(r) => {
            setResult(r);
            setStep('result');
          }}
        />
      )}
      {step === 'result' && result && <ResultView tracker={tracker} result={result} />}
    </KeyboardAvoidingView>
  );
}

/* ---------------------------------- Lock ---------------------------------- */

function LockedView({ tracker, status, onBreak }: { tracker: TradingTracker; status: DayStatus; onBreak: () => void }) {
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const { data: dash } = useDashboard();
  const card = dash?.cards.find((c) => c.tracker.id === tracker.id);
  const cleanStreak = card && card.tracker.type === 'trading' ? (card.today as any).streaks.currentClean : 0;
  const tone = status.lossLimitHit ? gradients.red : status.targetHit ? gradients.green : gradients.primary;

  useEffect(() => {
    haptic.warning();
  }, []);

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16 }}>
      <Gradient colors={tone} style={{ borderRadius: 28, padding: 28, alignItems: 'center', gap: 10 }}>
        <Icon name="shield-lock" size={64} />
        <Txt variant="title" center>Your day is closed</Txt>
        <Txt variant="hero" center>{money(status.netPnl, currency, { sign: true })}</Txt>
        {status.lockReasons.map((r) => (
          <Txt key={r.rule} center style={{ opacity: 0.9 }}>{r.message}</Txt>
        ))}
      </Gradient>

      {cleanStreak > 0 ? (
        <AlertCard
          alert={{
            level: 'warning',
            title: `${cleanStreak} clean trading day${cleanStreak > 1 ? 's' : ''} on the line`,
            message: 'Another trade now breaks the chain and resets your clean streak to zero.',
          }}
        />
      ) : null}

      {tracker.config.why ? (
        <Card>
          <Txt variant="label">You told yourself</Txt>
          <Txt variant="h3" style={{ marginTop: 8, fontStyle: 'italic' }}>“{tracker.config.why}”</Txt>
        </Card>
      ) : null}

      {tracker.config.customRules.length ? (
        <Card style={{ gap: 8 }}>
          <Txt variant="label">Your rules</Txt>
          {tracker.config.customRules.map((r) => (
            <Row key={r} gap={8}>
              <Icon name="check-decagram" size={16} color={colors.primary} />
              <Txt style={{ flex: 1 }}>{r}</Txt>
            </Row>
          ))}
        </Card>
      ) : null}

      <Button
        title="I'll respect my rules"
        icon="shield-check"
        variant="success"
        onPress={() => {
          haptic.success();
          router.back();
        }}
      />
      <Pressable onPress={onBreak} style={{ alignSelf: 'center', padding: 12 }}>
        <Txt variant="caption" color={colors.textDim}>I want to break my rule</Txt>
      </Pressable>
    </Screen>
  );
}

function CooldownView({ seconds, why, onDone }: { seconds: number; why: string; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const [scale] = useState(() => new Animated.Value(0.7));
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (seconds <= 0) {
      onDoneRef.current();
      return;
    }
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.7, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(t);
      loop.stop();
    };
  }, [seconds, scale]);

  const phase = Math.floor((seconds - left) / 4) % 2 === 0 ? 'Breathe in…' : 'Breathe out…';

  return (
    <Screen edges={['bottom']} scroll={false} contentStyle={{ alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <Txt variant="h2" center>Pause.</Txt>
      <Animated.View
        style={{
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: colors.primarySoft,
          borderWidth: 2,
          borderColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
        }}>
        <Txt variant="hero">{left}</Txt>
      </Animated.View>
      <Txt variant="h3" color={colors.textMuted}>{phase}</Txt>
      <Txt variant="caption" center style={{ maxWidth: 300 }}>
        {why || 'The urge to trade again is strongest right after a win or a loss. It passes. Let it.'}
      </Txt>
      {left === 0 ? (
        <View style={{ width: '100%', gap: 10 }}>
          <Button title="I've calmed down — close" variant="success" icon="shield-check" onPress={() => { haptic.success(); router.back(); }} />
          <Button title="I still want to trade" variant="ghost" onPress={onDone} />
        </View>
      ) : (
        <Button title="Never mind, I'll stop" variant="secondary" onPress={() => router.back()} />
      )}
    </Screen>
  );
}

function ConfessView({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const ok = reason.trim().length >= 10 && typed.trim().toLowerCase() === CONFESSION.toLowerCase();
  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16 }}>
      <AlertCard
        alert={{
          level: 'danger',
          title: 'This will be recorded as a rule break',
          message: 'It will appear in your reports, reset your clean streak and lower your discipline score. Be honest with yourself.',
        }}
      />
      <Input
        label="Why are you breaking your rule?"
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="e.g. I feel the market will move more and I don't want to miss it"
        hint="You'll read this later in your rule-break log."
      />
      <Input
        label={`Type: “${CONFESSION}”`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        placeholder={CONFESSION}
      />
      <Button title="Continue anyway" variant="danger" disabled={!ok} onPress={() => onConfirm(reason.trim())} />
      <Button title="Stop. I'll respect my rules." variant="success" onPress={() => router.back()} />
    </Screen>
  );
}

/* -------------------------------- Checklist ------------------------------- */

function ChecklistView({
  tracker,
  status,
  checked,
  setChecked,
  emotion,
  setEmotion,
  onNext,
}: {
  tracker: TradingTracker;
  status: DayStatus;
  checked: string[];
  setChecked: (v: string[]) => void;
  emotion: string | null;
  setEmotion: (v: string | null) => void;
  onNext: () => void;
}) {
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const list = tracker.config.checklist;
  const risky = emotionOf(emotion)?.risky;
  const allChecked = list.every((i) => checked.includes(i));

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt variant="label">Trade</Txt>
            <Txt variant="h2">{status.trades + 1} of {status.maxTrades}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt variant="label">Today</Txt>
            <Txt variant="h2" color={status.netPnl >= 0 ? colors.green : colors.red}>{money(status.netPnl, currency, { sign: true })}</Txt>
          </View>
        </Row>
      </Card>

      {status.trades + 1 === status.maxTrades && status.maxTrades === 1 ? (
        <Txt variant="caption" style={{ marginTop: 12 }}>This is your only trade today. Make it count — then you’re done.</Txt>
      ) : null}

      {list.length ? (
        <>
          <SectionTitle>Pre-trade checklist</SectionTitle>
          <View style={{ gap: 8 }}>
            {list.map((item) => {
              const on = checked.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    haptic.tap();
                    setChecked(on ? checked.filter((c) => c !== item) : [...checked, item]);
                  }}>
                  <Row
                    gap={12}
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      backgroundColor: on ? colors.greenSoft : colors.surface,
                      borderWidth: 1,
                      borderColor: on ? colors.green : colors.border,
                    }}>
                    <Icon name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={24} color={on ? colors.green : colors.textDim} />
                    <Txt style={{ flex: 1 }}>{item}</Txt>
                  </Row>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionTitle>How do you feel right now?</SectionTitle>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {EMOTIONS.filter((e) => e.key !== 'satisfied').map((e) => (
          <Chip
            key={e.key}
            label={e.label}
            icon={e.emoji}
            selected={emotion === e.key}
            color={e.risky ? colors.red : colors.primary}
            onPress={() => setEmotion(emotion === e.key ? null : e.key)}
          />
        ))}
      </Row>

      {risky ? (
        <View style={{ marginTop: 14 }}>
          <AlertCard
            alert={{
              level: 'danger',
              title: `Trading while ${emotionOf(emotion)?.label.toLowerCase()} is how accounts die`,
              message: 'Your reports will show exactly how these trades perform. Consider closing the app and coming back calm.',
            }}
          />
        </View>
      ) : null}

      {!allChecked && list.length ? (
        <Txt variant="caption" color={colors.amber} style={{ marginTop: 16 }}>
          {list.length - checked.length} item(s) unchecked — this trade will be recorded as skipping your checklist.
        </Txt>
      ) : null}

      <Button title="Continue" icon="arrow-right" style={{ marginTop: 16 }} onPress={onNext} />
    </Screen>
  );
}

/* ---------------------------------- Form ---------------------------------- */

function TradeForm({
  tracker,
  base,
  onLocked,
  onDone,
}: {
  tracker: TradingTracker;
  base: Pick<NewTrade, 'checklistDone' | 'emotionBefore' | 'override' | 'breakReason'>;
  onLocked: () => void;
  onDone: (r: { breaks: RuleBreak[]; status: DayStatus }) => void;
}) {
  const create = useCreateTrade(tracker.id);
  const serverToday = useToday(tracker.id);
  const [side, setSide] = useState<'profit' | 'loss'>('profit');
  const [amount, setAmount] = useState('');
  const [fees, setFees] = useState('');
  const [direction, setDirection] = useState<'long' | 'short' | null>(null);
  const [qty, setQty] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [setup, setSetup] = useState('');
  const [followedPlan, setFollowedPlan] = useState(true);
  const [emotionAfter, setEmotionAfter] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [error, setError] = useState<string | null>(null);

  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  const canCalc = n(qty) && n(entry) !== null && n(exit) !== null && direction;
  const calc = () => {
    const pnl = (n(exit)! - n(entry)!) * n(qty)! * (direction === 'short' ? -1 : 1);
    setSide(pnl >= 0 ? 'profit' : 'loss');
    setAmount(String(Math.abs(Math.round(pnl * 100) / 100)));
  };

  const submit = () => {
    setError(null);
    const value = Number(amount);
    if (!amount || !Number.isFinite(value)) return setError('Enter the P&L amount');
    create.mutate(
      {
        ...base,
        tradeDate: day === 'yesterday' ? addDays(serverToday, -1) : undefined,
        pnl: side === 'loss' ? -Math.abs(value) : Math.abs(value),
        fees: Number(fees) || 0,
        direction,
        quantity: n(qty),
        entryPrice: n(entry),
        exitPrice: n(exit),
        setup: setup.trim() || null,
        followedPlan,
        emotionAfter,
        note: note.trim() || null,
      },
      {
        onSuccess: (r) => onDone(r),
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'DAY_LOCKED') onLocked();
          else setError(e.message);
        },
      },
    );
  };

  return (
    <Screen edges={['bottom']}>
      <Segmented
        options={[
          { value: 'profit', label: '▲ Profit' },
          { value: 'loss', label: '▼ Loss' },
        ]}
        value={side}
        onChange={setSide}
      />
      <Card style={{ marginTop: 14, alignItems: 'center' }}>
        <Txt variant="label">Net {side} ({tracker.config.instrument})</Txt>
        <Input
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          style={{
            fontSize: 40,
            fontWeight: '800',
            textAlign: 'center',
            backgroundColor: 'transparent',
            borderWidth: 0,
            color: side === 'profit' ? colors.green : colors.red,
            minWidth: 200,
          }}
        />
      </Card>

      <Row gap={8} style={{ marginTop: 14 }}>
        <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
        <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
      </Row>

      <SectionTitle>Details (optional)</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Row gap={8}>
          <Chip label="Long" icon="📈" selected={direction === 'long'} color={colors.green} onPress={() => setDirection(direction === 'long' ? null : 'long')} />
          <Chip label="Short" icon="📉" selected={direction === 'short'} color={colors.red} onPress={() => setDirection(direction === 'short' ? null : 'short')} />
        </Row>
        <Row gap={10}>
          <View style={{ flex: 1 }}><Input label="Qty" value={qty} onChangeText={setQty} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Input label="Entry" value={entry} onChangeText={setEntry} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Input label="Exit" value={exit} onChangeText={setExit} keyboardType="decimal-pad" /></View>
        </Row>
        {canCalc ? <Button title="Calculate P&L from prices" variant="secondary" small icon="calculator" onPress={calc} /> : null}
        <Input label="Charges (brokerage + taxes)" value={fees} onChangeText={setFees} keyboardType="decimal-pad" placeholder="0" />
        <Input label="Setup" value={setup} onChangeText={setSetup} placeholder="e.g. ORB breakout, VWAP bounce" maxLength={80} />
      </Card>

      <SectionTitle>Honesty check</SectionTitle>
      <Card>
        <ToggleRow label="I followed my plan" hint="Entry, stop-loss, size and exit were all as planned." value={followedPlan} onChange={setFollowedPlan} />
      </Card>

      <SectionTitle>How do you feel now?</SectionTitle>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {EMOTIONS.map((e) => (
          <Chip key={e.key} label={e.label} icon={e.emoji} selected={emotionAfter === e.key} onPress={() => setEmotionAfter(emotionAfter === e.key ? null : e.key)} />
        ))}
      </Row>

      <View style={{ marginTop: 16 }}>
        <Input label="Note" value={note} onChangeText={setNote} multiline placeholder="What happened? What did you see?" />
      </View>

      {error ? <Txt color={colors.red} style={{ marginTop: 12 }}>{error}</Txt> : null}
      <Button title="Log trade" icon="check" loading={create.isPending} onPress={submit} style={{ marginTop: 20 }} />
    </Screen>
  );
}

/* --------------------------------- Result --------------------------------- */

function ResultView({ tracker, result }: { tracker: TradingTracker; result: { breaks: RuleBreak[]; status: DayStatus } }) {
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const s = result.status;
  const today = useToday(tracker.id);
  const { settings } = useAppConfig();
  const xpChange = settings.feature_gamification ? (result.breaks.length ? -settings.xp_rule_break * result.breaks.length : settings.xp_clean_trade) : 0;
  const broke = result.breaks.length > 0;

  // Feedback once, when the result appears
  useEffect(() => {
    if (broke) haptic.error();
    else haptic.success();
  }, [broke]);

  // If today's trading day just closed, nudge the user later to stay away (once, even if `today` updates)
  const nudged = useRef(false);
  useEffect(() => {
    if (nudged.current || !s.locked || s.date !== today) return;
    nudged.current = true;
    void scheduleStayAwayNudge(s.netPnl, currency);
  }, [s, today, currency]);

  const tone = broke ? gradients.red : s.targetHit ? gradients.green : gradients.primary;
  const title = broke
    ? 'Rule broken'
    : s.targetHit
      ? 'Target hit. Day closed.'
      : s.lossLimitHit
        ? 'Loss limit hit. Day closed.'
        : s.tradeLimitHit
          ? 'Done for today.'
          : 'Trade logged';
  const subtitle = broke
    ? 'It is recorded. Learn from it — then stop for today.'
    : s.locked
      ? 'Close the terminal. Walk away. This is what discipline looks like.'
      : `${s.remainingTrades} trade${s.remainingTrades === 1 ? '' : 's'} left today.`;

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16 }}>
      <Gradient colors={tone} style={{ borderRadius: 28, padding: 28, alignItems: 'center', gap: 8 }}>
        <Icon name={broke ? 'alert-octagon' : s.locked ? 'trophy' : 'check-circle'} size={60} />
        <Txt variant="title" center>{title}</Txt>
        <Txt variant="hero" center>{money(s.netPnl, currency, { sign: true })}</Txt>
        <Txt center style={{ opacity: 0.9 }}>{subtitle}</Txt>
      </Gradient>

      {result.breaks.map((b) => (
        <AlertCard key={b.rule} alert={{ level: 'danger', title: b.label ?? b.rule, message: b.description }} />
      ))}

      {xpChange ? (
        <Row gap={8} style={{ justifyContent: 'center' }}>
          <Icon name={xpChange > 0 ? 'star-four-points' : 'arrow-down-bold'} size={18} color={xpChange > 0 ? colors.green : colors.red} />
          <Txt variant="h3" color={xpChange > 0 ? colors.green : colors.red}>
            {xpChange > 0 ? `+${xpChange} XP — clean trade` : `${xpChange} XP — ${result.breaks.length} rule${result.breaks.length > 1 ? 's' : ''} broken`}
          </Txt>
        </Row>
      ) : null}
      <Button title="Write today's journal" icon="notebook-edit-outline" variant="secondary" onPress={() => router.replace(`/tracker/${tracker.id}/journal`)} />
      <Button title="Done" onPress={() => router.back()} />
    </Screen>
  );
}
