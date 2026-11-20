/** Small helpers shared by the test files. */

/** Filled in by run.js: the API address and every email "sent" during the tests. */
export const captured = { base: '', emails: [] };

/** Call the API. Returns { status, body }. */
export function api(method, path, body, token) {
  return apiFrom(null, method, path, body, token);
}

/** Like api(), but as if the request came from `ip` (the API trusts one proxy hop, like on Render). */
export async function apiFrom(ip, method, path, body, token) {
  const res = await fetch(captured.base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export const TZ = 'Asia/Kolkata';
export const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** 'YYYY-MM-DD' n days before today. */
export function daysAgo(n) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for today. */
export const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();

let counter = 0;
/** A unique email for this test run. */
export const uniqueEmail = (prefix = 'user') => `${prefix}${Date.now()}${counter++}@test.local`;

/** Sign up a new member; returns { token, user, email, password }. */
export async function register(name = 'Tester', extra = {}) {
  const email = uniqueEmail(name.toLowerCase().replace(/\W/g, ''));
  const password = 'Steady-Habit-42';
  // Each test member signs up from its own (simulated) network — the real limit is 30 sign-ups per IP per hour
  const ip = `100.64.${Math.floor(counter / 250)}.${(counter % 250) + 1}`;
  const r = await apiFrom(ip, 'POST', '/auth/register', { name, email, password, acceptTerms: true, timezone: TZ, currency: 'INR', ...extra });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.token, user: r.body.user, email, password };
}

let logins = 0;
/** Sign in. Each call comes from its own (simulated) network — the real limit is 10 tries per account per IP in 15 min. */
export async function login(email, password) {
  logins++;
  const r = await apiFrom(`100.65.${Math.floor(logins / 250)}.${(logins % 250) + 1}`, 'POST', '/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body; // { token, user }
}

/** The latest 6-digit code emailed to this address. */
export function lastCode(email) {
  for (let i = captured.emails.length - 1; i >= 0; i--) {
    const text = captured.emails[i];
    if (text.includes(`to=${email}`)) return text.match(/\b(\d{6})\b/)?.[1];
  }
  return undefined;
}

/** Wait a moment (emails are sent right after the reply). */
export const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
