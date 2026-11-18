import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { WEEKDAY_LETTERS } from '@/lib/format';
import { ICONS } from '@/lib/templates';
import type { HabitConfig, TradingConfig, Tracker } from '@/lib/types';
import { colors, TRACKER_COLORS } from '@/theme';
import { Button, Card, Chip, haptic, Icon, Input, Row, SectionTitle, Segmented, Stepper, ToggleRow, Txt } from './ui';

export interface TrackerDraft {
  type: Tracker['type'];
  name: string;
  icon: string;
  color: string;
  config: HabitConfig | TradingConfig;
}

const num = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function DaysPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <Row gap={6} style={{ justifyContent: 'space-between' }}>
      {WEEKDAY_LETTERS.map((l, d) => {
        const on = value.includes(d);
        return (
          <Pressable
            key={d}
            onPress={() => {
              haptic.tap();
              const next = on ? value.filter((x) => x !== d) : [...value, d].sort();
              if (next.length) onChange(next);
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.primary : colors.surfaceAlt,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.border,
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
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: 8 }}>
      {items.map((it, i) => (
        <Row key={`${i}-${it}`} gap={10} style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12 }}>
          <Icon name="check-circle-outline" size={18} color={colors.primary} />
          <Txt style={{ flex: 1 }}>{it}</Txt>
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
  return (
    <Input
      label={label}
      value={text}
      placeholder="Off (or HH:MM, e.g. 09:00)"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      onChangeText={(t) => {
        setText(t);
        if (t === '') onChange(null);
        else if (validTime(t)) onChange(t);
      }}
      hint={text && !validTime(text) ? 'Use 24h HH:MM' : undefined}
    />
  );
}

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
  const set = (patch: Partial<TrackerDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setCfg = (patch: Partial<HabitConfig & TradingConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } as any }));

  return (
    <View>
      <Card style={{ gap: 16 }}>
        <Input label="Name" value={draft.name} onChangeText={(name) => set({ name })} placeholder="e.g. Nifty — one trade a day" maxLength={60} />
        <View style={{ gap: 8 }}>
          <Txt variant="label">Icon</Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => set({ icon: ic })}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: draft.icon === ic ? draft.color + '33' : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: draft.icon === ic ? draft.color : colors.border,
                }}>
                <Icon name={ic} size={20} color={draft.icon === ic ? draft.color : colors.textMuted} />
              </Pressable>
            ))}
          </Row>
        </View>
        <View style={{ gap: 8 }}>
          <Txt variant="label">Color</Txt>
          <Row gap={10}>
            {TRACKER_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => set({ color: c })}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 3, borderColor: draft.color === c ? colors.text : 'transparent' }}
              />
            ))}
          </Row>
        </View>
      </Card>

      {draft.type === 'trading' ? (
        <TradingFields cfg={draft.config as TradingConfig} setCfg={setCfg} />
      ) : (
        <HabitFields cfg={draft.config as HabitConfig} setCfg={setCfg} />
      )}

      {error ? <Txt color={colors.red} style={{ marginTop: 16 }}>{error}</Txt> : null}
      <Button title={submitLabel} onPress={() => onSubmit(draft)} loading={submitting} disabled={!draft.name.trim()} style={{ marginTop: 24 }} />
    </View>
  );
}

