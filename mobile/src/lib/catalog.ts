import type { Category, CategoryKey } from './types';

/** Mirrors the server catalog so the app works before the first network call. */
export const CATEGORIES: Category[] = [
  { key: 'fitness', label: 'Health & Fitness', icon: 'dumbbell', color: '#F59E0B', description: 'Workouts, steps, water, sleep' },
  { key: 'mind', label: 'Mind & Wellbeing', icon: 'meditation', color: '#7C5CFF', description: 'Meditation, journaling, gratitude' },
  { key: 'money', label: 'Money & Spending', icon: 'wallet-outline', color: '#14B8A6', description: 'Daily budgets, saving, no impulse buys' },
  { key: 'productivity', label: 'Study & Productivity', icon: 'book-open-variant', color: '#4F8BFF', description: 'Deep work, reading, learning' },
  { key: 'quit', label: 'Quit Bad Habits', icon: 'cancel', color: '#F43F5E', description: 'Smoking, alcohol, social media, gambling' },
  { key: 'trading', label: 'Trading & Investing', icon: 'chart-line', color: '#22C55E', description: 'Trade limits, profit targets, stop-loss discipline' },
  { key: 'other', label: 'Something else', icon: 'star-four-points-outline', color: '#EC4899', description: 'Build your own tracker' },
];

export const categoryOf = (key: string | undefined) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1]!;

export const MARKETS = [
  { key: 'stocks', label: 'Stocks' },
  { key: 'index', label: 'Index' },
  { key: 'options', label: 'Options' },
  { key: 'futures', label: 'Futures' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'forex', label: 'Forex' },
  { key: 'commodities', label: 'Commodities' },
  { key: 'other', label: 'Other' },
];

export const DEFAULT_CHECKLIST = [
  'My setup is clear — this is a plan, not a feeling',
  'Stop-loss is decided before entry',
  'Position size is within my plan',
  'I am not trying to recover a previous loss',
  'I am calm — no FOMO, greed or revenge',
];

export const DEFAULT_SPENDING_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];

export const ICONS = [
  'target', 'chart-line', 'finance', 'bitcoin', 'numeric-1-circle', 'lightning-bolt', 'dumbbell', 'walk', 'run',
  'cup-water', 'sleep', 'food-apple', 'meditation', 'heart-outline', 'notebook-edit-outline', 'brain',
  'book-open-variant', 'school-outline', 'weather-sunset-up', 'wallet-outline', 'piggy-bank-outline', 'cart-off',
  'smoking-off', 'cellphone-off', 'glass-cocktail-off', 'cards-playing-outline', 'monitor-off', 'shield-check',
  'fire', 'star-four-points-outline',
] as const;

export type { CategoryKey };
