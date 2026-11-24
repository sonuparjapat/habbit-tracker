'use client';

import { useState } from 'react';
import { Badge, Drawer, Empty, ErrorBox, Field, PageHeader, Pager, SearchBox, TableSkeleton, Tabs, useListQuery, useToast } from '@/components/admin/kit';
import { del, patch } from '@/lib/api';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

const KINDS = { crash: { label: 'App crash', tone: 'danger' }, bug: { label: 'Bug', tone: 'danger' }, idea: { label: 'Idea', tone: 'info' }, question: { label: 'Question', tone: 'warning' }, other: { label: 'Other', tone: 'neutral' } };
const STATUSES = { new: { label: 'New', tone: 'danger' }, in_progress: { label: 'In progress', tone: 'warning' }, resolved: { label: 'Resolved', tone: 'success' } };

export default function FeedbackPage() {
  const [status, setStatus] = useState('new');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState(null);
  const list = useListQuery('/admin/feedback', { status, kind }, 50);
  const { data, error, loading, reload } = useResource(list.path);
  const c = data?.counts ?? {};

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="Feedback" subtitle="Bug reports, ideas and questions sent from the app.">
        <SearchBox onChange={list.setQ} placeholder="Search message, name, email…" />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </PageHeader>
      <Tabs
        value={status}
        onChange={(v) => setStatus(v)}
        options={[
          { value: 'new', label: 'New', count: c.new },
          { value: 'in_progress', label: 'In progress', count: c.in_progress },
          { value: 'resolved', label: 'Resolved' },
          { value: '', label: 'All' },
        ]}
      />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton rows={4} /> : null}
      {data && !data.feedback.length ? <div className="card"><Empty>{list.q ? `Nothing matches “${list.q}”.` : status === 'new' ? 'Inbox zero 🎉 — nothing new.' : 'Nothing here.'}</Empty></div> : null}
      <div className="stack" style={{ gap: 10 }}>
        {data?.feedback.map((f) => (
          <div key={f.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(f)}>
            <div className="row between wrap">
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={KINDS[f.kind].tone}>{KINDS[f.kind].label}</Badge>
                <Badge tone={STATUSES[f.status].tone}>{STATUSES[f.status].label}</Badge>
                <span className="small muted">{f.userName ?? 'Guest'}{f.email ? ` · ${f.email}` : ''}</span>
              </div>
              <span className="small muted">{timeAgo(f.createdAt)}</span>
            </div>
            <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{f.message.length > 280 ? `${f.message.slice(0, 280)}…` : f.message}</p>
          </div>
        ))}
      </div>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={list.setPage} noun="message" /> : null}
      {open ? <FeedbackDrawer item={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload(); }} /> : null}
    </div>
  );
}

function FeedbackDrawer({ item, onClose, onChanged }) {
  const toast = useToast();
  const [note, setNote] = useState(item.adminNote ?? '');
  const { run, busy } = useAction(toast);
  const update = (body, success) => run(() => patch(`/admin/feedback/${item.id}`, body), { success, after: onChanged });
  const subject = encodeURIComponent(`Re: your ${KINDS[item.kind].label.toLowerCase()} — Holdfast`);
  const quoted = encodeURIComponent(`\n\n---\nYou wrote:\n${item.message}`);

  return (
    <Drawer title="Feedback" onClose={onClose}>
      <div className="row wrap" style={{ gap: 8 }}>
        <Badge tone={KINDS[item.kind].tone}>{KINDS[item.kind].label}</Badge>
        <Badge tone={STATUSES[item.status].tone}>{STATUSES[item.status].label}</Badge>
      </div>
      <div className="card">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.message}</p>
      </div>
      <div className="small muted">
        From <strong style={{ color: 'var(--text)' }}>{item.userName ?? 'Guest'}</strong>{item.email ? ` (${item.email})` : ''} · {fmtDateTime(item.createdAt)}
        {item.appVersion ? ` · app ${item.appVersion}` : ''}
        {item.platform ? ` · ${item.platform}` : ''}
      </div>
      {item.email ? (
        <a className="btn btn-primary" href={`mailto:${item.email}?subject=${subject}&body=${quoted}`} style={{ textDecoration: 'none' }}>
          Reply by email
        </a>
      ) : null}
      <Field label="Internal note" hint="Only admins see this.">
        <textarea rows={3} style={{ fontFamily: 'inherit', fontSize: 14 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="row wrap">
        {item.status !== 'in_progress' ? <button className="btn" disabled={busy} onClick={() => update({ status: 'in_progress', adminNote: note || null }, 'Marked in progress')}>Mark in progress</button> : null}
        {item.status !== 'resolved' ? <button className="btn" disabled={busy} onClick={() => update({ status: 'resolved', adminNote: note || null }, 'Resolved')}>Resolve</button> : null}
        {item.status !== 'new' ? <button className="btn" disabled={busy} onClick={() => update({ status: 'new' }, 'Moved back to New')}>Reopen</button> : null}
        {note !== (item.adminNote ?? '') ? <button className="btn" disabled={busy} onClick={() => update({ adminNote: note || null }, 'Note saved')}>Save note</button> : null}
      </div>
      <button className="btn btn-danger" disabled={busy} onClick={() => run(() => del(`/admin/feedback/${item.id}`), { confirm: { title: 'Delete this feedback?', message: "Delete this feedback permanently?", confirmLabel: 'Delete', danger: true }, success: 'Deleted', after: onChanged })}>
        Delete
      </button>
    </Drawer>
  );
}
