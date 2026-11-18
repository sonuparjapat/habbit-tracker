/** Static reference data served to the app via GET /api/meta. */

export const CATEGORIES = [
  { key: 'trading', label: 'Trading & Investing', icon: 'chart-line', color: '#22C55E', description: 'Trade limits, profit targets, stop-loss discipline' },
  { key: 'fitness', label: 'Health & Fitness', icon: 'dumbbell', color: '#F59E0B', description: 'Workouts, steps, water, sleep' },
  { key: 'mind', label: 'Mind & Wellbeing', icon: 'meditation', color: '#7C5CFF', description: 'Meditation, journaling, gratitude' },
  { key: 'money', label: 'Money & Spending', icon: 'wallet-outline', color: '#14B8A6', description: 'Daily budgets, saving, no impulse buys' },
  { key: 'productivity', label: 'Study & Productivity', icon: 'book-open-variant', color: '#4F8BFF', description: 'Deep work, reading, learning' },
  { key: 'quit', label: 'Quit Bad Habits', icon: 'cancel', color: '#F43F5E', description: 'Smoking, alcohol, social media, gambling' },
  { key: 'other', label: 'Something else', icon: 'star-four-points-outline', color: '#EC4899', description: 'Build your own tracker' },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

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
export const MARKET_KEYS = MARKETS.map((m) => m.key);

export const EMOTIONS = [
  'calm', 'focused', 'confident', 'overconfident', 'fomo', 'greedy',
  'fearful', 'anxious', 'revenge', 'bored', 'frustrated', 'satisfied',
];

export const DEFAULT_CHECKLIST = [
  'My setup is clear — this is a plan, not a feeling',
  'Stop-loss is decided before entry',
  'Position size is within my plan',
  'I am not trying to recover a previous loss',
  'I am calm — no FOMO, greed or revenge',
];

export const DEFAULT_SPENDING_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];

/**
 * Default templates, inserted on first start (ON CONFLICT DO NOTHING by slug),
 * so edits made in the admin panel are never overwritten.
 */
