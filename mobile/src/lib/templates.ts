import type { HabitConfig, TradingConfig } from './types';

export const DEFAULT_CHECKLIST = [
  'My setup is clear — this is a plan, not a feeling',
  'Stop-loss is decided before entry',
  'Position size is within my plan',
  'I am not trying to recover a previous loss',
  'I am calm — no FOMO, greed or revenge',
];

export const defaultTradingConfig: TradingConfig = {
  instrument: 'NIFTY 50',
  capital: 0,
  maxTradesPerDay: 1,
  dailyProfitTarget: 1000,
  dailyMaxLoss: 1000,
  stopAfterTarget: true,
  tradingDays: [1, 2, 3, 4, 5],
  checklist: DEFAULT_CHECKLIST,
  customRules: [],
  cooldownSeconds: 60,
  preMarketReminder: '09:00',
  journalReminder: '15:45',
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

export interface Template {
  id: string;
  type: 'habit' | 'trading';
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  config: Partial<HabitConfig> | Partial<TradingConfig>;
}

export const TEMPLATES: Template[] = [
  {
    id: 'one-trade',
    type: 'trading',
    name: 'One Trade a Day',
    subtitle: 'Nifty 50 · 1 trade · stop at target',
    icon: 'chart-line',
    color: '#22C55E',
    config: { maxTradesPerDay: 1, dailyProfitTarget: 1000, dailyMaxLoss: 1000, stopAfterTarget: true },
  },
  {
    id: 'disciplined-intraday',
    type: 'trading',
    name: 'Disciplined Intraday',
    subtitle: 'Max 3 trades · hard loss limit',
    icon: 'finance',
    color: '#4F8BFF',
    config: { maxTradesPerDay: 3, dailyProfitTarget: 3000, dailyMaxLoss: 1500, stopAfterTarget: true },
  },
  {
    id: 'meditate',
    type: 'habit',
    name: 'Meditate',
    subtitle: '10 minutes a day — calm mind, calm trades',
    icon: 'meditation',
    color: '#7C5CFF',
    config: { goalType: 'duration', target: 10, unit: 'min' },
  },
  {
    id: 'no-screens',
    type: 'habit',
    name: 'No charts after target',
    subtitle: 'Quit habit · close the terminal once done',
    icon: 'monitor-off',
    color: '#F43F5E',
    config: { kind: 'quit', days: [1, 2, 3, 4, 5] },
  },
  {
    id: 'workout',
    type: 'habit',
    name: 'Workout',
    subtitle: 'Move your body every day',
    icon: 'dumbbell',
    color: '#F59E0B',
    config: { goalType: 'boolean' },
  },
  {
    id: 'read',
    type: 'habit',
    name: 'Read',
    subtitle: '20 pages a day',
    icon: 'book-open-variant',
    color: '#14B8A6',
    config: { goalType: 'count', target: 20, unit: 'pages' },
  },
  {
    id: 'water',
    type: 'habit',
    name: 'Drink water',
    subtitle: '8 glasses',
    icon: 'cup-water',
    color: '#4F8BFF',
    config: { goalType: 'count', target: 8, unit: 'glasses' },
  },
  {
    id: 'wake',
    type: 'habit',
    name: 'Wake up early',
    subtitle: 'Before 6 AM',
    icon: 'weather-sunset-up',
    color: '#EC4899',
    config: { goalType: 'boolean' },
  },
];

export const ICONS = [
  'target',
  'chart-line',
  'finance',
  'meditation',
  'dumbbell',
  'book-open-variant',
  'cup-water',
  'weather-sunset-up',
  'monitor-off',
  'run',
  'sleep',
  'food-apple',
  'smoking-off',
  'cellphone-off',
  'pencil',
  'heart-pulse',
  'brain',
  'cash',
  'shield-check',
  'fire',
] as const;
