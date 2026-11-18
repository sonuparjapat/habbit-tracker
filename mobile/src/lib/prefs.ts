import { create } from 'zustand';
import { storage } from './storage';
import type { CategoryKey } from './types';

/**
 * On-device preferences that exist before (and without) an account:
 * whether onboarding was completed, chosen interests, and permission choices.
 */
const KEY = 'prefs_v1';

interface PrefsData {
  onboarded: boolean;
  interests: CategoryKey[];
  /** User explicitly agreed to receive reminders (we never ask the OS before this) */
  remindersConsent: boolean;
}

interface PrefsState extends PrefsData {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<PrefsData>) => Promise<void>;
}

const defaults: PrefsData = { onboarded: false, interests: [], remindersConsent: false };

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
    const { onboarded, interests, remindersConsent } = { ...get(), ...patch };
    await storage.set(KEY, JSON.stringify({ onboarded, interests, remindersConsent }));
  },
}));
