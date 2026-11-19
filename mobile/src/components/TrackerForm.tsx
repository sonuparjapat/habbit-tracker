import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { usePrefs } from '@/lib/prefs';
import { CATEGORIES, ICONS, MARKETS } from '@/lib/catalog';
import { money, WEEKDAY_LETTERS } from '@/lib/format';
import type { CategoryKey, HabitConfig, SpendingConfig, TrackerType, TradingConfig } from '@/lib/types';
import { colors, radius, TRACKER_COLORS } from '@/theme';
import { Button, Card, Chip, haptic, Icon, Input, Row, SectionTitle, Segmented, Stepper, ToggleRow, Txt } from './ui';

export interface TrackerDraft {
  type: TrackerType;
  category: CategoryKey;
  name: string;
  icon: string;
  color: string;
  templateSlug?: string;
  config: HabitConfig | TradingConfig | SpendingConfig;
}

type AnyConfig = Partial<HabitConfig & TradingConfig & SpendingConfig>;

const num = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/* --------------------------------- Pieces --------------------------------- */

function DaysPicker({ value, onChange, allowEmpty = false, color = colors.primary }: { value: number[]; onChange: (v: number[]) => void; allowEmpty?: boolean; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      {WEEKDAY_LETTERS.map((l, d) => {
        const on = value.includes(d);
        return (
          <Pressable
            key={d}
            onPress={() => {
              haptic.tap();
              const next = on ? value.filter((x) => x !== d) : [...value, d].sort();
              if (next.length || allowEmpty) onChange(next);
            }}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? color : colors.surfaceAlt,
              borderWidth: 1,
              borderColor: on ? color : colors.border,
            }}>
            <Txt variant="h3" color={on ? colors.text : colors.textMuted}>{l}</Txt>
          </Pressable>
        );
      })}
    </Row>
  );
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: 8 }}>
      {items.map((it, i) => (
        <Row key={`${i}-${it}`} gap={12} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
          <Icon name="check-circle-outline" size={18} color={colors.primary} />
          <Txt style={{ flex: 1, fontSize: 15 }}>{it}</Txt>
          <Pressable hitSlop={10} onPress={() => onChange(items.filter((_, j) => j !== i))}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </Row>
      ))}
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Input value={draft} onChangeText={setDraft} placeholder={placeholder} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <Button title="Add" small variant="secondary" onPress={add} />
      </Row>
    </View>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '');
  const remindersOn = usePrefs((s) => s.remindersConsent);
  return (
    <Input
      label={label}
      value={text}
      placeholder="Off — or a time like 09:00"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      onChangeText={(t) => {
        setText(t);
        if (t === '') onChange(null);
        else if (validTime(t)) onChange(t);
      }}
      hint={
        text && !validTime(text)
          ? 'Use 24-hour HH:MM'
          : value && !remindersOn
            ? 'Reminders are turned off — switch them on in Profile → Privacy & notifications.'
            : undefined
      }
    />
  );
}

function MoneyField({ label, value, onChange, hint, currency }: { label: string; value: number; onChange: (v: number) => void; hint?: string; currency: string }) {
  return (
    <Input
      label={label}
      keyboardType="numeric"
      value={value ? String(value) : ''}
      placeholder="0 = off"
      onChangeText={(t) => onChange(num(t))}
      hint={hint ?? (value ? money(value, currency) : 'Off')}
    />
  );
}

/* ---------------------------------- Form ---------------------------------- */

