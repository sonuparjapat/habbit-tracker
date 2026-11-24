/**
 * Admin-managed settings.
 *
 * To add a setting: add one entry to SETTINGS. That's it —
 *  - the admin panel (Settings page) renders an input for it automatically,
 *  - it is validated by its `type`,
 *  - `public: true` settings are sent to the app and website via GET /api/config.
 *
 * Only values changed by an admin are stored (table app_settings); everything else uses `default`.
 */
import { z } from 'zod';
import { query } from '../db/pool.js';

const DEFAULT_QUOTES = [
  'Discipline is choosing between what you want now and what you want most.',
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  'Small promises, kept daily, build unshakable self-trust.',
  'The goal is not to do more. The goal is to do what you said you would.',
  'Hitting your target is the signal to stop, not to start.',
  'Motivation gets you started. Habit keeps you going.',
  'Every time you keep a rule, you vote for the person you want to become.',
];

/** type: string | text | url | email | boolean | number | list */
export const SETTINGS = {
  // General
  support_email: { group: 'General', label: 'Support email', type: 'email', default: '', public: true, description: 'Shown in the app (Profile → Help & support) and on the website’s legal pages.' },
  website_url: { group: 'General', label: 'Website URL', type: 'url', default: '', public: true, description: 'Your public website, e.g. https://yourdomain.com. The app links to /privacy and /terms on it.' },
  play_store_url: { group: 'General', label: 'Google Play link', type: 'url', default: '', public: true, description: 'Shown on the website once the app is live.' },

  // Access
  signups_enabled: { group: 'Access', label: 'Allow new sign-ups', type: 'boolean', default: true, public: true, description: 'Turn off to stop new accounts (existing users can still sign in).' },
  maintenance_mode: { group: 'Access', label: 'Maintenance mode', type: 'boolean', default: false, public: true, description: 'Users see a maintenance screen. Admins can still use the admin panel.' },
  maintenance_message: { group: 'Access', label: 'Maintenance message', type: 'text', default: 'We’re making Holdfast better. We’ll be back shortly.', public: true },

  // App versions
  min_app_version: { group: 'App versions', label: 'Minimum app version', type: 'string', default: '1.0.0', public: true, description: 'Apps older than this must update before they can be used (e.g. after a breaking change).' },
  latest_app_version: { group: 'App versions', label: 'Latest app version', type: 'string', default: '1.0.0', public: true, description: 'Apps older than this see an optional “Update available” banner.' },

  // Features
  feature_trading: { group: 'Features', label: 'Trading trackers', type: 'boolean', default: true, public: true, description: 'Show the Trading & Investing category in the app.' },
  feature_spending: { group: 'Features', label: 'Budget trackers', type: 'boolean', default: true, public: true, description: 'Show spending budgets in the app.' },
  feature_gamification: { group: 'Features', label: 'XP, levels & badges', type: 'boolean', default: true, public: true },
  ads_enabled: { group: 'Features', label: 'Show ads', type: 'boolean', default: false, public: true, description: 'Only works once AdMob is set up in the app build.' },

  // Streak shields (see services/habitStats.js)
  streak_shields_enabled: {
    group: 'Streak shields',
    label: 'Streak shields',
    type: 'boolean',
    default: true,
    public: true,
    description: 'Members earn a shield for keeping a streak; a missed day uses one instead of resetting the streak.',
  },
  shield_every_days: { group: 'Streak shields', label: 'Earn a shield every … days in a row', type: 'number', default: 7, min: 2, max: 60, public: true },
  shield_max: { group: 'Streak shields', label: 'Most shields a member can hold (per habit)', type: 'number', default: 3, min: 1, max: 10, public: true },

  // Security (see services/security.js)
  security_lock_after: {
    group: 'Security',
    label: 'Lock an account after this many wrong passwords in a row',
    type: 'number',
    default: 8,
    min: 3,
    max: 50,
    public: false,
    description: 'The owner gets an email with a code to unlock it (or can reset the password).',
  },
  security_ip_block_after: {
    group: 'Security',
    label: 'Block an IP after this many failed sign-ins in 15 minutes',
    type: 'number',
    default: 50,
    min: 10,
    max: 1000,
    public: false,
    description: 'Counts failures on all accounts. Keep it high: many people can share one mobile-network IP.',
  },
  security_ip_block_minutes: { group: 'Security', label: 'Automatic IP block lasts (minutes)', type: 'number', default: 60, min: 5, max: 1440, public: false },

  // Evening check-in (see services/nudges.js)
  nudge_enabled: {
    group: 'Evening check-in',
    label: 'Evening check-in',
    type: 'boolean',
    default: true,
    public: true,
    description: 'Nudges members who opted in and missed a tracker with a reminder today. Members who already logged are never disturbed.',
  },
  nudge_hour: {
    group: 'Evening check-in',
    label: 'Check at (hour, member’s local time)',
    type: 'number',
    default: 20,
    min: 0,
    max: 23,
    public: true,
    description: '20 = 8 PM. Each member is checked once a day, at this hour in their own timezone.',
  },
  nudge_email_enabled: { group: 'Evening check-in', label: 'Also send email nudges', type: 'boolean', default: true, public: false, description: 'Only to verified emails of members who switched email nudges on.' },

  // Look & feel
  hindi_enabled: {
    group: 'Look & feel',
    label: 'Hindi language (हिन्दी)',
    type: 'boolean',
    default: false,
    public: true,
    description: 'Off: everyone sees English and the language choice is hidden. On: members can pick हिन्दी on the first screen and in Profile.',
  },
  default_theme: {
    group: 'Look & feel',
    label: 'Default app theme',
    type: 'select',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light' },
      { value: 'system', label: 'Follow the phone setting' },
    ],
    default: 'dark',
    public: true,
    description: 'Used until a member picks their own theme in Profile → Appearance.',
  },

  // Onboarding tour (shown once to every new member; replayable from Profile)
  tour_enabled: { group: 'Onboarding tour', label: 'Show app tour to new members', type: 'boolean', default: true, public: true },
  tour_steps: {
    group: 'Onboarding tour',
    label: 'Tour steps',
    type: 'list',
    public: true,
    description: 'One step per line, written as:  emoji | title | text',
    default: [
      '👋 | Welcome to Holdfast | This is where you build habits that stick and break the ones that don’t. Here’s how it works in 30 seconds.',
      '🎯 | Pick what you want to change | Tap + to add a tracker — a workout, reading, quitting smoking, a daily budget, trading limits, or your own.',
      '✅ | Check in every day | Tap a habit when it’s done. Each day you show up grows your streak 🔥 — miss one and it resets.',
      '🛡️ | Set limits that hold you back | Daily limits, budgets and trading rules. Try to cross them and Holdfast stops you first.',
      '🏆 | Earn XP, levels & badges | Every kept promise earns XP. Breaking a rule costs you. Watch yourself level up.',
      '📊 | See the truth | Weekly and monthly reports show your best days, weak spots and what’s really working.',
    ],
  },

  // Content
  daily_quotes: { group: 'Content', label: 'Daily quotes', type: 'list', default: DEFAULT_QUOTES, public: true, description: 'One is shown on the Today screen each day. One quote per line.' },

  // Game (XP awarded per action)
  xp_habit_day: { group: 'Game', label: 'XP per completed habit day', type: 'number', default: 10, public: true },
  xp_clean_trade: { group: 'Game', label: 'XP per trade within the rules', type: 'number', default: 10, public: true },
  xp_journal: { group: 'Game', label: 'XP per journal entry', type: 'number', default: 5, public: true },
  xp_expense: { group: 'Game', label: 'XP per expense logged within budget', type: 'number', default: 3, public: true },
  xp_rule_break: { group: 'Game', label: 'XP lost per rule break', type: 'number', default: 15, public: true },
  xp_achievement: { group: 'Game', label: 'XP per achievement unlocked', type: 'number', default: 50, public: true },
  xp_weekly_review: { group: 'Game', label: 'XP per weekly review written', type: 'number', default: 20, public: true },
  xp_referral: { group: 'Game', label: 'XP per friend who joins with your invite', type: 'number', default: 100, public: true },
  weekly_review_enabled: { group: 'Features', label: 'Sunday weekly review', type: 'boolean', default: true, public: true },
  rating_prompt_enabled: {
    group: 'Features',
    label: 'Ask happy members to rate the app',
    type: 'boolean',
    default: true,
    public: true,
    description: 'Shown at most once every 2 months, only right after a win (a 7-day streak, a level-up, a boss beaten).',
  },
  focus_timer_enabled: { group: 'Features', label: 'Focus timer', type: 'boolean', default: true, public: true },

  // Limits
  max_trackers_per_member: { group: 'Limits', label: 'Max trackers per member', type: 'number', default: 50, public: false, min: 1, max: 500 },
};

