export type Level = 'danger' | 'warning' | 'success' | 'info';

export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
}

export interface HabitConfig {
  kind: 'build' | 'quit';
  goalType: 'boolean' | 'count' | 'duration';
  target: number;
  unit: string;
  days: number[];
  reminderTime: string | null;
  why: string;
}

export interface TradingConfig {
  instrument: string;
  capital: number;
  maxTradesPerDay: number;
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  stopAfterTarget: boolean;
  tradingDays: number[];
  checklist: string[];
  customRules: string[];
  cooldownSeconds: number;
  preMarketReminder: string | null;
  journalReminder: string | null;
  why: string;
}

interface TrackerBase {
  id: string;
  name: string;
  icon: string;
  color: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
}
export type HabitTracker = TrackerBase & { type: 'habit'; config: HabitConfig };
export type TradingTracker = TrackerBase & { type: 'trading'; config: TradingConfig };
export type Tracker = HabitTracker | TradingTracker;

export interface Insight {
  level: Level;
  title: string;
  message: string;
}

export interface DayStatus {
  date: string;
  trades: number;
  netPnl: number;
  maxTrades: number;
  remainingTrades: number;
  profitTarget: number;
  maxLoss: number;
  targetHit: boolean;
  lossLimitHit: boolean;
  tradeLimitHit: boolean;
  isTradingDay: boolean;
  locked: boolean;
  lockReasons: { rule: string; message: string }[];
  progress: number;
}

export interface TradingToday {
  status: DayStatus;
  streaks: { currentClean: number; bestClean: number; currentGreen: number; currentRed: number; activeDays: number };
  breaksToday: number;
  breaksLast7Days: number;
  journalDone: boolean;
  alerts: Insight[];
}

export interface HabitToday {
  date: string;
  scheduledToday: boolean;
  completedToday: boolean;
  valueToday: number;
  currentStreak: number;
  bestStreak: number;
}

export type DashboardCard =
  | { tracker: HabitTracker; today: HabitToday }
  | { tracker: TradingTracker; today: TradingToday };

export interface Dashboard {
  date: string;
  user: { name: string; currency: string };
  summary: { habitsDue: number; habitsDone: number; ruleBreaksToday: number; dayScore: number };
  cards: DashboardCard[];
}

export interface RuleBreak {
  rule: string;
  label?: string;
  description: string;
  reason: string | null;
}

export interface Trade {
  id: string;
  tradeDate: string;
  tradedAt: string;
  instrument: string;
  direction: 'long' | 'short' | null;
  quantity: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number;
  fees: number;
  net: number;
  emotionBefore: string | null;
  emotionAfter: string | null;
  setup: string | null;
  followedPlan: boolean;
  checklistDone: string[];
  note: string | null;
  isRuleBreak: boolean;
  breaks: RuleBreak[];
}

export interface TradingStats {
  range: { from: string; to: string };
  summary: {
    netPnl: number;
    grossProfit: number;
    grossLoss: number;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number | null;
    expectancy: number;
    daysTraded: number;
    greenDays: number;
    redDays: number;
    targetHitDays: number;
    avgTradesPerDay: number;
    bestDay: { date: string; pnl: number } | null;
    worstDay: { date: string; pnl: number } | null;
    maxDrawdown: number;
  };
  discipline: {
    score: number | null;
    ruleBreaks: number;
    cleanDays: number;
    activeDays: number;
    disciplinedPnl: number;
    undisciplinedPnl: number;
    breakdown: { rule: string; label: string; count: number }[];
    afterLockPnl: { afterTarget: number; overtrading: number; revenge: number };
  };
  daily: {
    date: string;
    pnl: number;
    trades: number;
    breaks: number;
    score: number;
    cumulative: number;
    disciplinedCumulative: number;
  }[];
  byEmotion: { emotion: string; trades: number; pnl: number; winRate: number; breaks: number }[];
  byWeekday: { weekday: string; pnl: number; trades: number; breaks: number }[];
  insights: Insight[];
}

export interface HabitStats {
  range: { from: string; to: string };
  currentStreak: number;
  bestStreak: number;
  completionRate: number | null;
  completedDays: number;
  scheduledDays: number;
  totalValue: number;
  avgMood: number | null;
  byWeekday: { weekday: string; rate: number | null }[];
  series: { date: string; value: number; completed: boolean; scheduled: boolean }[];
}

export interface Entry {
  date: string;
  value: number;
  completed: boolean;
  mood: number | null;
  note: string | null;
  reflection: { wentWell?: string; mistakes?: string; lesson?: string; marketView?: string; followedPlan?: boolean };
}

export const EMOTIONS = [
  { key: 'calm', label: 'Calm', emoji: '😌', risky: false },
  { key: 'focused', label: 'Focused', emoji: '🎯', risky: false },
  { key: 'confident', label: 'Confident', emoji: '💪', risky: false },
  { key: 'overconfident', label: 'Overconfident', emoji: '😎', risky: true },
  { key: 'fomo', label: 'FOMO', emoji: '😰', risky: true },
  { key: 'greedy', label: 'Greedy', emoji: '🤑', risky: true },
  { key: 'fearful', label: 'Fearful', emoji: '😨', risky: false },
  { key: 'anxious', label: 'Anxious', emoji: '😬', risky: false },
  { key: 'revenge', label: 'Revenge', emoji: '😤', risky: true },
  { key: 'bored', label: 'Bored', emoji: '🥱', risky: true },
  { key: 'frustrated', label: 'Frustrated', emoji: '😣', risky: true },
  { key: 'satisfied', label: 'Satisfied', emoji: '😊', risky: false },
] as const;
export type EmotionKey = (typeof EMOTIONS)[number]['key'];
export const emotionOf = (key: string | null | undefined) => EMOTIONS.find((e) => e.key === key);
