'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

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
      const data = await api.get(path);
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
 *   run(() => api.del(`/admin/x/${id}`), { confirm: 'Delete?', success: 'Deleted', after: reload })
 */
export function useAction(toast) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (fn, { confirm, success, after } = {}) => {
      if (confirm && !window.confirm(confirm)) return undefined;
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
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
    [toast],
  );

  return { run, busy, error, clearError: () => setError(null) };
}