function TradingFields({ cfg, setCfg }: { cfg: TradingConfig; setCfg: (p: Partial<TradingConfig>) => void }) {
  return (
    <>
      <SectionTitle>Your rules</SectionTitle>
      <Card style={{ gap: 16 }}>
        <Input label="Instrument" value={cfg.instrument} onChangeText={(instrument) => setCfg({ instrument })} />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Max trades per day</Txt>
            <Txt variant="caption">The single most important rule.</Txt>
          </View>
          <Stepper value={cfg.maxTradesPerDay} min={1} onChange={(maxTradesPerDay) => setCfg({ maxTradesPerDay })} />
        </Row>
        <Row gap={12}>
          <View style={{ flex: 1 }}>
            <Input
              label="Daily target"
              keyboardType="numeric"
              value={String(cfg.dailyProfitTarget || '')}
              onChangeText={(t) => setCfg({ dailyProfitTarget: num(t) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Max daily loss"
              keyboardType="numeric"
              value={String(cfg.dailyMaxLoss || '')}
              onChangeText={(t) => setCfg({ dailyMaxLoss: num(t) })}
            />
          </View>
        </Row>
        <ToggleRow
          label="Stop when target is hit"
          hint="Locks the day as soon as you reach your target. This is what stops overconfidence."
          value={cfg.stopAfterTarget}
          onChange={(stopAfterTarget) => setCfg({ stopAfterTarget })}
        />
        <View style={{ gap: 8 }}>
          <Txt variant="label">Trading days</Txt>
          <DaysPicker value={cfg.tradingDays} onChange={(tradingDays) => setCfg({ tradingDays })} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Cool-down before override</Txt>
            <Txt variant="caption">Seconds you must wait before you can break a lock.</Txt>
          </View>
          <Stepper value={cfg.cooldownSeconds} step={15} onChange={(cooldownSeconds) => setCfg({ cooldownSeconds: Math.min(900, cooldownSeconds) })} />
        </Row>
      </Card>

      <SectionTitle>Pre-trade checklist</SectionTitle>
      <Txt variant="caption" style={{ marginBottom: 10 }}>You tick these before every trade. Skipping one is recorded as a rule break.</Txt>
      <ListEditor items={cfg.checklist} onChange={(checklist) => setCfg({ checklist })} placeholder="Add a checklist item" />

      <SectionTitle>Personal rules</SectionTitle>
      <Txt variant="caption" style={{ marginBottom: 10 }}>Shown on your lock screen and pre-market reminder.</Txt>
      <ListEditor items={cfg.customRules} onChange={(customRules) => setCfg({ customRules })} placeholder="e.g. No trades in the first 15 minutes" />

      <SectionTitle>Why this matters</SectionTitle>
      <Input
        value={cfg.why}
        onChangeText={(why) => setCfg({ why })}
        multiline
        maxLength={280}
        placeholder="e.g. I lost a month of profits in 3 days of overtrading. Never again."
        hint="You'll see this exact sentence when you try to break a rule."
      />

      <SectionTitle>Reminders</SectionTitle>
      <Card style={{ gap: 14 }}>
        <TimeField label="Pre-market rules reminder" value={cfg.preMarketReminder} onChange={(preMarketReminder) => setCfg({ preMarketReminder })} />
        <TimeField label="End-of-day journal reminder" value={cfg.journalReminder} onChange={(journalReminder) => setCfg({ journalReminder })} />
      </Card>
    </>
  );
}

function HabitFields({ cfg, setCfg }: { cfg: HabitConfig; setCfg: (p: Partial<HabitConfig>) => void }) {
  return (
    <>
      <SectionTitle>Goal</SectionTitle>
      <Card style={{ gap: 16 }}>
        <Segmented
          options={[
            { value: 'build', label: 'Build a habit' },
            { value: 'quit', label: 'Quit a habit' },
          ]}
          value={cfg.kind}
          onChange={(kind) => setCfg({ kind })}
        />
        {cfg.kind === 'build' ? (
          <Segmented
            options={[
              { value: 'boolean', label: 'Yes / No' },
              { value: 'count', label: 'Count' },
              { value: 'duration', label: 'Minutes' },
            ]}
            value={cfg.goalType}
            onChange={(goalType) =>
              setCfg({ goalType, target: goalType === 'boolean' ? 1 : cfg.target, unit: goalType === 'duration' ? 'min' : cfg.unit })
            }
          />
        ) : (
          <Txt variant="caption">Each day you stay clean, check it off. Your streak shows how long you’ve stayed away.</Txt>
        )}
        {cfg.goalType !== 'boolean' && cfg.kind === 'build' ? (
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <Input label="Daily target" keyboardType="numeric" value={String(cfg.target || '')} onChangeText={(t) => setCfg({ target: Math.max(1, num(t)) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Unit" value={cfg.unit} onChangeText={(unit) => setCfg({ unit })} placeholder="pages, glasses…" maxLength={20} />
            </View>
          </Row>
        ) : null}
        <View style={{ gap: 8 }}>
          <Txt variant="label">Days</Txt>
          <DaysPicker value={cfg.days} onChange={(days) => setCfg({ days })} />
        </View>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip label="Every day" selected={cfg.days.length === 7} onPress={() => setCfg({ days: [0, 1, 2, 3, 4, 5, 6] })} />
          <Chip label="Weekdays" selected={cfg.days.join() === '1,2,3,4,5'} onPress={() => setCfg({ days: [1, 2, 3, 4, 5] })} />
          <Chip label="Weekends" selected={cfg.days.join() === '0,6'} onPress={() => setCfg({ days: [0, 6] })} />
        </Row>
      </Card>

      <SectionTitle>Why this matters</SectionTitle>
      <Input value={cfg.why} onChangeText={(why) => setCfg({ why })} multiline maxLength={280} placeholder="The reason you'll keep going on hard days." />

      <SectionTitle>Reminder</SectionTitle>
      <Card>
        <TimeField label="Daily reminder" value={cfg.reminderTime} onChange={(reminderTime) => setCfg({ reminderTime })} />
      </Card>
    </>
  );
}
