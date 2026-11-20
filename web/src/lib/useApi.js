'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useConfirm } from '@/components/admin/kit';
import { get } from './api';

/* How many requests are running right now — drives the thin progress bar at the top of the admin. */
let pending = 0;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
async function tracked(promise) {
  pending++;
  notify();
  try {
    return await promise;
  } finally {
    pending--;
    notify();
  }
}
/** true while any admin request or save is running. */
export function useBusy() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending > 0,
    () => false,
  );
}

/**
 * Load data from the backend.
 *   const { data, error, loading, reload } = useResource('/admin/feedback?status=new');
 * Pass `null` as the path to skip loading (e.g. until a filter is chosen).
 */
export function useResource(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const latest = useRef(path);

  const load = useCallback(async () => {
    if (!path) return;
    latest.current = path;
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data } = await tracked(get(path));
      if (latest.current === path) setState({ data, error: null, loading: false });
    } catch (error) {
      if (latest.current === path) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    // Fetch on mount and whenever the path changes
    void load();
  }, [load]);

  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

/**
 * Run a write action with busy/error state and optional confirmation.
 *   const { run, busy, error } = useAction();
 *   run(() => del(`/admin/x/${id}`), { confirm: { title: 'Delete?', message: '…', confirmLabel: 'Delete', danger: true }, success: 'Deleted', after: reload })
 *   (confirm can also be a plain string; it opens the admin's confirm dialog, see ConfirmProvider)
 */
export function useAction(toast) {
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (fn, { confirm, success, after } = {}) => {
      if (confirm && !(await ask(confirm))) return undefined;
      setBusy(true);
      setError(null);
      try {
        const result = await tracked(fn());
        if (success) toast?.(success, 'success');
        await after?.(result);
        return result;
      } catch (e) {
        setError(e.message);
        toast?.(e.message, 'error');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast, ask],
  );

  return { run, busy, error, clearError: () => setError(null) };
}
