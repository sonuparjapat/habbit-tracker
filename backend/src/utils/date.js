// All "dates" in the app are calendar days as 'YYYY-MM-DD' strings in the user's timezone.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(timeZone) {
  return dateIn(new Date(), timeZone);
}

export function dateIn(instant, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toUtc = (date) => new Date(`${date}T00:00:00Z`);

export function addDays(date, days) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(date) {
  return toUtc(date).getUTCDay();
}

export function daysInMonth(date) {
  const d = toUtc(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function* eachDay(from, to) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** Resolve a named period (or explicit from/to) into an inclusive date range ending today. */
export function resolveRange(today, opts = {}) {
  if (opts.from && opts.to && DATE_RE.test(opts.from) && DATE_RE.test(opts.to) && opts.from <= opts.to) {
    return { from: opts.from, to: opts.to };
  }
  switch (opts.period) {
    case 'week': {
      const wd = weekdayOf(today); // week starts Monday
      return { from: addDays(today, -((wd + 6) % 7)), to: today };
    }
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'all':
      return { from: '2000-01-01', to: today };
    case 'month':
    default:
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}
