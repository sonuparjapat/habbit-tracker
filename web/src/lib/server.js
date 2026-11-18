import 'server-only';
import { SESSION_COOKIE } from './config';

/** Server-only helpers: talking to the backend and managing the session cookie. */

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const MAX_AGE = Number(process.env.SESSION_MAX_AGE_DAYS || 30) * 24 * 60 * 60;

export function backendUrl(path) {
  return `${API_URL}/api/${path.replace(/^\/+/, '')}`;
}

/** Call the backend from the server. Never follows redirects, never forwards browser headers. */
export async function backend(path, { method = 'GET', token, body, search = '' } = {}) {
  return fetch(backendUrl(path) + search, {
    method,
    redirect: 'error',
    cache: 'no-store',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export const sessionCookie = {
  name: SESSION_COOKIE,
  options: {
    httpOnly: true, // not readable by JavaScript in the browser
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  },
};

export function errorResponse(status, message, code = 'ERROR') {
  return Response.json({ error: { code, message } }, { status });
}
