import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { get, setMaintenanceHandler } from './api';
import { queryClient } from './queryClient';
import type { Level } from './types';

/**
 * App-wide settings managed in the admin panel (Admin → App settings), loaded from GET /api/config.
 * Defaults below are used until the first load succeeds (or if the server is unreachable).
 */
export interface AppSettings {
  support_email: string;
  website_url: string;
  play_store_url: string;
  signups_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  min_app_version: string;
  latest_app_version: string;
  feature_trading: boolean;
  feature_spending: boolean;
  feature_gamification: boolean;
  ads_enabled: boolean;
  daily_quotes: string[];
  xp_habit_day: number;
  xp_clean_trade: number;
  xp_journal: number;
  xp_expense: number;
  xp_rule_break: number;
  xp_achievement: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: Level;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export interface AppConfig {
  appName: string;
  settings: AppSettings;
  announcements: Announcement[];
}

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'Anchor',
  announcements: [],
  settings: {
    support_email: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '',
    website_url: '',
    play_store_url: '',
    signups_enabled: true,
    maintenance_mode: false,
    maintenance_message: '',
    min_app_version: '0.0.0',
    latest_app_version: '0.0.0',
    feature_trading: true,
    feature_spending: true,
    feature_gamification: true,
    ads_enabled: false,
    daily_quotes: ['Small promises, kept daily, build unshakable self-trust.'],
    xp_habit_day: 10,
    xp_clean_trade: 10,
    xp_journal: 5,
    xp_expense: 3,
    xp_rule_break: 15,
    xp_achievement: 50,
  },
};

export const CONFIG_KEY = ['config'] as const;

export function useAppConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => get<AppConfig>('/config'),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  if (!data) return DEFAULT_CONFIG;
  // Server values win; defaults fill any gaps (e.g. older backend)
  return { ...DEFAULT_CONFIG, ...data, settings: { ...DEFAULT_CONFIG.settings, ...data.settings } };
}

/** Called when any request reports maintenance, so the maintenance screen appears right away. */
export const refreshConfig = () => queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
setMaintenanceHandler(() => void refreshConfig());

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** -1 if a < b, 0 if equal, 1 if a > b (simple x.y.z compare). */
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

export function privacyUrl(s: AppSettings) {
  return s.website_url ? `${s.website_url.replace(/\/+$/, '')}/privacy` : null;
}
