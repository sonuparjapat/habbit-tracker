import { z } from 'zod';
import { DEFAULT_CHECKLIST, DEFAULT_SPENDING_CATEGORIES, EMOTIONS, MARKET_KEYS } from './catalog.js';

export { EMOTIONS };
export const RISKY_EMOTIONS = ['overconfident', 'fomo', 'greedy', 'revenge', 'bored', 'frustrated'];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const weekdays = z.array(z.number().int().min(0).max(6));
const money = z.number().nonnegative().max(1e12);

export const habitConfigSchema = z.object({
  /**
   * build : do it (gym, read)       -> done when value >= target
   * quit  : avoid it (no smoking)   -> check in each clean day
   * limit : stay under (≤ 5 cigs)    -> done when logged value <= target
   */
  kind: z.enum(['build', 'quit', 'limit']).default('build'),
  goalType: z.enum(['boolean', 'count', 'duration']).default('boolean'),
  target: z.number().positive().max(1e7).default(1),
  unit: z.string().max(20).default(''),
  days: weekdays.min(1).default([0, 1, 2, 3, 4, 5, 6]),
  reminderTime: time.nullable().default(null),
  why: z.string().max(280).default(''),
});

export const tradingConfigSchema = z.object({
  market: z.enum(MARKET_KEYS).default('stocks'),
  instrument: z.string().max(40).default(''),
  capital: money.default(0),
  maxTradesPerDay: z.number().int().min(1).max(100).default(1),
  /** 0 = no target */
  dailyProfitTarget: money.default(0),
  /** 0 = no loss limit */
  dailyMaxLoss: money.default(0),
  stopAfterTarget: z.boolean().default(true),
  /* Protection (0 = off) */
  weeklyMaxLoss: money.default(0),
  monthlyMaxLoss: money.default(0),
  /** A single trade losing more than this is a rule break ("no stop-loss") */
  maxLossPerTrade: money.default(0),
  /** A day losing this much locks the next `coolOffDays` day(s) */
  coolOffLoss: money.default(0),
  coolOffDays: z.number().int().min(1).max(14).default(1),
  /** After this many losing trades in a row, a forced pause (0 = off) */
  tiltLosses: z.number().int().min(0).max(10).default(2),
  tiltPauseMinutes: z.number().int().min(5).max(240).default(30),
  tradingDays: weekdays.default([1, 2, 3, 4, 5]),
  checklist: z.array(z.string().min(1).max(120)).max(15).default(DEFAULT_CHECKLIST),
  customRules: z.array(z.string().min(1).max(160)).max(20).default([]),
  /** Forced pause (seconds) before the user may override a locked day */
  cooldownSeconds: z.number().int().min(0).max(900).default(60),
  preMarketReminder: time.nullable().default(null),
  journalReminder: time.nullable().default(null),
  why: z.string().max(280).default(''),
});

export const spendingConfigSchema = z.object({
  /** 0 = no limit */
  dailyLimit: money.default(0),
  monthlyLimit: money.default(0),
  categories: z.array(z.string().min(1).max(30)).min(1).max(30).default(DEFAULT_SPENDING_CATEGORIES),
  /** Weekdays the user wants to spend nothing (no-spend days) */
  noSpendDays: weekdays.default([]),
  reminderTime: time.nullable().default(null),
  why: z.string().max(280).default(''),
});

const schemas = { habit: habitConfigSchema, trading: tradingConfigSchema, spending: spendingConfigSchema };

/** Parse stored/incoming config, filling defaults. Throws ZodError if invalid. */
export function parseConfig(type, raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return schemas[type].parse(input);
}
