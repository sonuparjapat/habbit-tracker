import { create } from 'zustand';
import { del, get, patch, post, setAuthToken, setUnauthorizedHandler } from './api';
import { queryClient } from './queryClient';
import { storage } from './storage';
import type { User } from './types';

const TOKEN_KEY = 'auth_token';

interface AuthState {
  ready: boolean;
  token: string | null;
  user: User | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (data: Partial<Pick<User, 'name' | 'timezone' | 'currency'>>) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export const useAuth = create<AuthState>((set, getState) => {
  const signIn = async (token: string, user: User) => {
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
          // Keep the session if we're just offline; drop it if the token is bad.
          if (err?.status === 401) {
            setAuthToken(null);
            await storage.remove(TOKEN_KEY);
          } else {
            set({ token });
          }
        }
      }
      set({ ready: true });
    },

    login: async (email, password) => {
      const res = await post<{ token: string; user: User }>('/auth/login', { email, password });
      await signIn(res.token, res.user);
    },

    register: async (name, email, password) => {
      const res = await post<{ token: string; user: User }>('/auth/register', {
        name,
        email,
        password,
        timezone: deviceTimeZone(),
      });
      await signIn(res.token, res.user);
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

    deleteAccount: async () => {
      await del('/auth/me');
      await getState().logout();
    },
  };
});
