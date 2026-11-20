'use client';

import { useState } from 'react';
import { Badge, DataTable, ErrorBox, Field, PageHeader, Pager, SearchBox, Section, PageSkeleton, StatCard, useClientList, useListQuery, useToast } from '@/components/admin/kit';
import { del, post } from '@/lib/api';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

const DURATIONS = [
  { value: '1', label: '1 hour' },
  { value: '24', label: '24 hours' },
  { value: '168', label: '7 days' },
  { value: '', label: 'Until I remove it' },
];

const EVENT_LABELS = {
  login_failed: { label: 'Wrong password', tone: 'warning' },
  account_locked: { label: 'Account locked', tone: 'danger' },
  account_unlocked: { label: 'Account unlocked', tone: 'success' },
  ip_auto_blocked: { label: 'IP auto-blocked', tone: 'danger' },
  ip_blocked: { label: 'IP blocked', tone: 'danger' },
  ip_unblocked: { label: 'IP unblocked', tone: 'success' },
  password_reset: { label: 'Password reset', tone: 'info' },
  password_changed: { label: 'Password changed', tone: 'info' },
};

export default function SecurityPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useResource('/admin/security');
  const { run, busy } = useAction(toast);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('24');
  const [kind, setKind] = useState('');
  // The security log grows with every failed sign-in → searched and paged on the server
  const events = useListQuery('/admin/security/events', { kind });
  const log = useResource(events.path);
  // Blocked IPs and locked accounts are short lists → searched in the browser
  const blocked = useClientList(data?.blocked, (b) => `${b.target} ${b.reason ?? ''} ${b.createdBy ?? ''}`, 10);
  const locked = useClientList(data?.locked, (m) => `${m.email} ${m.name}`, 10);

  if (loading && !data) return <PageSkeleton />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const block = (ip, why = reason, h = hours) =>
    run(() => post('/admin/security/ips', { target: ip.trim(), reason: why.trim() || undefined, hours: h ? Number(h) : undefined }), {
      success: `Blocked ${ip}`,
      after: () => {
        setTarget('');
        setReason('');
        reload();
      },
    });
  const unblock = (b) => run(() => del(`/admin/security/ips/${b.id}`), { confirm: { icon: '🔓', title: `Unblock ${b.target}?`, message: 'People on this network can use the app again straight away.', confirmLabel: 'Unblock' }, success: `Unblocked ${b.target}`, after: reload });
  const unlock = (m) => run(() => post(`/admin/users/${m.id}/unlock`), { success: `Unlocked ${m.email}`, after: reload });

  const failures24h = data.failing.reduce((s, f) => s + f.failures, 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="Security" subtitle="Blocked networks, locked accounts and suspicious sign-in activity.">
        <button className="btn" onClick={() => { reload(); log.reload(); }}>Refresh</button>
      </PageHeader>

      <div className="grid grid-4">
        <StatCard label="Blocked IPs" value={data.blocked.length} sub={`${data.blocked.filter((b) => b.auto).length} automatic`} icon="🚫" accent="red" />
        <StatCard label="Locked accounts" value={data.locked.length} sub="owners can unlock by email" icon="🔒" accent="amber" />
        <StatCard label="Wrong passwords · 24h" value={failures24h} sub={`from ${data.failing.length} networks`} icon="⚠️" accent="violet" />
        <StatCard label="Your IP" value={<span className="mono" style={{ fontSize: 18 }}>{data.yourIp}</span>} sub="can never be blocked from here" icon="🛡️" accent="green" />
      </div>

      <Section title="Block an IP or range">
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <Field label="IP or range">
            <input className="input mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="203.0.113.7 or 203.0.113.0/24" style={{ width: 260 }} />
          </Field>
          <Field label="Reason (optional)">
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Scraping, spam sign-ups…" style={{ width: 240 }} maxLength={200} />
          </Field>
          <Field label="For">
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              {DURATIONS.map((d) => <option key={d.label} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          <button className="btn btn-primary" disabled={busy || target.trim().length < 2} onClick={() => block(target)}>Block</button>
        </div>
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          Careful with ranges: many people can share one mobile-network IP. Networks that fail sign-ins on many accounts are blocked automatically for a while (App settings → Security).
        </p>
      </Section>

      <div className="grid grid-2">
        <Section title="Blocked now" action={<SearchBox onChange={blocked.setQ} placeholder="Search IP or reason…" width={200} />}>
          <DataTable
            rowKey="id"
            rows={blocked.items}
            empty="Nothing is blocked."
            columns={[
              { key: 'target', title: 'IP / range', render: (b) => (<div><span className="mono">{b.target}</span> {b.auto ? <Badge tone="warning">auto</Badge> : null}<div className="small muted">{b.reason ?? '—'}</div></div>) },
              { key: 'expiresAt', title: 'Until', render: (b) => <span className="small muted">{b.expiresAt ? fmtDateTime(b.expiresAt) : 'Removed by hand'}</span> },
              { key: 'x', title: '', align: 'right', render: (b) => <button className="btn btn-sm" disabled={busy} onClick={() => unblock(b)}>Unblock</button> },
            ]}
          />
          <Pager page={blocked.page} pages={blocked.pages} total={blocked.total} onPage={blocked.setPage} noun="block" />
        </Section>

        <Section title="Most wrong passwords · last 24h">
          <DataTable
            rowKey="ip"
            rows={data.failing}
            empty="No failed sign-ins. 👍"
            columns={[
              { key: 'ip', title: 'IP', render: (f) => <span className="mono">{f.ip}</span> },
              { key: 'failures', title: 'Fails', align: 'right' },
              { key: 'accounts', title: 'Accounts', align: 'right', render: (f) => <span style={{ color: f.accounts >= 5 ? 'var(--red)' : undefined }}>{f.accounts}</span> },
              { key: 'lastAt', title: 'Last', render: (f) => <span className="small muted">{timeAgo(f.lastAt)}</span> },
              {
                key: 'x',
                title: '',
                align: 'right',
                render: (f) =>
                  data.blocked.some((b) => b.target === f.ip) || f.ip === data.yourIp ? null : (
                    <button className="btn btn-sm" disabled={busy} onClick={() => block(f.ip, 'Many failed sign-ins', '24')}>Block 24h</button>
                  ),
              },
            ]}
          />
        </Section>
      </div>

      <Section title="Locked accounts" action={<SearchBox onChange={locked.setQ} placeholder="Search email or name…" width={220} />}>
        <DataTable
          rows={locked.items}
          empty="No locked accounts."
          columns={[
            { key: 'email', title: 'Member', render: (m) => (<div><strong>{m.name}</strong><div className="small muted">{m.email}</div></div>) },
            { key: 'lockReason', title: 'Why', render: (m) => (m.lockReason === 'admin' ? 'Locked by an admin' : `${m.failedLogins} wrong passwords`) },
            { key: 'lockedAt', title: 'Since', render: (m) => <span className="small muted">{timeAgo(m.lockedAt)}</span> },
            { key: 'x', title: '', align: 'right', render: (m) => <button className="btn btn-sm" disabled={busy} onClick={() => unlock(m)}>Unlock</button> },
          ]}
        />
        <Pager page={locked.page} pages={locked.pages} total={locked.total} onPage={locked.setPage} noun="locked account" />
      </Section>

      <Section
        title="Security log"
        action={
          <div className="list-tools">
            <SearchBox onChange={events.setQ} placeholder="Search email, IP, detail…" />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All events</option>
              {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        }>
        <DataTable
          rows={log.data?.events}
          loading={log.loading}
          empty="Nothing yet."
          columns={[
            { key: 'kind', title: 'Event', render: (e) => <Badge tone={EVENT_LABELS[e.kind]?.tone ?? 'neutral'}>{EVENT_LABELS[e.kind]?.label ?? e.kind}</Badge> },
            { key: 'email', title: 'Account', render: (e) => <span className="small">{e.email ?? '—'}</span> },
            { key: 'ip', title: 'IP', render: (e) => <span className="mono small">{e.ip ?? '—'}</span> },
            { key: 'detail', title: 'Detail', render: (e) => <span className="small muted">{e.detail ?? ''}</span> },
            { key: 'createdAt', title: 'When', render: (e) => <span className="small muted">{fmtDateTime(e.createdAt)}</span> },
          ]}
        />
        {log.data ? <Pager page={log.data.page} pages={log.data.pages} total={log.data.total} onPage={events.setPage} noun="event" /> : null}
      </Section>
    </div>
  );
}
