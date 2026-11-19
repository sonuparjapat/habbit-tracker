import { DEFAULT_CHECKLIST, DEFAULT_SPENDING_CATEGORIES } from './catalog';
import type { HabitConfig, SpendingConfig, TradingConfig, TrackerType } from './types';

export const defaultTradingConfig: TradingConfig = {
  market: 'stocks',
  instrument: '',
  capital: 0,
  maxTradesPerDay: 1,
  dailyProfitTarget: 0,
  dailyMaxLoss: 0,
  stopAfterTarget: true,
  weeklyMaxLoss: 0,
  monthlyMaxLoss: 0,
  maxLossPerTrade: 0,
  coolOffLoss: 0,
  coolOffDays: 1,
  tiltLosses: 2,
  tiltPauseMinutes: 30,
  tradingDays: [1, 2, 3, 4, 5],
  checklist: DEFAULT_CHECKLIST,
  customRules: [],
  cooldownSeconds: 60,
  preMarketReminder: null,
  journalReminder: null,
  why: '',
};

export const defaultHabitConfig: HabitConfig = {
  kind: 'build',
  goalType: 'boolean',
  target: 1,
  unit: '',
  days: [0, 1, 2, 3, 4, 5, 6],
  reminderTime: null,
  why: '',
};

export const defaultSpendingConfig: SpendingConfig = {
  dailyLimit: 0,
  monthlyLimit: 0,
  categories: DEFAULT_SPENDING_CATEGORIES,
  noSpendDays: [],
  reminderTime: null,
  why: '',
};

export function defaultConfigFor(type: TrackerType, overrides: object = {}) {
  const base = type === 'trading' ? defaultTradingConfig : type === 'spending' ? defaultSpendingConfig : defaultHabitConfig;
  return { ...base, ...overrides };
}
