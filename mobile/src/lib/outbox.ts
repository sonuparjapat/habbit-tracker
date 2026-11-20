/**
 * The outbox: changes the member made, waiting to reach the server.
 *
 * A check-in (or journal, weekly-review answer…) is applied to the screen straight away and saved
 * here on the phone. The outbox then delivers it to POST /api/sync — immediately if the server is
 * awake, otherwise as soon as it is (on app start, when the app comes back to the front, and every
 * few seconds while something is waiting). Nothing is lost if the app is closed: the outbox is saved
 * on the phone, per account.
 *
 * Once the server has the change it is stored there first, so the phone can forget it; the server
 * keeps retrying on its own if applying it hits a temporary problem (see backend services/sync.js).
 * Changes the server says can never work (e.g. the tracker was deleted) are reported to the member.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { ApiError, post } from './api';

export interface OutboxOp {
  id: string;
  method: 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** When the member made the change (ISO) — the server applies changes in this order */
  at: string;
  /** What it changes; a newer change to the same thing replaces an older one still waiting */
  key: string;
}

interface Rejected {
  id: string;
  path: string;
  error: string;
}

interface OutboxState {
  userId: string | null;
  ops: OutboxOp[];
  syncing: boolean;
  /** The last delivery attempt failed (server asleep / no internet) */
  waiting: boolean;
  rejected: Rejected[];
  lastSyncedAt: number | null;
}

export const useOutbox = create<OutboxState>(() => ({
  userId: null,
  ops: [],
  syncing: false,
  waiting: false,
  rejected: [],
  lastSyncedAt: null,
}));

const storageKey = (userId: string) => `outbox_v1:${userId}`;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/** "Check in" and "undo" of the same day are one thing; so are answers for the same week. */
function keyFor(method: string, path: string, body: unknown) {
  if (path === '/dashboard/review') return `review:${(body as { weekStart?: string })?.weekStart ?? ''}`;
  return path; // e.g. /trackers/<id>/entries/<date> — PUT and DELETE share it
}

async function persist() {
  const { userId, ops } = useOutbox.getState();
  if (!userId) return;
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(ops));
  } catch {
    // storage full / unavailable: the change still goes out while the app is open
  }
}

let onDelivered: (() => void) | null = null;
/** Called after changes reach the server (the app refreshes its data then). */
export function setOnDelivered(fn: () => void) {
  onDelivered = fn;
}

/** Load the waiting changes of the member who just signed in (or clear them on sign-out). */
export async function loadOutbox(userId: string | null) {
  if (useOutbox.getState().userId === userId) return;
  let ops: OutboxOp[] = [];
  if (userId) {
    try {
      ops = JSON.parse((await AsyncStorage.getItem(storageKey(userId))) ?? '[]');
    } catch {
      ops = [];
    }
  }
  useOutbox.setState({ userId, ops, syncing: false, waiting: false, rejected: [] });
  if (ops.length) void flushOutbox();
}

/** Save a change to deliver. Returns at once — never waits for the server. */
export async function enqueue(method: OutboxOp['method'], path: string, body?: unknown) {
  const key = keyFor(method, path, body);
  const op: OutboxOp = { id: newId(), method, path, body, at: new Date().toISOString(), key };
  useOutbox.setState((s) => ({ ops: [...s.ops.filter((o) => o.key !== key || inFlight.has(o.id)), op] }));
  await persist();
  void flushOutbox();
}

const inFlight = new Set<string>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

function scheduleRetry() {
  if (retryTimer) return;
  // 3s, 6s, 12s… up to 60s between tries while the server wakes up
  const wait = Math.min(60_000, 3_000 * 2 ** Math.min(failures, 5));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox();
  }, wait);
}

/** Send everything waiting. Safe to call any time, as often as you like. */
export async function flushOutbox(): Promise<void> {
  const state = useOutbox.getState();
  if (state.syncing || !state.userId) return;
  const batch = state.ops.filter((o) => !inFlight.has(o.id)).slice(0, 50);
  if (!batch.length) return;

  useOutbox.setState({ syncing: true });
  batch.forEach((o) => inFlight.add(o.id));
  try {
    const { results } = await post<{ results: { id: string; status: string; error?: string }[] }>('/sync', {
      ops: batch.map(({ id, method, path, body, at }) => ({ id, method, path, body, at })),
    });
    // The server has them all now (it retries temporary failures itself) — forget them here
    const sent = new Set(batch.map((o) => o.id));
    const rejected = results
      .filter((r) => r?.status === 'rejected')
      .map((r) => ({ id: r.id, path: batch.find((o) => o.id === r.id)?.path ?? '', error: r.error ?? 'Could not be saved' }));
    useOutbox.setState((s) => ({
      ops: s.ops.filter((o) => !sent.has(o.id)),
      waiting: false,
      lastSyncedAt: Date.now(),
      rejected: [...s.rejected, ...rejected].slice(-5),
    }));
    failures = 0;
    await persist();
    onDelivered?.();
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    if (status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
      // The server refused the batch itself (it will never accept it as is) — don't retry forever
      const sent = new Set(batch.map((o) => o.id));
      useOutbox.setState((s) => ({
        ops: s.ops.filter((o) => !sent.has(o.id)),
        rejected: [...s.rejected, ...batch.map((o) => ({ id: o.id, path: o.path, error: (err as Error).message }))].slice(-5),
      }));
      await persist();
      onDelivered?.();
    } else if (status !== 401) {
      // 401 = signed out (the app handles that). Otherwise the server is asleep or unreachable — try again soon.
      failures++;
      useOutbox.setState({ waiting: true });
      scheduleRetry();
    }
  } finally {
    batch.forEach((o) => inFlight.delete(o.id));
    useOutbox.setState({ syncing: false });
    // More waiting (more than one batch, or added while sending)? Keep going.
    const left = useOutbox.getState().ops.filter((o) => !inFlight.has(o.id));
    if (left.length && !useOutbox.getState().waiting) void flushOutbox();
  }
}

export function dismissRejected() {
  useOutbox.setState({ rejected: [] });
}

// Coming back to the app is a good moment to deliver
AppState.addEventListener('change', (s) => {
  if (s === 'active') void flushOutbox();
});
