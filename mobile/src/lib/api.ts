import Constants from 'expo-constants';
import { language } from './i18n';
import { Platform } from 'react-native';

/**
 * API base URL.
 * - Set EXPO_PUBLIC_API_URL for production builds (e.g. https://api.yourdomain.com/api).
 * - In development we reuse the IP of the machine running Metro, so a physical
 *   phone on the same Wi-Fi reaches your laptop's backend automatically.
 */
function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    // Accept both "https://host" and "https://host/api" — all routes live under /api
    const base = process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host && host !== 'localhost') return `http://${host}:4000/api`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000/api';
  return 'http://localhost:4000/api';
}

export const API_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let onMaintenance: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}
export function setMaintenanceHandler(fn: () => void) {
  onMaintenance = fn;
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        // The server translates its own messages (alerts, insights, errors) into the member's language
        'X-App-Language': language(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      __DEV__ ? `Can't reach the server at ${API_URL}. Is the backend running?` : 'Can’t connect right now. Check your internet connection and try again.',
      'NETWORK',
    );
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && authToken) onUnauthorized?.();
    if (res.status === 503 && err.code === 'MAINTENANCE') onMaintenance?.();
    throw new ApiError(res.status, err.message ?? `Request failed (${res.status})`, err.code ?? 'ERROR', err.details);
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>('GET', path);
export const post = <T = any>(path: string, body?: unknown) => api<T>('POST', path, body);
export const put = <T = any>(path: string, body?: unknown) => api<T>('PUT', path, body);
export const patch = <T = any>(path: string, body?: unknown) => api<T>('PATCH', path, body);
export const del = <T = any>(path: string) => api<T>('DELETE', path);
