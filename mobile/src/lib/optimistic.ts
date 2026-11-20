/**
 * Instant feedback: show a check-in on screen the moment it's tapped, before the server confirms.
 *
 * The same small calculation the server does for a habit day is repeated here (done? over the limit?
 * streak +1?). When the server's real numbers arrive they replace these — and any change still waiting
 * in the outbox is re-applied on top, so the screen never jumps back while a change is in transit.
 */
import type { Dashboard, HabitConfig, HabitToday } from './types';
import { useOutbox, type OutboxOp } from './outbox';

export type EntryChange = { kind: 'delete' } | { kind: 'save'; completed?: boolean; value?: number };

/** A habit's "today" after a check-in change. */
export function applyToHabitToday(today: HabitToday, cfg: HabitConfig, change: EntryChange): HabitToday {
  let value = today.valueToday;
  let logged = today.loggedToday;
  let completed = today.completedToday;
  if (change.kind === 'delete') {
    value = 0;
    logged = false;
    completed = false;
  } else {
    if (change.value !== undefined) value = change.value;
    logged = true;
    if (cfg.kind === 'limit') completed = value <= cfg.target;
    else if (cfg.kind === 'quit' || cfg.goalType === 'boolean') completed = change.completed ?? completed;
    else completed = value >= cfg.target;
  }
  let streak = today.currentStreak;
  if (today.scheduledToday && completed !== today.completedToday) streak = Math.max(0, streak + (completed ? 1 : -1));
  return {
    ...today,
    valueToday: value,
    loggedToday: logged,
    completedToday: completed,
    overLimit: cfg.kind === 'limit' && logged && value > cfg.target,
    currentStreak: streak,
    bestStreak: Math.max(today.bestStreak, streak),
    // The server's "streak at risk" alerts no longer apply once today is done
    alerts: completed ? today.alerts.filter((a) => !/at risk/i.test(a.title)) : today.alerts,
  };
}

/** The Today screen after a check-in change. */
export function applyToDashboard(data: Dashboard, trackerId: string, date: string, change: EntryChange): Dashboard {
  if (data.date !== date) return data; // a past day doesn't change today's screen
  let done = data.summary.habitsDone;
  const cards = data.cards.map((card) => {
    if (card.tracker.id !== trackerId || card.tracker.type !== 'habit') return card;
    const before = card.today as HabitToday;
    const after = applyToHabitToday(before, card.tracker.config as HabitConfig, change);
    if (before.scheduledToday && after.completedToday !== before.completedToday) done += after.completedToday ? 1 : -1;
    return { ...card, today: after };
  });
  const due = data.summary.habitsDue;
  const habitPart = due ? Math.max(0, Math.min(due, done)) / due : 1;
  const dayScore = Math.max(0, Math.round(habitPart * 100 - data.summary.ruleBreaksToday * 25));
  return { ...data, cards, summary: { ...data.summary, habitsDone: Math.max(0, Math.min(due, done)), dayScore } } as Dashboard;
}

/** Read an outbox change as a check-in change (or null if it's something else). */
export function entryChangeOf(op: OutboxOp): { trackerId: string; date: string; change: EntryChange } | null {
  const m = op.path.match(/^\/trackers\/([^/]+)\/entries\/(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  if (op.method === 'DELETE') return { trackerId: m[1]!, date: m[2]!, change: { kind: 'delete' } };
  const body = (op.body ?? {}) as { completed?: boolean; value?: number };
  return { trackerId: m[1]!, date: m[2]!, change: { kind: 'save', completed: body.completed, value: body.value } };
}

/** Fresh server data + every change still waiting in the outbox = what the member should see. */
export function withPendingDashboard(data: Dashboard): Dashboard {
  let out = data;
  for (const op of useOutbox.getState().ops) {
    const e = entryChangeOf(op);
    if (e) out = applyToDashboard(out, e.trackerId, e.date, e.change);
  }
  return out;
}

export function withPendingHabitToday(trackerId: string, today: HabitToday, cfg: HabitConfig | undefined): HabitToday {
  if (!cfg) return today;
  let out = today;
  for (const op of useOutbox.getState().ops) {
    const e = entryChangeOf(op);
    if (e && e.trackerId === trackerId && e.date === today.date) out = applyToHabitToday(out, cfg, e.change);
  }
  return out;
}