function schemaFor(def) {
  switch (def.type) {
    case 'boolean':
      return z.boolean();
    case 'number':
      return z.number().int().min(def.min ?? 0).max(def.max ?? 1_000_000);
    case 'email':
      return z.union([z.literal(''), z.email('Enter a valid email')]);
    case 'url':
      return z.union([z.literal(''), z.url('Enter a full URL starting with https://')]);
    case 'select':
      return z.enum(def.options.map((o) => o.value), { error: 'Pick one of the options' });
    case 'list':
      return z.array(z.string().trim().min(1).max(500)).max(200);
    case 'text':
      return z.string().max(2000);
    case 'string':
    default:
      return z.string().max(200);
  }
}

/** Validate one setting value; throws a ZodError with a readable message. */
export function validateSetting(key, value) {
  const def = SETTINGS[key];
  if (!def) throw new Error(`Unknown setting: ${key}`);
  if (key.endsWith('_app_version') && !/^\d+\.\d+\.\d+$/.test(String(value))) throw new Error('Use a version like 1.2.0');
  return schemaFor(def).parse(value);
}

/* ------------------------------ Cached reads ------------------------------ */

const TTL_MS = 15_000;
let cache = null;
let cachedAt = 0;

export async function getSettings() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const { rows } = await query('SELECT key, value FROM app_settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = {};
  for (const [key, def] of Object.entries(SETTINGS)) merged[key] = key in stored ? stored[key] : def.default;
  cache = merged;
  cachedAt = Date.now();
  return merged;
}

export const invalidateSettings = () => {
  cache = null;
};

export async function getPublicSettings() {
  const all = await getSettings();
  return Object.fromEntries(Object.entries(SETTINGS).filter(([, d]) => d.public).map(([k]) => [k, all[k]]));
}

/** Save changed values (validated). Returns the keys that changed. */
export async function saveSettings(values, actorId) {
  const changed = [];
  for (const [key, raw] of Object.entries(values)) {
    const value = validateSetting(key, raw);
    await query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), actorId],
    );
    changed.push(key);
  }
  invalidateSettings();
  return changed;
}

export async function resetSetting(key) {
  await query('DELETE FROM app_settings WHERE key = $1', [key]);
  invalidateSettings();
}
