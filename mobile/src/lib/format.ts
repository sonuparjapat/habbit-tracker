export function money(amount: number, currency = 'INR', opts: { sign?: boolean; compact?: boolean } = {}) {
  const abs = Math.abs(amount);
  let str: string;
  try {
    str = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: opts.compact && abs >= 1000 ? 1 : 0,
      notation: opts.compact && abs >= 100000 ? 'compact' : 'standard',
    }).format(abs);
  } catch {
    str = abs.toFixed(0);
  }
  if (amount < 0) return `-${str}`;
  if (opts.sign && amount > 0) return `+${str}`;
  return str;
}

export function pnlColor(n: number, colors: { green: string; red: string; textMuted: string }) {
  return n > 0 ? colors.green : n < 0 ? colors.red : colors.textMuted;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parse = (d: string) => new Date(`${d}T00:00:00Z`);

export function shortDate(d: string) {
  const x = parse(d);
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
}

export function longDate(d: string) {
  const x = parse(d);
  return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
}

export function addDays(d: string, n: number) {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function weekdayOf(d: string) {
  return parse(d).getUTCDay();
}

export function localToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