export function TrackerForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
}: {
  initial: TrackerDraft;
  submitLabel: string;
  onSubmit: (d: TrackerDraft) => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState<TrackerDraft>(initial);
  const currency = useAuth((s) => s.user?.currency ?? 'USD');
  const set = (patch: Partial<TrackerDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setCfg = (patch: AnyConfig) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } as TrackerDraft['config'] }));
  const [showLook, setShowLook] = useState(false);

  return (
    <View>
      <Card style={{ gap: 18 }}>
        <Row gap={14}>
          <Pressable
            onPress={() => setShowLook((s) => !s)}
            style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: draft.color + '26', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={draft.icon} size={28} color={draft.color} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Input value={draft.name} onChangeText={(name) => set({ name })} placeholder="Name your tracker" maxLength={60} />
          </View>
        </Row>
        <Pressable onPress={() => setShowLook((s) => !s)}>
          <Txt variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>{showLook ? 'Hide icon & colour' : 'Change icon & colour'}</Txt>
        </Pressable>
        {showLook ? (
          <View style={{ gap: 14 }}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {ICONS.map((ic) => (
                <Pressable
                  key={ic}
                  onPress={() => set({ icon: ic })}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: draft.icon === ic ? draft.color + '33' : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: draft.icon === ic ? draft.color : 'transparent',
                  }}>
                  <Icon name={ic} size={20} color={draft.icon === ic ? draft.color : colors.textMuted} />
                </Pressable>
              ))}
            </Row>
            <Row gap={12} style={{ flexWrap: 'wrap' }}>
              {TRACKER_COLORS.map((c) => (
                <Pressable key={c} onPress={() => set({ color: c })} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: draft.color === c ? colors.text : 'transparent' }} />
              ))}
            </Row>
          </View>
        ) : null}
      </Card>

      {draft.type === 'trading' ? (
        <TradingFields cfg={draft.config as TradingConfig} setCfg={setCfg} currency={currency} />
      ) : draft.type === 'spending' ? (
        <SpendingFields cfg={draft.config as SpendingConfig} setCfg={setCfg} currency={currency} />
      ) : (
        <HabitFields cfg={draft.config as HabitConfig} setCfg={setCfg} color={draft.color} />
      )}

      <SectionTitle>Category</SectionTitle>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <Chip key={c.key} label={c.label} selected={draft.category === c.key} color={c.color} onPress={() => set({ category: c.key })} />
        ))}
      </Row>

      {error ? (
        <Row gap={8} style={{ backgroundColor: colors.redSoft, padding: 12, borderRadius: 12, marginTop: 20 }}>
          <Icon name="alert-circle-outline" size={18} color={colors.red} />
          <Txt variant="caption" color={colors.red} style={{ flex: 1 }}>{error}</Txt>
        </Row>
      ) : null}
      <Button title={submitLabel} onPress={() => onSubmit(draft)} loading={submitting} disabled={!draft.name.trim()} style={{ marginTop: 28 }} />
    </View>
  );
}

/* --------------------------------- Trading -------------------------------- */

