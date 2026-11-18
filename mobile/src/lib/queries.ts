import { useMutation, useQuery } from '@tanstack/react-query';
import { del, get, patch, post, put } from './api';
import { useAuth } from './auth';
import { queryClient } from './queryClient';
import type {
  Dashboard,
  DayStatus,
  Entry,
  HabitStats,
  RuleBreak,
  Trade,
  Tracker,
  TradingStats,
} from './types';

export type Period = 'week' | 'month' | '90d' | 'year' | 'all';

export const keys = {
  dashboard: ['dashboard'] as const,
  trackers: ['trackers'] as const,
  tracker: (id: string) => ['tracker', id] as const,
  stats: (id: string, period: string) => ['tracker', id, 'stats', period] as const,
  trades: (id: string, period: string) => ['tracker', id, 'trades', period] as const,
  breaks: (id: string, period: string) => ['tracker', id, 'breaks', period] as const,
  entries: (id: string, period: string) => ['tracker', id, 'entries', period] as const,
  status: (id: string) => ['tracker', id, 'status'] as const,
};

/** After any write, refresh everything that may depend on it. */
export function invalidateAll() {
  return queryClient.invalidateQueries();
}

const useSignedIn = () => useAuth((s) => !!s.token);

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
    enabled: !!id,
  });

export function useStats<T extends TradingStats | HabitStats>(id: string, period: Period, enabled = true) {
  return useQuery({
    queryKey: keys.stats(id, period),
    queryFn: () => get<T>(`/trackers/${id}/stats?period=${period}`),
    enabled: !!id && enabled,
  });
}

export const useTrades = (id: string, period: Period = '90d') =>
  useQuery({
    queryKey: keys.trades(id, period),
    queryFn: async () => (await get<{ trades: Trade[] }>(`/trackers/${id}/trades?period=${period}`)).trades,
    enabled: !!id,
  });

export const useRuleBreaks = (id: string, period: Period = 'all') =>
  useQuery({
    queryKey: keys.breaks(id, period),
    queryFn: async () =>
      (
        await get<{ breaks: (RuleBreak & { id: string; date: string; tradeNet: number | null; label: string })[] }>(
          `/trackers/${id}/rule-breaks?period=${period}`,
        )
      ).breaks,
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

export function useSaveEntry(trackerId: string) {
  return useMutation({
    mutationFn: ({ date, ...body }: { date: string } & Partial<Omit<Entry, 'date'>>) =>
      put<{ entry: Entry }>(`/trackers/${trackerId}/entries/${date}`, body),
    onSuccess: invalidateAll,
  });
}

export function useCreateTracker() {
  return useMutation({
    mutationFn: (body: { type: Tracker['type']; name: string; icon?: string; color?: string; config: object }) =>
      post<{ tracker: Tracker }>('/trackers', body),
    onSuccess: invalidateAll,
  });
}

export function useUpdateTracker(id: string) {
  return useMutation({
    mutationFn: (body: Partial<Pick<Tracker, 'name' | 'icon' | 'color' | 'archived'>> & { config?: object }) =>
      patch<{ tracker: Tracker }>(`/trackers/${id}`, body),
    onSuccess: invalidateAll,
  });
}

export function useDeleteTracker() {
  return useMutation({ mutationFn: (id: string) => del(`/trackers/${id}`), onSuccess: invalidateAll });
}

export interface NewTrade {
  tradeDate?: string;
  instrument?: string;
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
}

export function useCreateTrade(trackerId: string) {
  return useMutation({
    mutationFn: (body: NewTrade) =>
      post<{ tradeId: string; breaks: RuleBreak[]; status: DayStatus }>(`/trackers/${trackerId}/trades`, body),
    onSuccess: invalidateAll,
  });
}

export function useDeleteTrade() {
  return useMutation({ mutationFn: (id: string) => del(`/trades/${id}`), onSuccess: invalidateAll });
}
