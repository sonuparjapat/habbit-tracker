import { useMutation, useQuery } from '@tanstack/react-query';
import { del, get, patch, post } from './api';
import { localToday } from './format';
import { useAuth } from './auth';
import { applyToDashboard, applyToHabitToday, withPendingDashboard, withPendingHabitToday, type EntryChange } from './optimistic';
import { enqueue } from './outbox';
import { queryClient } from './queryClient';
import type {
  Dashboard,
  HabitConfig,
  Invites,
  StarterPack,
  WeeklyReview,
  Forest,
  Games,
  DayStatus,
  Entry,
  Expense,
  HabitStats,
  HabitToday,
  RuleBreak,
  SpendingStats,
  SpendingToday,
  Template,
  Trade,
  Tracker,
  TrackerType,
  TradingStats,
  TradingToday,
} from './types';

export type Period = 'week' | 'month' | '90d' | 'year' | 'all';

export const keys = {
  dashboard: ['dashboard'] as const,
  templates: ['templates'] as const,
  trackers: ['trackers'] as const,
  tracker: (id: string) => ['tracker', id] as const,
  today: (id: string) => ['tracker', id, 'today'] as const,
  stats: (id: string, period: string) => ['tracker', id, 'stats', period] as const,
  trades: (id: string, period: string) => ['tracker', id, 'trades', period] as const,
  expenses: (id: string, period: string) => ['tracker', id, 'expenses', period] as const,
  breaks: (id: string, period: string) => ['tracker', id, 'breaks', period] as const,
  entries: (id: string, period: string) => ['tracker', id, 'entries', period] as const,
  status: (id: string) => ['tracker', id, 'status'] as const,
};

/** After any write, refresh everything that may depend on it. */
export function invalidateAll() {
  return queryClient.invalidateQueries();
}

const useSignedIn = () => useAuth((s) => !!s.token);

/* --------------------------------- Public --------------------------------- */

export const useTemplates = () =>
  useQuery({
    queryKey: keys.templates,
    queryFn: async () => (await get<{ templates: Template[] }>('/templates')).templates,
    staleTime: 10 * 60_000,
  });

/* --------------------------------- Reads ---------------------------------- */

/** Today screen. Changes still waiting in the outbox are shown on top of the server's data. */
export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: async () => withPendingDashboard(await get<Dashboard>('/dashboard')), enabled: useSignedIn() });

export const useTrackers = () =>
  useQuery({
    queryKey: keys.trackers,
    queryFn: async () => (await get<{ trackers: Tracker[] }>('/trackers')).trackers,
    enabled: useSignedIn(),
  });

export const useTracker = (id: string) =>
  useQuery({
    queryKey: keys.tracker(id),
    queryFn: async () => (await get<{ tracker: Tracker }>(`/trackers/${id}`)).tracker,
    enabled: useSignedIn() && !!id,
  });

/** The habit config of a tracker, from whatever is already loaded. */
function cachedHabitConfig(id: string) {
  const tracker = queryClient.getQueryData<Tracker>(keys.tracker(id));
  if (tracker?.type === 'habit') return tracker.config as HabitConfig;
  const card = queryClient.getQueryData<Dashboard>(keys.dashboard)?.cards.find((c) => c.tracker.id === id);
  return card?.tracker.type === 'habit' ? (card.tracker.config as HabitConfig) : undefined;
}

export function useTrackerToday<T extends TradingToday | HabitToday | SpendingToday>(id: string) {
  return useQuery({
    queryKey: keys.today(id),
    queryFn: async () => {
      const today = await get<T>(`/trackers/${id}/today`);
      return ('completedToday' in today ? withPendingHabitToday(id, today as HabitToday, cachedHabitConfig(id)) : today) as T;
    },
    enabled: useSignedIn() && !!id,
  });
}

/**
 * "Today" in the user's profile timezone, as the server sees it.
 * Use this (not the phone clock) for anything that is saved against a date.
 */
export function useToday(trackerId: string) {
  const { data } = useTrackerToday(trackerId);
  return (data as { date?: string } | undefined)?.date ?? localToday();
}