export const DEFAULT_TEMPLATES = [
  // Trading
  { slug: 'one-trade-a-day', category: 'trading', type: 'trading', name: 'One trade a day', subtitle: 'Any market · 1 trade · stop at target', icon: 'numeric-1-circle', color: '#22C55E',
    config: { maxTradesPerDay: 1, dailyProfitTarget: 1000, dailyMaxLoss: 1000, stopAfterTarget: true } },
  { slug: 'disciplined-intraday', category: 'trading', type: 'trading', name: 'Disciplined intraday', subtitle: 'Max 3 trades · hard daily loss limit', icon: 'finance', color: '#4F8BFF',
    config: { maxTradesPerDay: 3, dailyProfitTarget: 3000, dailyMaxLoss: 1500, stopAfterTarget: true } },
  { slug: 'crypto-no-revenge', category: 'trading', type: 'trading', name: 'Crypto without revenge', subtitle: '24/7 market · 2 trades · loss limit', icon: 'bitcoin', color: '#F59E0B',
    config: { market: 'crypto', maxTradesPerDay: 2, dailyProfitTarget: 100, dailyMaxLoss: 50, stopAfterTarget: true, tradingDays: [0, 1, 2, 3, 4, 5, 6] } },
  { slug: 'options-scalper', category: 'trading', type: 'trading', name: 'Options scalper limits', subtitle: 'Up to 5 trades · strict stop', icon: 'lightning-bolt', color: '#EC4899',
    config: { market: 'options', maxTradesPerDay: 5, dailyProfitTarget: 2000, dailyMaxLoss: 1000, stopAfterTarget: false } },

  // Fitness
  { slug: 'workout', category: 'fitness', type: 'habit', name: 'Workout', subtitle: 'Move your body', icon: 'dumbbell', color: '#F59E0B', config: { days: [1, 2, 3, 4, 5, 6] } },
  { slug: 'steps', category: 'fitness', type: 'habit', name: 'Daily steps', subtitle: '8,000 steps', icon: 'walk', color: '#22C55E', config: { goalType: 'count', target: 8000, unit: 'steps' } },
  { slug: 'water', category: 'fitness', type: 'habit', name: 'Drink water', subtitle: '8 glasses', icon: 'cup-water', color: '#4F8BFF', config: { goalType: 'count', target: 8, unit: 'glasses' } },
  { slug: 'sleep', category: 'fitness', type: 'habit', name: 'Sleep 7+ hours', subtitle: 'Rest is training too', icon: 'sleep', color: '#7C5CFF', config: { goalType: 'count', target: 7, unit: 'hours' } },

  // Mind
  { slug: 'meditate', category: 'mind', type: 'habit', name: 'Meditate', subtitle: '10 minutes of calm', icon: 'meditation', color: '#7C5CFF', config: { goalType: 'duration', target: 10, unit: 'min' } },
  { slug: 'journal', category: 'mind', type: 'habit', name: 'Journal', subtitle: 'Write a few lines', icon: 'notebook-edit-outline', color: '#14B8A6', config: {} },
  { slug: 'gratitude', category: 'mind', type: 'habit', name: 'Gratitude', subtitle: '3 things you are grateful for', icon: 'heart-outline', color: '#EC4899', config: { goalType: 'count', target: 3, unit: 'things' } },

  // Money
  { slug: 'daily-budget', category: 'money', type: 'spending', name: 'Daily budget', subtitle: 'Set a daily and monthly limit', icon: 'wallet-outline', color: '#14B8A6',
    config: { dailyLimit: 1000, monthlyLimit: 25000 } },
  { slug: 'no-impulse-buys', category: 'money', type: 'habit', name: 'No impulse buys', subtitle: 'Wait 24h before buying', icon: 'cart-off', color: '#F43F5E', config: { kind: 'quit' } },
  { slug: 'save-daily', category: 'money', type: 'habit', name: 'Save something daily', subtitle: 'Small amounts add up', icon: 'piggy-bank-outline', color: '#22C55E', config: {} },

  // Productivity
  { slug: 'deep-work', category: 'productivity', type: 'habit', name: 'Deep work', subtitle: '2 focused hours', icon: 'brain', color: '#4F8BFF', config: { goalType: 'duration', target: 120, unit: 'min', days: [1, 2, 3, 4, 5] } },
  { slug: 'read', category: 'productivity', type: 'habit', name: 'Read', subtitle: '20 pages a day', icon: 'book-open-variant', color: '#14B8A6', config: { goalType: 'count', target: 20, unit: 'pages' } },
  { slug: 'study', category: 'productivity', type: 'habit', name: 'Study', subtitle: '1 hour a day', icon: 'school-outline', color: '#7C5CFF', config: { goalType: 'duration', target: 60, unit: 'min' } },
  { slug: 'wake-early', category: 'productivity', type: 'habit', name: 'Wake up early', subtitle: 'Own your morning', icon: 'weather-sunset-up', color: '#F59E0B', config: {} },

  // Quit
  { slug: 'no-smoking', category: 'quit', type: 'habit', name: 'No smoking', subtitle: 'Every clean day counts', icon: 'smoking-off', color: '#F43F5E', config: { kind: 'quit' } },
  { slug: 'fewer-cigarettes', category: 'quit', type: 'habit', name: 'Cut down cigarettes', subtitle: 'Stay under your daily limit', icon: 'smoking', color: '#F59E0B', config: { kind: 'limit', goalType: 'count', target: 5, unit: 'cigarettes' } },
  { slug: 'social-media-limit', category: 'quit', type: 'habit', name: 'Social media limit', subtitle: 'Under 60 minutes a day', icon: 'cellphone-off', color: '#4F8BFF', config: { kind: 'limit', goalType: 'duration', target: 60, unit: 'min' } },
  { slug: 'no-alcohol', category: 'quit', type: 'habit', name: 'No alcohol', subtitle: 'Clear head, better days', icon: 'glass-cocktail-off', color: '#7C5CFF', config: { kind: 'quit' } },
  { slug: 'no-gambling', category: 'quit', type: 'habit', name: 'No gambling / betting', subtitle: 'Protect your money', icon: 'cards-playing-outline', color: '#EC4899', config: { kind: 'quit' } },
];
