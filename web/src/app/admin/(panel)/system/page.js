'use client';

import { useState } from 'react';
import { Badge, DataTable, ErrorBox, Field, PageHeader, Section, Spinner, StatCard, useToast } from '@/components/admin/kit';
import { useAdmin } from '@/components/AdminShell';
import { post } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

const uptime = (s) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);

export default function SystemPage() {
  const me = useAdmin();
  const toast = useToast();
  const { data, error, loading, reload } = useResource('/admin/system');
  const [to, setTo] = useState(me.email);
  const { run, busy } = useAction(toast);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { api: a, database: db, migrations: m, email } = data;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="System" subtitle="Health of the API, database and email.">
        <button className="btn" onClick={reload}>Refresh</button>
      </PageHeader>

      <div className="grid grid-4">
        <StatCard label="API" value={<span style={{ color: 'var(--green)' }}>● Up</span>} sub={`${a.env} · ${a.node} · up ${uptime(a.uptimeSeconds)}`} />
        <StatCard label="Database" value={`${db.latencyMs} ms`} sub={`${db.version} · ${db.size}`} />
        <StatCard label="Connections" value={`${db.pool.total - db.pool.idle} active`} sub={`${db.pool.idle} idle · ${db.pool.waiting} waiting`} />
        <StatCard label="Migrations" value={m.pending.length ? <span style={{ color: 'var(--amber)' }}>{m.pending.length} pending</span> : 'Up to date'} sub={`${m.applied.length} applied`} />
      </div>

      <Section title="Email">
        <div className="stack" style={{ gap: 14 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="muted">Provider</span>
            <Badge tone={email.provider === 'console' ? 'warning' : 'success'}>{email.provider}</Badge>
            <span className="muted">from</span>
            <span className="mono">{email.from}</span>
          </div>
          {email.provider === 'console' ? (
            <div className="error" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
              Emails are only printed in the server log. Set BREVO_API_KEY on the server to send real emails.
            </div>
          ) : null}
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <Field label="Send a test email to">
              <input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 280 }} />
            </Field>
            <button className="btn btn-primary" disabled={busy || !to.includes('@')} onClick={() => run(() => post('/admin/system/test-email', { to }), { success: `Test email sent to ${to}` })}>
              {busy ? 'Sending…' : 'Send test email'}
            </button>
          </div>
        </div>
      </Section>

      <div className="grid grid-2">
        <Section title="Tables">
          <DataTable rowKey="name" rows={db.tables} columns={[{ key: 'name', title: 'Table', render: (t) => <span className="mono">{t.name}</span> }, { key: 'rows', title: 'Rows (approx.)', align: 'right' }]} />
        </Section>
        <Section title="Database migrations">
          <DataTable
            rowKey="name"
            rows={[...m.pending.map((name) => ({ name, pending: true })), ...[...m.applied].reverse()]}
            columns={[
              { key: 'name', title: 'File', render: (r) => <span className="mono">{r.name}</span> },
              { key: 'appliedAt', title: 'Applied', render: (r) => (r.pending ? <Badge tone="warning">pending — restart API</Badge> : <span className="small muted">{fmtDateTime(r.appliedAt)}</span>) },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
