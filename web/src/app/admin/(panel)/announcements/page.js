'use client';

import { useState } from 'react';
import { Badge, DataTable, ErrorBox, Field, Modal, PageHeader, Pager, SearchBox, Toggle, useListQuery, useToast } from '@/components/admin/kit';
import { del, patch, post } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

const LEVELS = [
  { value: 'info', label: 'Info', tone: 'info' },
  { value: 'success', label: 'Good news', tone: 'success' },
  { value: 'warning', label: 'Warning', tone: 'warning' },
  { value: 'danger', label: 'Important', tone: 'danger' },
];
const toneOf = (level) => LEVELS.find((l) => l.value === level)?.tone ?? 'info';

// <input type="datetime-local"> works in local time; the API stores UTC ISO strings
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

const blank = { title: '', body: '', level: 'info', ctaLabel: '', ctaUrl: '', startsAt: null, endsAt: null, active: true };

export default function AnnouncementsPage() {
  const toast = useToast();
  const list = useListQuery('/admin/announcements');
  const { data, error, loading, reload } = useResource(list.path);
  const [editing, setEditing] = useState(null);
  const { run } = useAction(toast);

  const status = (a) =>
    a.live ? <Badge tone="success">Live</Badge> : !a.active ? <Badge>Hidden</Badge> : a.startsAt && new Date(a.startsAt) > new Date() ? <Badge tone="info">Scheduled</Badge> : <Badge>Ended</Badge>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="Announcements" subtitle="Banners shown at the top of the app’s Today screen. Use them for new features, tips or downtime notices.">
        <SearchBox onChange={list.setQ} placeholder="Search announcements…" />
        <button className="btn btn-primary" onClick={() => setEditing(blank)}>+ New announcement</button>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading}
        rows={data?.announcements}
        empty={list.q ? `Nothing matches “${list.q}”.` : 'No announcements yet.'}
        onRowClick={(a) => setEditing(a)}
        columns={[
          {
            key: 'title',
            title: 'Announcement',
            render: (a) => (
              <div>
                <div className="row" style={{ gap: 8 }}><Badge tone={toneOf(a.level)}>{LEVELS.find((l) => l.value === a.level)?.label}</Badge><strong>{a.title}</strong></div>
                {a.body ? <div className="muted small" style={{ marginTop: 4 }}>{a.body.slice(0, 120)}</div> : null}
              </div>
            ),
          },
          { key: 'status', title: 'Status', render: status },
          { key: 'window', title: 'Shown', render: (a) => <span className="small muted">{a.startsAt ? fmtDateTime(a.startsAt) : 'Now'} → {a.endsAt ? fmtDateTime(a.endsAt) : 'until hidden'}</span> },
          {
            key: 'actions',
            title: '',
            align: 'right',
            render: (a) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Toggle
                  checked={a.active}
                  label={a.active ? 'Visible' : 'Hidden'}
                  onChange={(active) => run(() => patch(`/admin/announcements/${a.id}`, { active }), { success: active ? 'Announcement visible' : 'Announcement hidden', after: reload })}
                />
              </span>
            ),
          },
        ]}
      />
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={list.setPage} noun="announcement" /> : null}
      {editing ? <Editor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </div>
  );
}

function Editor({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial.id;
  const [a, setA] = useState({ ...initial, ctaLabel: initial.ctaLabel ?? '', ctaUrl: initial.ctaUrl ?? '' });
  const { run, busy, error } = useAction(toast);
  const set = (k) => (v) => setA((s) => ({ ...s, [k]: v }));

  const body = {
    title: a.title,
    body: a.body,
    level: a.level,
    ctaLabel: a.ctaLabel || null,
    ctaUrl: a.ctaUrl || null,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    active: a.active,
  };
  const save = () =>
    run(() => (isNew ? post('/admin/announcements', body) : patch(`/admin/announcements/${a.id}`, body)), {
      success: isNew ? 'Announcement created' : 'Saved',
      after: onSaved,
    });
  const remove = () => run(() => del(`/admin/announcements/${a.id}`), { confirm: `Delete “${a.title}”?`, success: 'Deleted', after: onSaved });

  return (
    <Modal
      title={isNew ? 'New announcement' : 'Edit announcement'}
      onClose={onClose}
      footer={
        <>
          {!isNew ? <button className="btn btn-danger" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>Delete</button> : null}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !a.title.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Title" span>
          <input className="input" value={a.title} maxLength={120} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. New: spending budgets are here" />
        </Field>
        <Field label="Message" span>
          <textarea rows={3} style={{ fontFamily: 'inherit', fontSize: 14 }} maxLength={1000} value={a.body} onChange={(e) => set('body')(e.target.value)} />
        </Field>
        <Field label="Type">
          <select value={a.level} onChange={(e) => set('level')(e.target.value)}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Visibility">
          <Toggle checked={a.active} onChange={set('active')} label={a.active ? 'Visible' : 'Hidden'} />
        </Field>
        <Field label="Button text (optional)">
          <input className="input" value={a.ctaLabel} maxLength={40} onChange={(e) => set('ctaLabel')(e.target.value)} placeholder="Learn more" />
        </Field>
        <Field label="Button link (optional)">
          <input className="input" type="url" value={a.ctaUrl} onChange={(e) => set('ctaUrl')(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Show from (optional)" hint="Your local time">
          <input className="input" type="datetime-local" value={toLocalInput(a.startsAt)} onChange={(e) => set('startsAt')(fromLocalInput(e.target.value))} />
        </Field>
        <Field label="Hide after (optional)" hint="Leave empty to keep it until you hide it">
          <input className="input" type="datetime-local" value={toLocalInput(a.endsAt)} onChange={(e) => set('endsAt')(fromLocalInput(e.target.value))} />
        </Field>
      </div>
      <div>
        <div className="kpi-label" style={{ marginBottom: 8 }}>Preview</div>
        <div className="card" style={{ borderColor: `var(--${{ info: 'blue', success: 'green', warning: 'amber', danger: 'red' }[a.level]})` }}>
          <strong>{a.title || 'Title'}</strong>
          {a.body ? <p className="muted small" style={{ margin: '6px 0 0' }}>{a.body}</p> : null}
          {a.ctaLabel ? <div style={{ marginTop: 10 }}><span className="btn btn-sm">{a.ctaLabel}</span></div> : null}
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
    </Modal>
  );
}
