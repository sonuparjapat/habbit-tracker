import { create } from 'zustand';
import { storage } from './storage';
import type { CategoryKey } from './types';

/**
 * On-device preferences that exist before (and without) an account:
 * onboarding, interests, permission choices and small UI memories.
 */
const KEY = 'prefs_v1';

export type ThemePref = 'default' | 'system' | 'dark' | 'light';

interface PrefsData {
  onboarded: boolean;
  interests: CategoryKey[];
  /** User explicitly agreed to receive reminders (we never ask the OS before this) */
  remindersConsent: boolean;
  /** Announcement ids the user closed */
  dismissedAnnouncements: string[];
  /** Highest level already celebrated, so a level-up is celebrated exactly once */
  celebratedLevel: number;
  /** "Update available" banner closed for this version */
  dismissedUpdate: string | null;
  /** The guided tour was finished or skipped */
  tourDone: boolean;
  /** Appearance: 'default' follows the admin's default theme */
  theme: ThemePref;
  /** Last default theme received from the admin settings (so the first frame already uses it) */
  adminTheme: 'dark' | 'light' | 'system';
  /** First time the app was opened on this device (ms) — the rating prompt waits a few days */
  firstOpenAt: number | null;
  /** Last time we asked for a Play Store rating (ms) */
  lastRatingAskAt: number | null;
  /** App language */
  language: 'en' | 'hi' | null;
}

interface PrefsState extends PrefsData {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<PrefsData>) => Promise<void>;
}

const defaults: PrefsData = {
  onboarded: false,
  interests: [],
  remindersConsent: false,
  dismissedAnnouncements: [],
  celebratedLevel: 0,
  dismissedUpdate: null,
  tourDone: false,
  theme: 'default',
  adminTheme: 'dark',
  firstOpenAt: null,
  lastRatingAskAt: null,
  language: null,
};

const pickData = (s: PrefsData): PrefsData => ({
  onboarded: s.onboarded,
  interests: s.interests,
  remindersConsent: s.remindersConsent,
  // Keep the list short: only the most recent dismissals matter
  dismissedAnnouncements: s.dismissedAnnouncements.slice(-50),
  celebratedLevel: s.celebratedLevel,
  dismissedUpdate: s.dismissedUpdate,
  tourDone: s.tourDone,
  theme: s.theme,
  adminTheme: s.adminTheme,
  firstOpenAt: s.firstOpenAt,
  lastRatingAskAt: s.lastRatingAskAt,
  language: s.language,
});

export const usePrefs = create<PrefsState>((set, get) => ({
  ...defaults,
  loaded: false,
  load: async () => {
    try {
      const raw = await storage.get(KEY);
      set({ ...defaults, ...(raw ? JSON.parse(raw) : {}), loaded: true });
      if (!get().firstOpenAt) await get().update({ firstOpenAt: Date.now() });
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    set(patch);
    await storage.set(KEY, JSON.stringify(pickData({ ...get(), ...patch })));
  },
}));
