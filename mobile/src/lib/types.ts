export type Level = 'danger' | 'warning' | 'success' | 'info';
export type TrackerType = 'habit' | 'trading' | 'spending';
export type CategoryKey = 'trading' | 'fitness' | 'mind' | 'money' | 'productivity' | 'quit' | 'other';

export interface User {
  id: string;
  email: string;
  name: string;
  /** 1 = super admin, 2 = admin, 3 = user */
  role: 1 | 2 | 3;
  roleName: 'super_admin' | 'admin' | 'user';
  isAdmin: boolean;
  timezone: string;
  currency: string;
  interests: CategoryKey[];
  marketingOptIn: boolean;
  emailVerified: boolean;
  termsOutdated: boolean;
}

export interface Category {
  key: CategoryKey;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export interface Meta {
  appName: string;
  termsVersion: string;
  categories: Category[];
  markets: { key: string; label: string }[];
  emotions: string[];
}

export interface Template {
  slug: string;
  category: CategoryKey;
  type: TrackerType;
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  config: Record<string, unknown>;
}

export interface HabitConfig {
  kind: 'build' | 'quit' | 'limit';
  goalType: 'boolean' | 'count' | 'duration';
  target: number;
  unit: string;
  days: number[];
  reminderTime: string | null;
  why: string;
  /** quit / limit: what one bad day costs — powers the "money saved" game (0 = not set) */
  costPerDay: number;
}

export interface TradingConfig {
  market: string;
  instrument: string;
  capital: number;
  maxTradesPerDay: number;
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  stopAfterTarget: boolean;
  weeklyMaxLoss: number;
  monthlyMaxLoss: number;
  maxLossPerTrade: number;
  coolOffLoss: number;
  coolOffDays: number;
  tiltLosses: number;
  tiltPauseMinutes: number;
  tradingDays: number[];
  checklist: string[];
  customRules: string[];
  cooldownSeconds: number;
  preMarketReminder: string | null;
  journalReminder: string | null;
  why: string;
}

export interface SpendingConfig {
  dailyLimit: number;
  monthlyLimit: number;
  categories: string[];
  noSpendDays: number[];
  reminderTime: string | null;
  why: string;
}

interface TrackerBase {
  id: string;
  category: CategoryKey;
  name: string;
  icon: string;
  color: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
}
export type HabitTracker = TrackerBase & { type: 'habit'; config: HabitConfig };
export type TradingTracker = TrackerBase & { type: 'trading'; config: TradingConfig };
export type SpendingTracker = TrackerBase & { type: 'spending'; config: SpendingConfig };
export type Tracker = HabitTracker | TradingTracker | SpendingTracker;

export interface Insight {
  level: Level;
  title: string;
  message: string;
}

export interface DayStatus {
  date: string;
  trades: number;
  netPnl: number;
  weekPnl: number;
  monthPnl: number;
  weeklyMaxLoss: number;
  monthlyMaxLoss: number;
  weeklyLimitHit: boolean;
  monthlyLimitHit: boolean;
  coolOff: boolean;
  coolOffUntil: string | null;
  /** today's loss starts a cool-off until this date */
  coolOffNext: string | null;
  tiltUntil: string | null;
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
  date: string;
  status: DayStatus;
  streaks: { currentClean: number; bestClean: number; currentGreen: number; currentRed: number; activeDays: number };
  breaksToday: number;
  breaksLast7Days: number;
  journalDone: boolean;
  alerts: Insight[];
}

export interface HabitToday {
  date: string;
  lostStreak: number;
  alerts: Insight[];
  scheduledToday: boolean;
  loggedToday: boolean;
  completedToday: boolean;
  valueToday: number;
  overLimit: boolean;
  currentStreak: number;
  bestStreak: number;
}

export interface SpendStatus {
  date: string;
  spentToday: number;
  spentMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  leftToday: number | null;
  leftMonth: number | null;
  noSpendDay: boolean;
  overDaily: boolean;
  overMonthly: boolean;
  messages: string[];
}

export interface SpendingToday {
  date: string;
  status: SpendStatus;
  streak: number;
  alerts: Insight[];
}

export type DashboardCard =
  | { tracker: HabitTracker; today: HabitToday }
  | { tracker: TradingTracker; today: TradingToday }
  | { tracker: SpendingTracker; today: SpendingToday };

export interface Achievement {
  key: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface Game {
  xp: number;
  level: number;
  levelName: string;
  levelStartXp: number;
  nextLevelXp: number;
  progress: number;
  achievements: Achievement[];
  unlockedCount: number;
  newlyUnlocked: Achievement[];
  points: { habitDay: number; cleanTrade: number; journal: number; expense: number; ruleBreak: number };
}

export interface Dashboard {
  date: string;
  user: { name: string; currency: string; emailVerified: boolean };
  summary: { habitsDue: number; habitsDone: number; ruleBreaksToday: number; dayScore: number };
  cards: DashboardCard[];
  /** null when the admin has switched gamification off */
  game: Game | null;
}

export interface RuleBreak {
  rule: string;
  label?: string;
  description: string;
  reason?: string | null;
}

export interface Trade {
  id: string;
  tradeDate: string;
  tradedAt: string;
  instrument: string | null;
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

export interface Expense {
  id: string;
  spentOn: string;
  amount: number;
  category: string;
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
  daily: { date: string; pnl: number; trades: number; breaks: number; score: number; cumulative: number; disciplinedCumulative: number }[];
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
  avgValue: number | null;
  avgMood: number | null;
  byWeekday: { weekday: string; rate: number | null }[];
  series: { date: string; value: number; completed: boolean; scheduled: boolean; logged: boolean }[];
  insights: Insight[];
}

export interface SpendingStats {
  range: { from: string; to: string };
  summary: {
    total: number;
    count: number;
    avgPerDay: number;
    projectedMonth: number | null;
    underDays: number;
    overDays: number;
    noSpendDaysKept: number;
    noSpendDaysTotal: number;
  };
  discipline: { ruleBreaks: number; breakdown: { rule: string; label: string; count: number }[] };
  daily: { date: string; amount: number; over: boolean }[];
  byCategory: { category: string; amount: number; count: number; share: number }[];
  insights: Insight[];
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
export const emotionOf = (key: string | null | undefined) => EMOTIONS.find((e) => e.key === key);

/** "Your forest": -1 withered · 0 empty · 1 sprout · 2 tree · 3 grand tree */
export type TreeStage = -1 | 0 | 1 | 2 | 3;
export interface ForestDay {
  date: string;
  good: number;
  bad: number;
  tree: TreeStage;
}
export interface ForestStage {
  min: number;
  name: string;
  emoji: string;
}
export interface Forest {
  today: string;
  alive: number;
  withered: number;
  grand: number;
  streak: number;
  health: number | null;
  stage: ForestStage & { index: number };
  next: (ForestStage & { treesToGo: number }) | null;
  todayTree: TreeStage;
  grid: ForestDay[];
}

/** Mini-games (GET /api/dashboard/games) */
export interface Boss {
  key: string;
  name: string;
  emoji: string;
  taunt: string;
  weekStart: string;
  daysLeft: number;
  maxHp: number;
  hp: number;
  hits: number;
  heals: number;
  defeated: boolean;
}
export interface PiggyBank {
  trackerId: string;
  name: string;
  color: string;
  saved: number;
  goal: number;
  fill: number;
  daysUnder: number;
  daysOver: number;
}
export interface Fortress {
  trackerId: string;
  name: string;
  color: string;
  bricks: number;
  cracks: number;
  streak: number;
  level: { min: number; name: string; emoji: string; index: number };
  next: { min: number; name: string; emoji: string; bricksToGo: number } | null;
}
export interface QuitSaving {
  trackerId: string;
  name: string;
  color: string;
  icon: string;
  kind: 'quit' | 'limit';
  costPerDay: number;
  cleanDays: number;
  saved: number;
}
export interface Games {
  today: string;
  boss: Boss;
  piggyBanks: PiggyBank[];
  fortresses: Fortress[];
  quitSavings: QuitSaving[];
}
