/**
 * Language: the app sends "X-App-Language: hi" when the member uses Hindi. Then every JSON reply
 * (including errors) has its server-written text translated using src/i18n/hi.js.
 *
 * Only display fields are translated (title, message, description, label, name, subtitle…) — never
 * notes, journals, answers, emails or anything else the member wrote, and English replies are untouched.
 * The admin website never sends the header, so the admin panel always stays in English.
 */
import { EXACT, PATTERNS } from '../i18n/hi.js';

const FIELDS = new Set(['title', 'message', 'description', 'label', 'name', 'subtitle', 'taunt', 'levelName', 'day', 'weekday', 'error']);
// Never look inside these (member-written or private content)
const SKIP = new Set(['note', 'reflection', 'answers', 'email', 'why', 'reason', 'checklist', 'checklistDone', 'config', 'user']);

export function translateText(text) {
  if (typeof text !== 'string' || !text) return text;
  const exact = EXACT[text];
  if (exact) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const out = fn(...m);
      if (out) return out;
    }
  }
  return text;
}

function translateDeep(value, key) {
  if (Array.isArray(value)) return value.map((v) => translateDeep(v, key));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SKIP.has(k) ? v : translateDeep(v, k);
    return out;
  }
  return typeof value === 'string' && FIELDS.has(key) ? translateText(value) : value;
}

export function localize(req, res, next) {
  if (String(req.headers['x-app-language'] ?? '').toLowerCase() !== 'hi') return next();
  const json = res.json.bind(res);
  res.json = (body) => json(translateDeep(body, null));
  next();
}
