'use client';

import { useEffect, useState } from 'react';
import { DataTable, ErrorBox, Field, PageHeader, Section, StatCard, useToast } from '@/components/admin/kit';
import { post } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

const AUDIENCES = [
  { value: 'all', label: 'Everyone who allows notifications' },
  { value: 'interest', label: 'People interested in…' },
  { value: 'inactive', label: 'People who haven’t opened the app for…' },
  { value: 'member', label: 'One person (by email)' },
];
const humanize = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

function audienceText(a) {
  if (!a || a.kind === 'all') return 'Everyone';
  if (a.kind === 'interest') return `Interested in ${humanize(a.interest)}`;
  if (a.kind === 'member') return a.email;
  return `Away ${a.days}+ days`;
}

/** What the notification looks like in an Android notification bar. */
function PhonePreview({ title, body }) {
  return (
    <div className="notif-phone">
      <div className="notif-statusbar">
        <span>9:41</span>
        <span>▾ ▴ ● 100%</span>
      </div>
      <div className="notif-card">
        <div className="notif-app">
          <span className="notif-icon">⚓</span> Anchor · now
        </div>
        <div className="notif-title">{title || 'Your title'}</div>
        <div className="notif-body">{body || 'Your message shows here, in the phone’s notification bar — even when the app is closed.'}</div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useResource('/admin/push');
  const { run, busy } = useAction(toast);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('/');
  const [kind, setKind] = useState('all');
  const [interest, setInterest] = useState('fitness');
  const [days, setDays] = useState(7);
  const [memberEmail, setMemberEmail] = useState('');
  const [count, setCount] = useState(null);

  const audience =
    kind === 'interest'
      ? { kind, interest }
      : kind === 'inactive'
        ? { kind, days: Number(days) || 1 }
        : kind === 'member'
          ? { kind, email: memberEmail.trim().toLowerCase() }
          : { kind: 'all' };
  const audienceKey = JSON.stringify(audience);

  // Live "will reach N people" while composing
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      post('/admin/push/count', { audience: JSON.parse(audienceKey) })
        .then((res) => !cancelled && setCount(res.data.count))
        .catch(() => !cancelled && setCount(null));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audienceKey]);

  const ready = title.trim() && body.trim();
  const payload = { title: title.trim(), body: body.trim(), link: link || null, audience };

  const sendTest = () => run(() => post('/admin/push/send', { ...payload, test: true }), { success: 'Sent to your phone' });
  const sendAll = () =>
    run(() => post('/admin/push/send', payload), {
      confirm: `Send “${payload.title}” to ${count ?? 'all matching'} people now? This can’t be undone.`,
      after: (res) => {
        const r = res.data.result;
        toast(`Sent to ${r.delivered} of ${r.recipients} phones${r.failed ? ` · ${r.failed} failed` : ''}`, r.failed ? 'error' : 'success');
        setTitle('');
        setBody('');
        reload();
      },
    });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader
        title="Notifications"
        subtitle="Send a message to members’ phones. It appears in the notification bar like any app’s, even when Anchor is closed."
      />
      <ErrorBox error={error} onRetry={reload} />

      <div className="grid grid-4">
        <StatCard label="Can receive" value={data?.reachable ?? '—'} sub="phones with notifications allowed" icon="📱" accent="violet" />
        <StatCard label="Sent so far" value={data?.campaigns.length ?? '—'} sub="notifications (last 50 shown)" icon="📨" accent="blue" />
        <StatCard
          label="Last sent"
          value={data?.campaigns[0] ? fmtDateTime(data.campaigns[0].createdAt) : '—'}
          sub={data?.campaigns[0]?.title ?? ''}
          icon="🕒"
          accent="green"
        />
      </div>

      <div className="notif-compose">
        <Section title="Write a notification">
          <div className="stack" style={{ gap: 14 }}>
            <Field label={`Title (${title.length}/65)`}>
              <input className="input" value={title} maxLength={65} onChange={(e) => setTitle(e.target.value)} placeholder="New boss this week! 🐉" />
            </Field>
            <Field label={`Message (${body.length}/240)`}>
              <textarea rows={3} style={{ fontFamily: 'inherit', fontSize: 14 }} value={body} maxLength={240} onChange={(e) => setBody(e.target.value)} placeholder="Keep your promises and beat the Doubt Dragon before Sunday." />
            </Field>
            <Field label="When tapped, open">
              <select value={link} onChange={(e) => setLink(e.target.value)}>
                {Object.entries(data?.links ?? { '/': 'Today' }).map(([path, label]) => (
                  <option key={path} value={path}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Send to">
              <div className="row wrap">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {kind === 'interest' ? (
                  <select value={interest} onChange={(e) => setInterest(e.target.value)}>
                    {(data?.interests ?? []).map((i) => <option key={i} value={i}>{humanize(i)}</option>)}
                  </select>
                ) : null}
                {kind === 'member' ? (
                  <input className="input" type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="member@example.com" style={{ width: 260 }} />
                ) : null}
                {kind === 'inactive' ? (
                  <span className="row" style={{ gap: 6 }}>
                    <input className="input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 90 }} /> days
                  </span>
                ) : null}
              </div>
            </Field>
            <div className="row wrap between">
              <span className="muted small">
                Will reach <strong style={{ color: 'var(--text)' }}>{count ?? '…'}</strong> {count === 1 ? 'person' : 'people'} · only members who allowed notifications and kept “News & tips” on
              </span>
              <div className="row">
                <button className="btn" disabled={!ready || busy} onClick={sendTest}>Send test to my phone</button>
                <button className="btn btn-primary" disabled={!ready || busy || !count} onClick={sendAll}>{busy ? 'Sending…' : `Send to ${count ?? 0}`}</button>
              </div>
            </div>
          </div>
        </Section>
        <PhonePreview title={title} body={body} />
      </div>

      <Section title="Sent notifications">
        <DataTable
          loading={loading}
          rows={data?.campaigns}
          empty="Nothing sent yet."
          columns={[
            { key: 'title', title: 'Notification', render: (c) => (<div><strong>{c.title}</strong><div className="muted small">{c.body}</div></div>) },
            { key: 'audience', title: 'Audience', render: (c) => <span className="small">{audienceText(c.audience)}</span> },
            { key: 'delivered', title: 'Delivered', align: 'right', render: (c) => <span>{c.delivered} / {c.recipients}{c.failed ? <span style={{ color: 'var(--red)' }}> · {c.failed} failed</span> : null}</span> },
            { key: 'createdAt', title: 'Sent', render: (c) => <span className="small muted">{fmtDateTime(c.createdAt)}<br />{c.sentBy}</span> },
          ]}
        />
      </Section>
    </div>
  );
}