export function useStats<T extends TradingStats | HabitStats | SpendingStats>(id: string, period: Period) {
  return useQuery({
    queryKey: keys.stats(id, period),
    queryFn: () => get<T>(`/trackers/${id}/stats?period=${period}`),
    enabled: !!id,
  });
}

export const useTrades = (id: string, period: Period = '90d') =>
  useQuery({
    queryKey: keys.trades(id, period),
    queryFn: async () => (await get<{ trades: Trade[] }>(`/trackers/${id}/trades?period=${period}`)).trades,
    enabled: !!id,
  });

export const useExpenses = (id: string, period: Period = 'month') =>
  useQuery({
    queryKey: keys.expenses(id, period),
    queryFn: async () => (await get<{ expenses: Expense[] }>(`/trackers/${id}/expenses?period=${period}`)).expenses,
    enabled: !!id,
  });

export const useRuleBreaks = (id: string, period: Period = 'all') =>
  useQuery({
    queryKey: keys.breaks(id, period),
    queryFn: async () =>
      (await get<{ breaks: (RuleBreak & { id: string; date: string; amount: number | null; label: string })[] }>(`/trackers/${id}/rule-breaks?period=${period}`))
        .breaks,
    enabled: !!id,
  });

export const useEntries = (id: string, period: Period = 'month') =>
  useQuery({
    queryKey: keys.entries(id, period),
    queryFn: async () => (await get<{ entries: Entry[] }>(`/trackers/${id}/entries?period=${period}`)).entries,
    enabled: !!id,
  });

export const useDayStatus = (id: string) =>
  useQuery({
    queryKey: keys.status(id),
    queryFn: async () => (await get<{ status: DayStatus }>(`/trackers/${id}/status`)).status,
    enabled: !!id,
    staleTime: 0,
  });

/* --------------------------------- Writes --------------------------------- */

/** Show a check-in change on screen right away (Today + the tracker's own screen). */
export function showEntryChange(trackerId: string, date: string, change: EntryChange) {
  queryClient.setQueryData<Dashboard>(keys.dashboard, (d) => (d ? applyToDashboard(d, trackerId, date, change) : d));
  const cfg = cachedHabitConfig(trackerId);
  if (cfg)
    queryClient.setQueryData<HabitToday>(keys.today(trackerId), (t) => (t && 'completedToday' in t && t.date === date ? applyToHabitToday(t, cfg, change) : t));
}

/**
 * Check in / write a journal. Never waits for the server: the screen updates at once and the change
 * goes into the outbox, which delivers it as soon as the server is reachable (see lib/outbox.ts).
 */
export function useSaveEntry(trackerId: string) {
  return useMutation({
    mutationFn: async ({ date, ...body }: { date: string } & Partial<Omit<Entry, 'date'>>) => {
      showEntryChange(trackerId, date, { kind: 'save', completed: body.completed, value: body.value });
      await enqueue('PUT', `/trackers/${trackerId}/entries/${date}`, body);
    },
  });
}

/** Undo a check-in — instantly, through the outbox. */
export function useDeleteEntry(trackerId: string) {
  return useMutation({
    mutationFn: async (date: string) => {
      showEntryChange(trackerId, date, { kind: 'delete' });
      await enqueue('DELETE', `/trackers/${trackerId}/entries/${date}`);
    },
  });
}

export interface TrackerInput {
  type: TrackerType;
  category: string;
  name: string;
  icon?: string;
  color?: string;
  templateSlug?: string;
  config: object;
}

export function useCreateTracker() {
  return useMutation({ mutationFn: (body: TrackerInput) => post<{ tracker: Tracker }>('/trackers', body), onSuccess: invalidateAll });
}

export function useUpdateTracker(id: string) {
  return useMutation({
    mutationFn: (body: Partial<Omit<TrackerInput, 'type'>> & { archived?: boolean }) => patch<{ tracker: Tracker }>(`/trackers/${id}`, body),
    onSuccess: invalidateAll,
  });
}

export function useDeleteTracker() {
  return useMutation({ mutationFn: (id: string) => del(`/trackers/${id}`), onSuccess: invalidateAll });
}

