'use client';

/**
 * Browser-side API client. Calls go to this website's own /api/backend/* route,
 * which attaches the session from the httpOnly cookie on the server.
 */

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body, base = '/api/backend') {
  let res;
  try {
    res = await fetch(`${base}/${path.replace(/^\/+/, '')}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection', 'NETWORK');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Session ended (expired, revoked, suspended): back to sign-in
    if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      // A full page load (not router.push) is intended: it drops all in-memory state of the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`, data?.error?.code);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};

export const { get, post, patch, del } = api;

export const session = {
  get: () => request('GET', '', undefined, '/api/session'),
  login: (email, password, scope) => request('POST', '', { email, password, scope }, '/api/session'),
  logout: () => request('DELETE', '', undefined, '/api/session'),
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
