import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Button, Card, Chip, Gradient, haptic, Ring, Row, Screen, SectionTitle, Stepper, Txt } from '@/components/ui';
import { get } from '@/lib/api';
import { enqueue } from '@/lib/outbox';
import { localToday } from '@/lib/format';
import { cancelScheduled, scheduleFocusDone } from '@/lib/notifications';
import { showEntryChange, useTrackers } from '@/lib/queries';
import type { HabitConfig, Tracker } from '@/lib/types';
import { colors, gradients } from '@/theme';

const PRESETS = [15, 25, 45, 60];
const KEEP_AWAKE_TAG = 'focus-timer';

type Phase = { kind: 'setup' } | { kind: 'running'; endAt: number } | { kind: 'paused'; leftMs: number } | { kind: 'done'; minutes: number; logged: string | null };

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Habits a focus session can count towards: minutes-based ones, or done / not-done ones. */
const focusable = (t: Tracker) => {
  if (t.type !== 'habit' || t.archived) return false;
  const c = t.config as HabitConfig;
  return c.kind === 'build' && (c.goalType === 'duration' || c.goalType === 'boolean');
};

/** Log a finished session: add the minutes to a minutes habit, or tick a done / not-done habit. */
async function logSession(t: Tracker, minutes: number) {
  const c = t.config as HabitConfig;
  const day = localToday();
  if (c.goalType === 'duration') {
    // Add to what's already logged today (from the server if it's awake, otherwise from the saved data)
    const today = await get<{ valueToday: number }>(`/trackers/${t.id}/today`).catch(() => null);
    const value = (today?.valueToday ?? 0) + minutes;
    showEntryChange(t.id, day, { kind: 'save', value });
    await enqueue('PUT', `/trackers/${t.id}/entries/${day}`, { value });
    return `+${minutes} min added to ${t.name}`;
  }
  showEntryChange(t.id, day, { kind: 'save', completed: true });
  await enqueue('PUT', `/trackers/${t.id}/entries/${day}`, { completed: true });
  return `${t.name} checked in for today`;
}

/** Focus timer (Pomodoro): pick a habit, pick minutes, focus. Works while the screen is off. */
export default function Focus() {
  const { data: trackers } = useTrackers();
  const habits = (trackers ?? []).filter(focusable);
  const [habitId, setHabitId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(25);
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const alarmId = useRef<string | null>(null);
  const habit = habits.find((h) => h.id === habitId) ?? null;
  const totalMs = minutes * 60_000;

  // Tick while running; the end time is fixed, so time spent in the background is never lost
  useEffect(() => {
    if (phase.kind !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    const sub = AppState.addEventListener('change', () => setNow(Date.now()));
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      clearInterval(id);
      sub.remove();
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [phase.kind]);

  const leftMs = phase.kind === 'running' ? phase.endAt - now : phase.kind === 'paused' ? phase.leftMs : totalMs;
  const finished = phase.kind === 'running' && leftMs <= 0;

  // Time's up → log it once
  useEffect(() => {
    if (!finished) return;
    haptic.success();
    alarmId.current = null; // it has rung
    const done = (logged: string | null) => setPhase({ kind: 'done', minutes, logged });
    if (!habit) return done(null);
    logSession(habit, minutes)
      .then((text) => done(text))
      .catch((e: Error) => {
        setError(`Couldn’t log it: ${e.message}`);
        done(null);
      });
  }, [finished, habit, minutes]);

  const start = async (ms: number) => {
    setError(null);
    haptic.tap();
    const endAt = Date.now() + ms;
    setNow(Date.now());
    setPhase({ kind: 'running', endAt });
    cancelScheduled(alarmId.current);
    alarmId.current = await scheduleFocusDone(ms / 1000, habit?.name ?? null);
  };
  const pause = () => {
    if (phase.kind !== 'running') return;
    cancelScheduled(alarmId.current);
    alarmId.current = null;
    setPhase({ kind: 'paused', leftMs: phase.endAt - Date.now() });
  };
  const reset = () => {
    cancelScheduled(alarmId.current);
    alarmId.current = null;
    setPhase({ kind: 'setup' });
  };

  if (phase.kind === 'done') {
    return (
      <Screen edges={['bottom']} contentStyle={{ gap: 16, paddingTop: 20 }}>
        <Gradient colors={gradients.green} sheen glow={colors.green} style={{ borderRadius: 28, padding: 28, alignItems: 'center', gap: 8 }}>
          <Txt style={{ fontSize: 60 }}>🎯</Txt>
          <Txt variant="title" center>Session complete</Txt>
          <Txt center>{phase.minutes} minutes of real focus.</Txt>
          {phase.logged ? <Txt variant="h3" center>{phase.logged}</Txt> : null}
        </Gradient>
        {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
        <Button title="Another round" icon="restart" onPress={() => void start(totalMs)} />
        <Button title="Done" variant="secondary" onPress={reset} />
      </Screen>
    );
  }

  const active = phase.kind !== 'setup';
  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 18, paddingTop: 20 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Ring value={active ? 1 - Math.max(0, leftMs) / totalMs : 0} size={240} stroke={16} color={phase.kind === 'paused' ? colors.amber : colors.primary}>
          <Txt style={{ fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{mmss(leftMs)}</Txt>
          <Txt variant="caption">{phase.kind === 'running' ? 'Focus…' : phase.kind === 'paused' ? 'Paused' : `${minutes} minutes`}</Txt>
        </Ring>
        {habit ? <Txt variant="caption">Counting towards: {habit.name}</Txt> : null}
      </View>

      {phase.kind === 'setup' ? (
        <>
          <Card style={{ gap: 12 }}>
            <Txt variant="label">How long?</Txt>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {PRESETS.map((m) => (
                <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="caption">Custom</Txt>
              <Stepper value={minutes} min={5} step={5} onChange={(v) => setMinutes(Math.min(180, v))} />
            </Row>
          </Card>

          <SectionTitle>Count it towards a habit (optional)</SectionTitle>
          {habits.length ? (
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Chip label="Just focus" selected={!habitId} onPress={() => setHabitId(null)} />
              {habits.map((h) => (
                <Chip key={h.id} label={h.name} selected={habitId === h.id} color={h.color} onPress={() => setHabitId(h.id)} />
              ))}
            </Row>
          ) : (
            <Txt variant="caption">Create a habit measured in minutes (like Study or Deep work) and your sessions will count towards it.</Txt>
          )}
          <Button title="Start focusing" icon="play" onPress={() => void start(totalMs)} />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {phase.kind === 'running' ? (
            <Button title="Pause" icon="pause" variant="secondary" onPress={pause} />
          ) : (
            <Button title="Resume" icon="play" onPress={() => void start(phase.leftMs)} />
          )}
          <Button title="Stop" icon="stop" variant="ghost" onPress={reset} />
          <Txt variant="caption" center>Phone down. We’ll ring when time’s up — even if the screen turns off.</Txt>
        </View>
      )}
    </Screen>
  );
}
