import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { api, get, patch, post, setAuthToken, setUnauthorizedHandler } from './api';
import { usePrefs } from './prefs';
import { forgetPushToken } from './push';
import { clearCache } from './queryClient';
import { storage } from './storage';
import type { CategoryKey, User } from './types';

const TOKEN_KEY = 'auth_token';
/** The signed-in member's profile, kept on the phone so the app can open instantly (even while the server wakes up). */
const USER_KEY = 'auth_user_v1';

async function loadSavedUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

/** Resolve with the value, or with undefined after `ms` (so a sleeping server can't hold the app). */
const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);

type Session = { token: string; user: User };

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
  interests: CategoryKey[];
  /** A friend's invite code (optional) */
  inviteCode?: string;
}

interface AuthState {
  ready: boolean;
  token: string | null;
  user: User | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  /** Account locked for safety: email a new unlock code / unlock with it (signs in) */
  requestUnlock: (email: string) => Promise<void>;
  unlock: (email: string, code: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  acceptTerms: () => Promise<void>;
  updateProfile: (data: Partial<Pick<User, 'name' | 'timezone' | 'currency' | 'marketingOptIn' | 'interests' | 'nudgePush' | 'nudgeEmail' | 'pushNews'>>) => Promise<void>;
  /** Clears the session on this device (also used when the server says the session ended). */
  logout: () => Promise<void>;
  /** The member tapped "Sign out": also stop this phone's evening nudges. */
  signOut: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function deviceCurrency() {
  try {
    return getLocales()[0]?.currencyCode ?? undefined;
  } catch {
    return undefined;
  }
}

export const useAuth = create<AuthState>((set, getState) => {
  const signIn = async ({ token, user }: Session) => {
    setAuthToken(token);
    await storage.set(TOKEN_KEY, token);
    set({ token, user });
    // Signed-in users never need the first-run onboarding again on this device
    if (!usePrefs.getState().onboarded) void usePrefs.getState().update({ onboarded: true });
  };

  setUnauthorizedHandler(() => {
    void getState().logout();
  });

  return {
    ready: false,
    token: null,
    user: null,

    /**
     * App start. Never waits for the server: the saved session and profile open the app at once,
     * and the server is asked in the background whether the session is still valid.
     * (Only the very first start after installing this version, with no saved profile, waits — at most 4 s.)
     */
    hydrate: async () => {
      const [token, savedUser] = await Promise.all([storage.get(TOKEN_KEY), loadSavedUser()]);
      if (!token) {
        set({ ready: true });
        return;
      }
      setAuthToken(token);
      const check = get<{ user: User }>('/auth/me')
        .then(({ user }) => {
          if (getState().token === token) set({ user });
          return user;
        })
        .catch(async (err: any) => {
          // The session ended on the server (signed out everywhere, suspended, locked): sign out here too.
          // Anything else (offline, server asleep, slow) keeps the member signed in with the saved data.
          if (err?.status === 401 || err?.status === 403 || err?.status === 423) {
            if (getState().token === token) await getState().logout();
          }
          return undefined;
        });

      if (savedUser) {
        set({ token, user: savedUser, ready: true });
        return; // the check above finishes in the background
      }
      await within(check, 4000);
      if (getState().token === null && getState().ready === false) {
        set({ ready: true }); // the check signed us out
        return;
      }
      set({ token: getState().token ?? token, ready: true });
    },

    login: async (email, password) => signIn(await post<Session>('/auth/login', { email, password })),

    register: async (input) =>
      signIn(
        await post<Session>('/auth/register', {
          ...input,
          timezone: deviceTimeZone(),
          currency: deviceCurrency(),
        }),
      ),

    verifyEmail: async (code) => {
      const { user } = await post<{ user: User }>('/auth/verify-email', { code });
      set({ user });
    },

    resendVerification: async () => {
      await post('/auth/resend-verification');
    },

    requestPasswordReset: async (email) => {
      await post('/auth/forgot-password', { email });
    },

    resetPassword: async (email, code, password) => signIn(await post<Session>('/auth/reset-password', { email, code, password })),

    requestUnlock: async (email) => {
      await post('/auth/unlock/request', { email });
    },

    unlock: async (email, code) => signIn(await post<Session>('/auth/unlock', { email, code })),

    changePassword: async (currentPassword, newPassword) =>
      signIn(await post<Session>('/auth/change-password', { currentPassword, newPassword })),

    acceptTerms: async () => {
      const { user } = await post<{ user: User }>('/auth/accept-terms');
      set({ user });
    },

    updateProfile: async (data) => {
      const { user } = await patch<{ user: User }>('/auth/me', data);
      set({ user });
    },

    logout: async () => {
      setAuthToken(null);
      await storage.remove(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY).catch(() => {});
      await clearCache();
      set({ token: null, user: null });
    },

    signOut: async () => {
      if (getState().user?.hasPushToken) await forgetPushToken();
      await getState().logout();
    },

    logoutEverywhere: async () => {
      if (getState().user?.hasPushToken) await forgetPushToken();
      await post('/auth/logout-all');
      await getState().logout();
    },

    deleteAccount: async (password) => {
      await api('DELETE', '/auth/me', { password });
      await getState().logout();
    },
  };
});

// Whenever the profile changes, save it on the phone (used to open the app instantly next time)
useAuth.subscribe((state, prev) => {
  if (state.user === prev.user) return;
  if (state.user) AsyncStorage.setItem(USER_KEY, JSON.stringify(state.user)).catch(() => {});
});
