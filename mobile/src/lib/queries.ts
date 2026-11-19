import { useMutation, useQuery } from '@tanstack/react-query';
import { del, get, patch, post, put } from './api';
import { localToday } from './format';
import { useAuth } from './auth';
import { queryClient } from './queryClient';
import type {
  Dashboard,
  Forest,
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

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: () => get<Dashboard>('/dashboard'), enabled: useSignedIn() });

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

export function useTrackerToday<T extends TradingToday | HabitToday | SpendingToday>(id: string) {
  return useQuery({ queryKey: keys.today(id), queryFn: () => get<T>(`/trackers/${id}/today`), enabled: useSignedIn() && !!id });
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

export function useSaveEntry(trackerId: string) {
  return useMutation({
    mutationFn: ({ date, ...body }: { date: string } & Partial<Omit<Entry, 'date'>>) =>
      put<{ entry: Entry }>(`/trackers/${trackerId}/entries/${date}`, body),
    onSuccess: invalidateAll,
  });
}

export function useDeleteEntry(trackerId: string) {
  return useMutation({ mutationFn: (date: string) => del(`/trackers/${trackerId}/entries/${date}`), onSuccess: invalidateAll });
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
  return useMutation({ mutationFn: () => post('/dashboard/achievements/seen'), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.dashboard }) });
}

export function sendFeedback(body: { kind: 'bug' | 'idea' | 'question' | 'other'; message: string; email?: string; appVersion?: string; platform?: string }) {
  return post<{ ok: true; message: string }>('/feedback', body);
}

export function useDeleteExpense() {
  return useMutation({ mutationFn: (id: string) => del(`/expenses/${id}`), onSuccess: invalidateAll });
}

export const useForest = (enabled = true) =>
  useQuery({ queryKey: ['forest'], queryFn: () => get<Forest>('/dashboard/forest'), enabled: useSignedIn() && enabled });