function TradingFields({ cfg, setCfg, currency }: { cfg: TradingConfig; setCfg: (p: AnyConfig) => void; currency: string }) {
  return (
    <>
      <SectionTitle>What do you trade?</SectionTitle>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {MARKETS.map((m) => (
          <Chip key={m.key} label={m.label} selected={cfg.market === m.key} onPress={() => setCfg({ market: m.key })} />
        ))}
      </Row>
      <View style={{ marginTop: 14 }}>
        <Input value={cfg.instrument} onChangeText={(instrument) => setCfg({ instrument })} placeholder="Instrument (optional) — e.g. AAPL, BTC, EUR/USD" maxLength={40} />
      </View>

      <SectionTitle>Your limits</SectionTitle>
      <Card style={{ gap: 20 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Txt variant="h3">Max trades per day</Txt>
            <Txt variant="caption">The most important rule.</Txt>
          </View>
          <Stepper value={cfg.maxTradesPerDay} min={1} onChange={(maxTradesPerDay) => setCfg({ maxTradesPerDay: Math.min(100, maxTradesPerDay) })} />
        </Row>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <MoneyField label="Daily profit target" value={cfg.dailyProfitTarget} onChange={(dailyProfitTarget) => setCfg({ dailyProfitTarget })} currency={currency} />
          </View>
          <View style={{ flex: 1 }}>
            <MoneyField label="Max daily loss" value={cfg.dailyMaxLoss} onChange={(dailyMaxLoss) => setCfg({ dailyMaxLoss })} currency={currency} />
          </View>
        </Row>
        <ToggleRow
          label="Stop when target is hit"
          hint="Locks your day once you reach the target — the cure for overconfidence."
          value={cfg.stopAfterTarget}
          onChange={(stopAfterTarget) => setCfg({ stopAfterTarget })}
        />
        <View style={{ gap: 10 }}>
          <Txt variant="label">Trading days</Txt>
          <DaysPicker value={cfg.tradingDays} onChange={(tradingDays) => setCfg({ tradingDays })} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Txt variant="h3">Pause before override</Txt>
            <Txt variant="caption">Seconds to wait before you can break a lock.</Txt>
          </View>
          <Stepper value={cfg.cooldownSeconds} step={15} onChange={(cooldownSeconds) => setCfg({ cooldownSeconds: Math.min(900, cooldownSeconds) })} />
        </Row>
      </Card>

      <SectionTitle>Protect yourself</SectionTitle>
      <Txt variant="caption" style={{ marginBottom: 12 }}>Guard-rails for bad days. 0 = off. Breaking them is recorded and costs XP.</Txt>
      <Card style={{ gap: 20 }}>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <MoneyField label="Weekly loss limit" value={cfg.weeklyMaxLoss} onChange={(weeklyMaxLoss) => setCfg({ weeklyMaxLoss })} currency={currency} />
          </View>
          <View style={{ flex: 1 }}>
            <MoneyField label="Monthly loss limit" value={cfg.monthlyMaxLoss} onChange={(monthlyMaxLoss) => setCfg({ monthlyMaxLoss })} currency={currency} />
          </View>
        </Row>
        <MoneyField
          label="Max loss on a single trade"
          value={cfg.maxLossPerTrade}
          onChange={(maxLossPerTrade) => setCfg({ maxLossPerTrade })}
          currency={currency}
          hint={cfg.maxLossPerTrade ? `A trade losing more than ${money(cfg.maxLossPerTrade, currency)} means the stop-loss wasn't respected.` : 'Off'}
        />
        <View style={{ gap: 12 }}>
          <MoneyField
            label="Cool-off after a losing day of"
            value={cfg.coolOffLoss}
            onChange={(coolOffLoss) => setCfg({ coolOffLoss })}
            currency={currency}
            hint={cfg.coolOffLoss ? `Lose ${money(cfg.coolOffLoss, currency)} or more in a day and the next ${cfg.coolOffDays} day${cfg.coolOffDays > 1 ? 's are' : ' is'} locked.` : 'Off — big losing days don’t lock the next day'}
          />
          {cfg.coolOffLoss ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3">Days locked after</Txt>
              <Stepper value={cfg.coolOffDays} min={1} onChange={(coolOffDays) => setCfg({ coolOffDays: Math.min(14, coolOffDays) })} />
            </Row>
          ) : null}
        </View>
        <View style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Txt variant="h3">Tilt alarm after losses in a row</Txt>
              <Txt variant="caption">{cfg.tiltLosses ? `After ${cfg.tiltLosses} losing trades in a row, you must pause.` : 'Off'}</Txt>
            </View>
            <Stepper value={cfg.tiltLosses} min={0} onChange={(tiltLosses) => setCfg({ tiltLosses: Math.min(10, tiltLosses) })} />
          </Row>
          {cfg.tiltLosses ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3">Pause (minutes)</Txt>
              <Stepper value={cfg.tiltPauseMinutes} step={15} min={15} onChange={(tiltPauseMinutes) => setCfg({ tiltPauseMinutes: Math.min(240, tiltPauseMinutes) })} />
            </Row>
          ) : null}
        </View>
      </Card>

      <SectionTitle>Pre-trade checklist</SectionTitle>
      <Txt variant="caption" style={{ marginBottom: 12 }}>Ticked before every trade. Skipping an item is recorded.</Txt>
      <ListEditor items={cfg.checklist} onChange={(checklist) => setCfg({ checklist })} placeholder="Add a checklist item" />

      <SectionTitle>Personal rules</SectionTitle>
      <Txt variant="caption" style={{ marginBottom: 12 }}>Shown on your lock screen and reminders.</Txt>
      <ListEditor items={cfg.customRules} onChange={(customRules) => setCfg({ customRules })} placeholder="e.g. No trades in the first 15 minutes" />

      <WhyField value={cfg.why} onChange={(why) => setCfg({ why })} placeholder="e.g. I lost a month of profits in 3 days of overtrading. Never again." />

      <SectionTitle>Reminders</SectionTitle>
      <Card style={{ gap: 16 }}>
        <TimeField label="Before you trade — read your rules" value={cfg.preMarketReminder} onChange={(preMarketReminder) => setCfg({ preMarketReminder })} />
        <TimeField label="After you trade — journal" value={cfg.journalReminder} onChange={(journalReminder) => setCfg({ journalReminder })} />
      </Card>
    </>
  );
}

/* -------------------------------- Spending -------------------------------- */

function SpendingFields({ cfg, setCfg, currency }: { cfg: SpendingConfig; setCfg: (p: AnyConfig) => void; currency: string }) {
  return (
    <>
      <SectionTitle>Your budget</SectionTitle>
      <Card style={{ gap: 20 }}>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <MoneyField label="Daily limit" value={cfg.dailyLimit} onChange={(dailyLimit) => setCfg({ dailyLimit })} currency={currency} />
          </View>
          <View style={{ flex: 1 }}>
            <MoneyField label="Monthly limit" value={cfg.monthlyLimit} onChange={(monthlyLimit) => setCfg({ monthlyLimit })} currency={currency} />
          </View>
        </Row>
        <View style={{ gap: 10 }}>
          <Txt variant="label">No-spend days (optional)</Txt>
          <DaysPicker value={cfg.noSpendDays} onChange={(noSpendDays) => setCfg({ noSpendDays })} allowEmpty color={colors.red} />
          <Txt variant="caption">Days you want to spend nothing at all.</Txt>
        </View>
      </Card>

      <SectionTitle>Spending categories</SectionTitle>
      <ListEditor items={cfg.categories} onChange={(categories) => categories.length && setCfg({ categories })} placeholder="Add a category" />

      <WhyField value={cfg.why} onChange={(why) => setCfg({ why })} placeholder="e.g. Saving for a home deposit by next year." />

      <SectionTitle>Reminder</SectionTitle>
      <Card>
        <TimeField label="Daily — log today’s spending" value={cfg.reminderTime} onChange={(reminderTime) => setCfg({ reminderTime })} />
      </Card>
    </>
  );
}

