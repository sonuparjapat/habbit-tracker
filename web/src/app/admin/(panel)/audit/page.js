'use client';

import { useEffect, useState } from 'react';
import { fmtDateTime, get } from '@/lib/api';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    get(`/admin/audit-logs?page=${page}`).then((d) => setLogs(d.logs)).catch((e) => setError(e.message));
  }, [page]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every action taken by an admin, newest first.</p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {!logs && !error ? <div className="spinner" /> : null}
      {logs ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">Nothing yet.</td>
                </tr>
              ) : null}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</td>
                  <td>{l.actorEmail ?? '—'}</td>
                  <td><span className="badge violet">{l.action}</span></td>
                  <td className="small muted" style={{ fontFamily: 'ui-monospace, monospace' }}>
                    {Object.entries(l.meta ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button>
        <button className="btn btn-sm" disabled={!logs || logs.length < 50} onClick={() => setPage(page + 1)}>Older →</button>
      </div>
    </div>
  );
}
