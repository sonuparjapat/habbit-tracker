import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { AlertCard, Button, Card, Chip, haptic, Icon, Input, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addDays, localToday, money } from '@/lib/format';
import { useCreateExpense, useTracker, useTrackerToday } from '@/lib/queries';
import type { RuleBreak, SpendingToday } from '@/lib/types';
import { colors, gradients } from '@/theme';

export default function AddExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker } = useTracker(id);
  const { data: today } = useTrackerToday<SpendingToday>(id);
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const create = useCreateExpense(id);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [result, setResult] = useState<RuleBreak[] | null>(null);

  if (!tracker || tracker.type !== 'spending') return <Loading />;
  const cfg = tracker.config;
  const value = Number(amount) || 0;
  const s = today?.status;
  const wouldExceed = day === 'today' && s && cfg.dailyLimit > 0 && s.spentToday + value > cfg.dailyLimit;
  const noSpend = day === 'today' && s?.noSpendDay;

  if (result) {
    const broke = result.length > 0;
    return (
      <Screen edges={['bottom']} contentStyle={{ gap: 16, paddingTop: 12 }}>
        <LinearGradient colors={broke ? gradients.red : gradients.green} style={{ borderRadius: 28, padding: 28, alignItems: 'center', gap: 8 }}>
          <Icon name={broke ? 'alert-octagon' : 'check-circle'} size={56} />
          <Txt variant="title" center>{broke ? 'Over budget' : 'Logged'}</Txt>
          <Txt variant="hero" center>{money(value, currency)}</Txt>
          <Txt center style={{ opacity: 0.9 }}>{broke ? 'It’s recorded honestly. Tomorrow is a fresh start.' : 'Every expense logged is awareness gained.'}</Txt>
        </LinearGradient>
        {result.map((b) => (
          <AlertCard key={b.rule} alert={{ level: 'danger', title: b.label ?? b.rule, message: b.description }} />
        ))}
        <Button title="Add another" variant="secondary" onPress={() => { setResult(null); setAmount(''); setNote(''); }} />
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  const submit = () =>
    create.mutate(
      { amount: value, category: category ?? cfg.categories[0] ?? 'Other', note: note.trim() || null, spentOn: day === 'yesterday' ? addDays(localToday(), -1) : undefined },
      {
        onSuccess: (r) => {
          if (r.breaks.length) haptic.error();
          else haptic.success();
          setResult(r.breaks);
        },
      },
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Txt variant="label">Amount ({currency})</Txt>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textDim}
            autoFocus
            style={{ fontSize: 48, fontWeight: '800', color: colors.text, textAlign: 'center', minWidth: 200, marginTop: 6 }}
          />
          {s && cfg.dailyLimit > 0 ? (
            <Txt variant="caption">Spent today {money(s.spentToday, currency)} of {money(cfg.dailyLimit, currency)}</Txt>
          ) : null}
        </Card>

        {wouldExceed || noSpend ? (
          <View style={{ marginTop: 14 }}>
            <AlertCard
              alert={{
                level: 'warning',
                title: noSpend ? 'Today is a no-spend day' : 'This takes you over today’s budget',
                message: 'Do you really need it? If yes, log it anyway — honesty beats a perfect record.',
              }}
            />
          </View>
        ) : null}

        <SectionTitle>Category</SectionTitle>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {cfg.categories.map((c) => (
            <Chip key={c} label={c} selected={(category ?? cfg.categories[0]) === c} color={tracker.color} onPress={() => setCategory(c)} />
          ))}
        </Row>

        <SectionTitle>When</SectionTitle>
        <Row gap={8}>
          <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
          <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
        </Row>

        <View style={{ marginTop: 24 }}>
          <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="What was it?" maxLength={500} />
        </View>

        {create.error ? <Txt variant="caption" color={colors.red} style={{ marginTop: 12 }}>{create.error.message}</Txt> : null}
        <Button title="Save expense" icon="check" disabled={value <= 0} loading={create.isPending} onPress={submit} style={{ marginTop: 28 }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
