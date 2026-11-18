import { addDays, eachDay, weekdayOf } from '../utils/date.js';

/** Is a day "done" for this habit? */
export function isComplete(cfg, value, completedFlag, hasEntry = true) {
  if (cfg.kind === 'limit') return hasEntry && value <= cfg.target; // stayed under the limit
  if (cfg.kind === 'quit' || cfg.goalType === 'boolean') return completedFlag;
  return value >= cfg.target;
}

/**
 * Streaks count consecutive *scheduled* days. Unscheduled days are skipped.
 * Today never breaks a streak until it's over.
 */
export function habitStreaks(cfg, doneDates, startDate, today) {
  const scheduled = (d) => cfg.days.includes(weekdayOf(d));
  let current = 0;
  for (let d = today; d >= startDate; d = addDays(d, -1)) {
    if (!scheduled(d)) continue;
    if (doneDates.has(d)) current++;
    else if (d === today) continue;
    else break;
  }
  let best = 0;
  let run = 0;
  for (const d of eachDay(startDate, today)) {
    if (!scheduled(d)) continue;
    if (doneDates.has(d)) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  return { current, best };
}

export function computeHabitStats(cfg, range, createdDate, today, entries, allDoneDates) {
  const from = range.from < createdDate ? createdDate : range.from;
  const to = range.to > today ? today : range.to;
  const byDate = new Map(entries.map((e) => [e.entry_date, e]));

  const series = [];
  let scheduledDays = 0;
  let completedDays = 0;
  const weekday = Array.from({ length: 7 }, () => ({ scheduled: 0, done: 0 }));

  if (from <= to) {
    for (const d of eachDay(from, to)) {
      const scheduled = cfg.days.includes(weekdayOf(d));
      const e = byDate.get(d);
      const completed = Boolean(e?.completed);
      series.push({ date: d, value: e?.value ?? 0, completed, scheduled, logged: Boolean(e) });
      if (scheduled && (d !== today || completed)) {
        scheduledDays++;
        weekday[weekdayOf(d)].scheduled++;
        if (completed) {
          completedDays++;
          weekday[weekdayOf(d)].done++;
        }
      }
    }
  }

  const moods = entries.filter((e) => e.mood != null).map((e) => e.mood);
  const values = entries.map((e) => Number(e.value || 0));
  const streaks = habitStreaks(cfg, allDoneDates, createdDate, today);
  const rate = scheduledDays ? Math.round((completedDays / scheduledDays) * 100) : null;

  const insights = [];
  if (streaks.current >= 7) insights.push({ level: 'success', title: `${streaks.current}-day streak`, message: 'A week or more in a row. This is becoming who you are.' });
  if (rate !== null && rate < 50 && scheduledDays >= 7)
    insights.push({ level: 'warning', title: 'Make it easier', message: 'You are completing less than half of your days. Lower the target or schedule fewer days — consistency beats intensity.' });
  const wd = weekday.map((w, i) => ({ i, rate: w.scheduled >= 2 ? w.done / w.scheduled : null })).filter((w) => w.rate !== null);
  if (wd.length >= 3) {
    const worst = wd.sort((a, b) => a.rate - b.rate)[0];
    if (worst.rate < 0.5)
      insights.push({ level: 'info', title: `${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][worst.i]} are your weak spot`, message: 'Plan that day in advance — set a reminder or a smaller goal.' });
  }

  return {
    range: { from, to },
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    completionRate: rate,
    completedDays,
    scheduledDays,
    totalValue: values.reduce((s, v) => s + v, 0),
    avgValue: values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null,
    avgMood: moods.length ? Math.round((moods.reduce((s, m) => s + m, 0) / moods.length) * 10) / 10 : null,
    byWeekday: weekday.map((w, i) => ({
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      rate: w.scheduled ? Math.round((w.done / w.scheduled) * 100) : null,
    })),
    series,
    insights,
  };
}
