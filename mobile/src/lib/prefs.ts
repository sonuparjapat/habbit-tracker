import { create } from 'zustand';
import { storage } from './storage';
import type { CategoryKey } from './types';

/**
 * On-device preferences that exist before (and without) an account:
 * onboarding, interests, permission choices and small UI memories.
 */
const KEY = 'prefs_v1';

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
};

const pickData = (s: PrefsData): PrefsData => ({
  onboarded: s.onboarded,
  interests: s.interests,
  remindersConsent: s.remindersConsent,
  // Keep the list short: only the most recent dismissals matter
  dismissedAnnouncements: s.dismissedAnnouncements.slice(-50),
  celebratedLevel: s.celebratedLevel,
  dismissedUpdate: s.dismissedUpdate,
});

export const usePrefs = create<PrefsState>((set, get) => ({
  ...defaults,
  loaded: false,
  load: async () => {
    try {
      const raw = await storage.get(KEY);
      set({ ...defaults, ...(raw ? JSON.parse(raw) : {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    set(patch);
    await storage.set(KEY, JSON.stringify(pickData({ ...get(), ...patch })));
  },
}));