export interface NewTrade {
  tradeDate?: string;
  instrument?: string | null;
  direction?: 'long' | 'short' | null;
  quantity?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  pnl: number;
  fees?: number;
  emotionBefore?: string | null;
  emotionAfter?: string | null;
  setup?: string | null;
  followedPlan?: boolean;
  checklistDone?: string[];
  note?: string | null;
  override?: boolean;
  breakReason?: string;
  /** Quick day log: one entry standing for several trades */
  tradeCount?: number;
  quick?: boolean;
}

export function useCreateTrade(trackerId: string) {
  return useMutation({
    mutationFn: (body: NewTrade) => post<{ tradeId: string; breaks: RuleBreak[]; status: DayStatus }>(`/trackers/${trackerId}/trades`, body),
    onSuccess: invalidateAll,
  });
}

export function useDeleteTrade() {
  return useMutation({ mutationFn: (id: string) => del(`/trades/${id}`), onSuccess: invalidateAll });
}

export function useCreateExpense(trackerId: string) {
  return useMutation({
    mutationFn: (body: { spentOn?: string; amount: number; category: string; note?: string | null; breakReason?: string }) =>
      post<{ expenseId: string; breaks: RuleBreak[] }>(`/trackers/${trackerId}/expenses`, body),
    onSuccess: invalidateAll,
  });
}

/** After the celebration is shown, so it isn't shown again. */
export function useMarkAchievementsSeen() {
  return useMutation({
    mutationFn: async () => {
      queryClient.setQueryData<Dashboard>(keys.dashboard, (d) => (d?.game ? { ...d, game: { ...d.game, newlyUnlocked: [] } } : d));
      await enqueue('POST', '/dashboard/achievements/seen');
    },
  });
}

export function sendFeedback(body: { kind: 'bug' | 'idea' | 'question' | 'other'; message: string; email?: string; appVersion?: string; platform?: string }) {
  return post<{ ok: true; message: string }>('/feedback', body);
}

export function useDeleteExpense() {
  return useMutation({ mutationFn: (id: string) => del(`/expenses/${id}`), onSuccess: invalidateAll });
}

export const useForest = (enabled = true) =>
  useQuery({ queryKey: ['forest'], queryFn: () => get<Forest>('/dashboard/forest'), enabled: useSignedIn() && enabled });

export const useGames = () =>
  useQuery({ queryKey: ['games'], queryFn: () => get<Games>('/dashboard/games'), enabled: useSignedIn() });

/* ------------------------------ Growth & retention ------------------------------ */

export const useStarterPacks = () =>
  useQuery({ queryKey: ['starter-packs'], queryFn: async () => (await get<{ packs: StarterPack[] }>('/starter-packs')).packs, staleTime: 5 * 60_000 });

export function useApplyPack() {
  return useMutation({
    mutationFn: (slug: string) => post<{ trackers: Tracker[]; skipped: number }>('/trackers/from-pack', { slug }),
    onSuccess: invalidateAll,
  });
}

export const useInvites = () => useQuery({ queryKey: ['invites'], queryFn: () => get<Invites>('/auth/me/invites'), enabled: useSignedIn() });

/** The weekly review; no week = the week just finished (this week on Sundays). */
export const useWeeklyReview = (week?: string) =>
  useQuery({ queryKey: ['review', week ?? 'latest'], queryFn: () => get<WeeklyReview>(`/dashboard/review${week ? `?week=${week}` : ''}`), enabled: useSignedIn() });

export function useSaveReview() {
  return useMutation({
    mutationFn: async (body: { weekStart: string; wentWell?: string; hard?: string; nextFocus?: string }) => {
      const { weekStart, ...answers } = body;
      // Keep the answers on screen (every cached copy of this week's review)
      queryClient.setQueriesData<WeeklyReview>({ queryKey: ['review'] }, (r) =>
        r && r.weekStart === weekStart ? { ...r, answers: { ...r.answers, ...Object.fromEntries(Object.entries(answers).filter(([, v]) => v)) } } : r,
      );
      await enqueue('PUT', '/dashboard/review', body);
    },
  });
}
