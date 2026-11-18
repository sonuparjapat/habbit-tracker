'use client';

import axios from 'axios';
import { API_URL } from './config';

/**
 * Backend API client — calls the Anchor API directly.
 * The login token is kept in localStorage and sent as `Authorization: Bearer <token>`.
 *
 *   const { users } = await get('/admin/users');
 *   await post('/admin/announcements', { title: 'Hi' });
 */

const TOKEN_KEY = 'anchor_token';

export const token = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const http = axios.create({ baseURL: API_URL, timeout: 20000 });

// Attach the token to every request
http.interceptors.request.use((cfg) => {
  const t = token.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Turn backend errors into readable messages; send expired sessions back to the login page
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status ?? 0;
    const body = err.response?.data?.error;
    if (status === 401 && token.get()) {
      token.clear();
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
        // A full reload (not router.push) on purpose: it clears everything from the old session
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
    }
    const message = body?.message ?? (status ? `Request failed (${status})` : 'Cannot reach the server — check your connection');
    return Promise.reject(Object.assign(new Error(message), { status, code: body?.code }));
  },
);

const data = (p) => p.then((res) => (res.status === 204 ? null : res.data));

export const get = (url) => data(http.get(url));
export const post = (url, body) => data(http.post(url, body));
export const put = (url, body) => data(http.put(url, body));
export const patch = (url, body) => data(http.patch(url, body));
export const del = (url) => data(http.delete(url));
export const api = { get, post, put, patch, del };

/** Admin sign-in / sign-out. */
export const session = {
  async login(email, password, scope) {
    const { token: t, user } = await post('/auth/login', { email, password });
    if (scope === 'admin' && !user.isAdmin) throw new Error('This account does not have admin access');
    token.set(t);
    return { user };
  },
  get: () => get('/auth/me'),
  async logout() {
    token.clear();
  },
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export function timeAgo(d) {
  if (!d) return 'never';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