/* ---------------------------------- Habit --------------------------------- */

const KIND_HELP = {
  build: 'Something you want to do — like working out or reading.',
  quit: 'Something you want to stop. Check in every day you stay clean.',
  limit: 'Something you want less of. Log how much, and stay under your limit.',
};

function HabitFields({ cfg, setCfg, color }: { cfg: HabitConfig; setCfg: (p: AnyConfig) => void; color: string }) {
  const measured = cfg.kind === 'limit' || (cfg.kind === 'build' && cfg.goalType !== 'boolean');
  return (
    <>
      <SectionTitle>Goal</SectionTitle>
      <Card style={{ gap: 18 }}>
        <Segmented
          options={[
            { value: 'build', label: 'Build' },
            { value: 'quit', label: 'Quit' },
            { value: 'limit', label: 'Limit' },
          ]}
          value={cfg.kind}
          onChange={(kind) =>
            setCfg(
              kind === 'limit'
                ? { kind, goalType: cfg.goalType === 'boolean' ? 'count' : cfg.goalType, target: cfg.target > 1 ? cfg.target : 3 }
                : kind === 'quit'
                  ? { kind, goalType: 'boolean', target: 1 }
                  : { kind },
            )
          }
        />
        <Txt variant="caption">{KIND_HELP[cfg.kind]}</Txt>

        {cfg.kind !== 'quit' ? (
          <Segmented
            options={
              cfg.kind === 'build'
                ? [
                    { value: 'boolean', label: 'Done / not done' },
                    { value: 'count', label: 'Amount' },
                    { value: 'duration', label: 'Minutes' },
                  ]
                : [
                    { value: 'count', label: 'Amount' },
                    { value: 'duration', label: 'Minutes' },
                  ]
            }
            value={cfg.goalType}
            onChange={(goalType) => setCfg({ goalType, target: goalType === 'boolean' ? 1 : Math.max(cfg.target, 1), unit: goalType === 'duration' ? 'min' : cfg.unit === 'min' ? '' : cfg.unit })}
          />
        ) : null}

        {measured ? (
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <Input
                label={cfg.kind === 'limit' ? 'Daily maximum' : 'Daily target'}
                keyboardType="numeric"
                value={String(cfg.target || '')}
                onChangeText={(t) => setCfg({ target: Math.max(cfg.kind === 'limit' ? 0.01 : 1, num(t)) })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Unit" value={cfg.unit} onChangeText={(unit) => setCfg({ unit })} placeholder="pages, cups…" maxLength={20} />
            </View>
          </Row>
        ) : null}

        <View style={{ gap: 10 }}>
          <Txt variant="label">Days</Txt>
          <DaysPicker value={cfg.days} onChange={(days) => setCfg({ days })} color={color} />
        </View>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip label="Every day" selected={cfg.days.length === 7} onPress={() => setCfg({ days: [0, 1, 2, 3, 4, 5, 6] })} />
          <Chip label="Weekdays" selected={cfg.days.join() === '1,2,3,4,5'} onPress={() => setCfg({ days: [1, 2, 3, 4, 5] })} />
          <Chip label="Weekends" selected={cfg.days.join() === '0,6'} onPress={() => setCfg({ days: [0, 6] })} />
        </Row>
      </Card>

      <WhyField value={cfg.why} onChange={(why) => setCfg({ why })} placeholder="The reason you’ll keep going on hard days." />

      <SectionTitle>Reminder</SectionTitle>
      <Card>
        <TimeField label="Daily reminder" value={cfg.reminderTime} onChange={(reminderTime) => setCfg({ reminderTime })} />
      </Card>
    </>
  );
}

function WhyField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <>
      <SectionTitle>Why this matters to you</SectionTitle>
      <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: 4 }}>
        <Input value={value} onChangeText={onChange} multiline maxLength={280} placeholder={placeholder} style={{ backgroundColor: colors.surface, borderWidth: 0 }} />
      </View>
      <Txt variant="caption" style={{ marginTop: 8 }}>You’ll see these exact words when you’re about to break your rule.</Txt>
    </>
  );
}
