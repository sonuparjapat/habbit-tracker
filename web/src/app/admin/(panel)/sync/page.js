'use client';

import { useState } from 'react';
import { Badge, DataTable, ErrorBox, PageHeader, Pager, SearchBox, Section, StatCard, useListQuery, useToast } from '@/components/admin/kit';
import { post } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

const STATUS = {
  applied: { label: 'Applied', tone: 'success' },
  failed: { label: 'Retrying', tone: 'warning' },
  dead: { label: 'Gave up', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'danger' },
  superseded: { label: 'Replaced by newer', tone: 'neutral' },
  discarded: { label: 'Discarded', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'info' },
};

const FILTERS = [
  { value: '', label: 'Needs attention' },
  { value: 'failed', label: 'Retrying' },
  { value: 'dead', label: 'Gave up' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'applied', label: 'Applied' },
  { value: 'discarded', label: 'Discarded' },
];

/** '2026-…' in the future → 'in 4 min' */
const nextIn = (d) => {
  const min = Math.ceil((new Date(d).getTime() - Date.now()) / 60000);
  return min <= 0 ? 'any moment' : min < 60 ? `in ${min} min` : `in ${Math.ceil(min / 60)} h`;
};

/** What a change was, in plain words. */
function describe(op) {
  const entry = op.path.match(/^\/trackers\/[^/]+\/entries\/(\d{4}-\d{2}-\d{2})$/);
  if (entry) {
    if (op.method === 'DELETE') return `Undo check-in · ${entry[1]}`;
    const b = op.body ?? {};
    const what = b.reflection ? 'Journal' : b.value !== undefined ? `Logged ${b.value}` : b.completed ? 'Check-in' : 'Entry';
    return `${what} · ${entry[1]}`;
  }
  if (op.path === '/dashboard/review') return `Weekly review · ${op.body?.weekStart ?? ''}`;
  if (op.path === '/dashboard/achievements/seen') return 'Badges seen';
  return `${op.method} ${op.path}`;
}

/** Changes members made while the server was asleep / unreachable. */
export default function SyncPage() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const list = useListQuery('/admin/sync', { status });
  const { data, error, loading, reload } = useResource(list.path);
  const { run, busy } = useAction(toast);
  const c = data?.counts ?? {};
  const attention = (c.failed ?? 0) + (c.dead ?? 0) + (c.rejected ?? 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader
        title="Offline sync"
        subtitle="Changes members made while the server was asleep or unreachable. They are applied automatically; failed ones are retried every 2 minutes.">
        <button className="btn" onClick={reload}>Refresh</button>
        <button className="btn btn-primary" disabled={busy || !((c.failed ?? 0) + (c.dead ?? 0))} onClick={() => run(() => post('/admin/sync/retry-all'), { success: 'Retried', after: reload })}>
          Retry all now
        </button>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />

      <div className="grid grid-4">
        <StatCard label="Applied · 30 days" value={c.applied ?? 0} sub="delivered automatically" icon="✅" accent="green" />
        <StatCard label="Retrying" value={c.failed ?? 0} sub="temporary problem — automatic" icon="🔁" accent="amber" />
        <StatCard label="Needs attention" value={attention} sub="rejected or gave up" icon="⚠️" accent={attention ? 'red' : 'violet'} />
        <StatCard label="Replaced by newer" value={c.superseded ?? 0} sub="an old change arrived after a newer one" icon="⏭️" accent="blue" />
      </div>

      <Section
        title="Changes"
        action={
          <div className="list-tools">
          <SearchBox onChange={list.setQ} placeholder="Search email, change, error…" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          </div>
        }>
        <DataTable
          loading={loading}
          rows={data?.ops}
          empty={status ? 'Nothing here.' : 'Nothing needs attention. Every offline change was delivered. 🎉'}
          columns={[
            { key: 'what', title: 'Change', render: (op) => (<div><strong>{describe(op)}</strong><div className="small muted">{op.email}</div></div>) },
            { key: 'status', title: 'Status', render: (op) => <Badge tone={STATUS[op.status]?.tone}>{STATUS[op.status]?.label ?? op.status}</Badge> },
            {
              key: 'error',
              title: 'Why',
              render: (op) => (
                <span className="small">
                  {op.lastError ?? '—'}
                  {op.status === 'failed' ? <span className="muted"> · next try {nextIn(op.nextAttemptAt)}</span> : null}
                  {op.attempts ? <span className="muted"> · {op.attempts} tries</span> : null}
                </span>
              ),
            },
            { key: 'madeAt', title: 'Made', render: (op) => <span className="small muted">{fmtDateTime(op.madeAt)}</span> },
            {
              key: 'actions',
              title: '',
              align: 'right',
              render: (op) =>
                ['failed', 'dead', 'rejected'].includes(op.status) ? (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm" disabled={busy} onClick={() => run(() => post(`/admin/sync/${op.id}/retry`), { after: (res) => { toast(`Result: ${STATUS[res.data.status]?.label ?? res.data.status}`); reload(); } })}>
                      Retry
                    </button>
                    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => post(`/admin/sync/${op.id}/discard`), { confirm: 'Discard this change? It will not be applied.', success: 'Discarded', after: reload })}>
                      Discard
                    </button>
                  </div>
                ) : null,
            },
          ]}
        />
        {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={list.setPage} noun="change" /> : null}
      </Section>
    </div>
  );
}
