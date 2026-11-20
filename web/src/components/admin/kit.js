'use client';

/**
 * Admin UI kit — every admin page is built from these, so new pages need no new UI code.
 */
import { createContext, use, useCallback, useRef, useState } from 'react';

/* --------------------------------- Layout --------------------------------- */

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children ? <div className="row wrap">{children}</div> : null}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div className="card">
      {title || action ? (
        <div className="row between" style={{ marginBottom: 16 }}>
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/* ------------------------------ Status / data ------------------------------ */

export const Spinner = () => <div className="spinner" />;

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error row between">
      <span>{error.message ?? String(error)}</span>
      {onRetry ? <button className="btn btn-sm" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

export function Empty({ children = 'Nothing here yet.' }) {
  return <div className="empty">{children}</div>;
}

const BADGE_TONES = { success: 'green', danger: 'red', warning: 'amber', info: 'violet', neutral: '' };
export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge ${BADGE_TONES[tone] ?? tone}`}>{children}</span>;
}

const ACCENTS = {
  violet: ['linear-gradient(90deg, #7c5cff, #4f8bff)', 'rgba(124, 92, 255, 0.16)'],
  green: ['linear-gradient(90deg, #16a34a, #22c55e)', 'rgba(34, 197, 94, 0.14)'],
  red: ['linear-gradient(90deg, #be123c, #f43f5e)', 'rgba(244, 63, 94, 0.14)'],
  amber: ['linear-gradient(90deg, #d97706, #f59e0b)', 'rgba(245, 158, 11, 0.14)'],
  blue: ['linear-gradient(90deg, #2f6feb, #4f8bff)', 'rgba(79, 139, 255, 0.14)'],
};

export function StatCard({ label, value, sub, onClick, icon, accent = 'violet' }) {
  const [bar, soft] = ACCENTS[accent] ?? ACCENTS.violet;
  return (
    <div className={`card stat${onClick ? ' clickable' : ''}`} onClick={onClick} style={{ '--accent': bar, '--accent-soft': soft }}>
      {icon ? <span className="stat-icon">{icon}</span> : null}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? '—'}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

/** Daily bar chart for a [{ date, n }] series. */
export function BarChart({ data, color = '#7c5cff', label }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 170, display: 'block' }} role="img" aria-label={label}>
        {data.map((d, i) => {
          const h = (d.n / max) * 36;
          return (
            <rect key={d.date} x={i * w + w * 0.15} y={40 - h - 0.5} width={w * 0.7} height={Math.max(h, 0.4)} rx={0.6} fill={d.n ? color : '#232a39'}>
              <title>{`${d.date}: ${d.n}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="row between small muted" style={{ marginTop: 8 }}>
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function Bars({ items, color = 'var(--primary)' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="muted small">No data yet</div>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {items.map((i) => (
        <div key={i.label}>
          <div className="row between small" style={{ marginBottom: 6 }}>
            <span>{i.label}</span>
            <strong>{i.display ?? i.value}</strong>
          </div>
          <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(i.value / max) * 100}%`, height: '100%', background: color, borderRadius: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Generic table.
 *   columns: [{ key, title, render?: (row) => node, width?, align? }]
 */
export function DataTable({ columns, rows, rowKey = 'id', onRowClick, empty = 'Nothing here yet.', loading }) {
  if (loading && !rows) return <Spinner />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows?.length ? (
            <tr>
              <td colSpan={columns.length} className="empty">{empty}</td>
            </tr>
          ) : null}
          {rows?.map((row) => (
            <tr key={row[rowKey]} className={onRowClick ? 'clickable' : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- Search + paging (every list) --------------------------- */

/** A search box that waits until typing pauses (so the server isn't asked on every key). */
export function SearchBox({ value, onChange, placeholder = 'Search…', width = 260 }) {
  const [text, setText] = useState(value ?? '');
  const timer = useRef(null);
  return (
    <div className="search-box" style={{ width }}>
      <span className="search-icon" aria-hidden>⌕</span>
      <input
        className="input"
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v.trim()), 300);
        }}
      />
    </div>
  );
}

/** "Page 2 of 5 · 112 results" with previous / next. Hidden when everything fits on one page. */
export function Pager({ page, pages, total, onPage, noun = 'result' }) {
  if (!total) return null;
  return (
    <div className="row between wrap pager">
      <span className="muted small">
        {total} {noun}
        {total === 1 ? '' : 's'}
        {pages > 1 ? ` · page ${page} of ${pages}` : ''}
      </span>
      {pages > 1 ? (
        <div className="row">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Server-side list state: search text + page + any filters → the API path.
 *   const list = useListQuery('/admin/feedback', { status });
 *   useResource(list.path) … <SearchBox onChange={list.setQ} /> … <Pager … onPage={list.setPage} />
 * Changing the search or a filter goes back to page 1.
 */
export function useListQuery(base, filters = {}, limit = 25) {
  const [q, setQState] = useState('');
  const [page, setPage] = useState(1);
  const filterKey = JSON.stringify(filters);
  const [lastFilters, setLastFilters] = useState(filterKey);
  if (filterKey !== lastFilters) {
    setLastFilters(filterKey);
    setPage(1);
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== '' && v !== null && v !== undefined) params.set(k, String(v));
  if (q) params.set('q', q);
  params.set('limit', String(limit));
  if (page > 1) params.set('page', String(page));
  return {
    path: `${base}?${params.toString()}`,
    q,
    page,
    setPage,
    setQ: (v) => {
      setQState(v);
      setPage(1);
    },
  };
}

/** In-browser search + paging for short lists (templates, packs…): no extra requests. */
export function useClientList(rows, toText, pageSize = 25) {
  const [q, setQState] = useState('');
  const [page, setPage] = useState(1);
  const needle = q.toLowerCase();
  const filtered = (rows ?? []).filter((r) => !needle || toText(r).toLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  return {
    items: filtered.slice((current - 1) * pageSize, current * pageSize),
    total: filtered.length,
    page: current,
    pages,
    setPage,
    setQ: (v) => {
      setQState(v);
      setPage(1);
    },
  };
}

export function Pagination({ page, hasNext, onPage }) {
  if (page <= 1 && !hasNext) return null;
  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="muted small">Page {page}</span>
      <button className="btn btn-sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.value} className={`tab ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count ? <span className="tab-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Overlays -------------------------------- */

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(820px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
        {footer ? <div className="row" style={{ justifyContent: 'flex-end' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------- Forms ---------------------------------- */

export function Field({ label, hint, error, children, span }) {
  return (
    <label className="field" style={span ? { gridColumn: '1 / -1' } : undefined}>
      {label}
      {children}
      {error ? <span style={{ color: 'var(--red)', fontWeight: 500 }}>{error}</span> : hint ? <span className="small muted" style={{ fontWeight: 400 }}>{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="check" style={{ opacity: disabled ? 0.5 : 1 }}>
      <span className={`switch ${checked ? 'on' : ''}`} aria-hidden />
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ display: 'none' }} />
      {label}
    </label>
  );
}

/* ---------------------------------- Toasts --------------------------------- */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext>
  );
}

/** const toast = useToast(); toast('Saved') / toast('Failed', 'error') */
export const useToast = () => use(ToastContext);

/* ------------------------------ Confirm dialog ------------------------------ */

const ConfirmContext = createContext(null);

/**
 * A proper dialog instead of the browser's confirm() / prompt():
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete template?', message: '…', confirmLabel: 'Delete', danger: true }))) return;
 *
 *   // With a text field (returns the text, or null if cancelled):
 *   const reason = await confirm({ title: 'Suspend?', input: { label: 'Reason', placeholder: '…' } });
 *
 * A plain string works too: await confirm('Delete this?')
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');

  const ask = useCallback(
    (options) =>
      new Promise((resolve) => {
        const o = typeof options === 'string' ? { message: options } : options;
        setText(o.input?.defaultValue ?? '');
        setDialog({ ...o, resolve });
      }),
    [],
  );

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };
  const confirmValue = () => (dialog?.input ? text.trim() : true);
  const blocked = dialog?.input?.required && !text.trim();

  return (
    <ConfirmContext value={ask}>
      {children}
      {dialog ? (
        <div className="modal-wrap confirm-wrap" onClick={() => close(dialog.input ? null : false)}>
          <div
            className={`modal confirm ${dialog.danger ? 'danger' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-label={dialog.title ?? 'Please confirm'}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close(dialog.input ? null : false);
              if (e.key === 'Enter' && !e.shiftKey && !blocked && (dialog.input ? !dialog.input.multiline : true)) close(confirmValue());
            }}>
            <div className="confirm-icon" aria-hidden>{dialog.icon ?? (dialog.danger ? '⚠️' : '❓')}</div>
            <h2>{dialog.title ?? 'Are you sure?'}</h2>
            {dialog.message ? <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{dialog.message}</p> : null}
            {dialog.input ? (
              <Field label={dialog.input.label} hint={dialog.input.hint}>
                {dialog.input.multiline ? (
                  <textarea rows={3} autoFocus value={text} placeholder={dialog.input.placeholder} maxLength={dialog.input.maxLength ?? 300} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 14 }} />
                ) : (
                  <input className="input" autoFocus value={text} placeholder={dialog.input.placeholder} maxLength={dialog.input.maxLength ?? 300} onChange={(e) => setText(e.target.value)} />
                )}
              </Field>
            ) : null}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn" onClick={() => close(dialog.input ? null : false)} autoFocus={!dialog.input}>
                {dialog.cancelLabel ?? 'Cancel'}
              </button>
              <button className={`btn ${dialog.danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={blocked} onClick={() => close(confirmValue())}>
                {dialog.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext>
  );
}

/** Ask the admin to confirm (see ConfirmProvider). Falls back to the browser's confirm() outside the admin shell. */
export function useConfirm() {
  const ask = use(ConfirmContext);
  return ask ?? ((o) => Promise.resolve(window.confirm(typeof o === 'string' ? o : [o.title, o.message].filter(Boolean).join('\n\n'))));
}
