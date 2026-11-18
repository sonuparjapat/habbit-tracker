import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { api, get, patch, post, setAuthToken, setUnauthorizedHandler } from './api';
import { queryClient } from './queryClient';
import { storage } from './storage';
import type { CategoryKey, User } from './types';

const TOKEN_KEY = 'auth_token';

type Session = { token: string; user: User };

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
  interests: CategoryKey[];
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
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  acceptTerms: () => Promise<void>;
  updateProfile: (data: Partial<Pick<User, 'name' | 'timezone' | 'currency' | 'marketingOptIn' | 'interests'>>) => Promise<void>;
  logout: () => Promise<void>;
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
  };

  setUnauthorizedHandler(() => {
    void getState().logout();
  });

  return {
    ready: false,
    token: null,
    user: null,

    hydrate: async () => {
      const token = await storage.get(TOKEN_KEY);
      if (token) {
        setAuthToken(token);
        try {
          const { user } = await get<{ user: User }>('/auth/me');
          set({ token, user });
        } catch (err: any) {
          // Keep the session if we're just offline; drop it if the token is no longer valid.
          if (err?.status === 401 || err?.status === 403) {
            setAuthToken(null);
            await storage.remove(TOKEN_KEY);
          } else {
            set({ token });
          }
        }
      }
      set({ ready: true });
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
      queryClient.clear();
      set({ token: null, user: null });
    },

    logoutEverywhere: async () => {
      await post('/auth/logout-all');
      await getState().logout();
    },

    deleteAccount: async (password) => {
      await api('DELETE', '/auth/me', { password });
      await getState().logout();
    },
  };
});
