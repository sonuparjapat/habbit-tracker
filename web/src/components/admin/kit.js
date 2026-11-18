'use client';

/**
 * Admin UI kit — every admin page is built from these, so new pages need no new UI code.
 */
import { createContext, use, useCallback, useState } from 'react';

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

export function StatCard({ label, value, sub, onClick }) {
  return (
    <div className="card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
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
