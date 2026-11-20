'use client';

import { useState } from 'react';
import { Badge, DataTable, ErrorBox, Field, Modal, PageHeader, Toggle, useToast } from '@/components/admin/kit';
import { del, patch, post } from '@/lib/api';
import { useAction, useResource } from '@/lib/useApi';

const blank = { slug: '', name: '', emoji: '✨', description: '', templateSlugs: [], sortOrder: 0, active: true };

/** Starter packs: one tap in the app creates every tracker in the pack. */
export default function PacksPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useResource('/admin/starter-packs');
  const { data: tpl } = useResource('/admin/templates');
  const [editing, setEditing] = useState(null);
  const { run, busy } = useAction(toast);

  const templates = tpl?.templates ?? [];
  const nameOf = (slug) => templates.find((t) => t.slug === slug)?.name ?? slug;
  const used = (p) => p.templateSlugs.reduce((s, slug) => s + (data?.usage?.[slug] ?? 0), 0);

  const save = () => {
    const isNew = !editing.id;
    const body = { name: editing.name, emoji: editing.emoji, description: editing.description, templateSlugs: editing.templateSlugs, sortOrder: Number(editing.sortOrder) || 0, active: editing.active };
    return run(() => (isNew ? post('/admin/starter-packs', { ...body, slug: editing.slug.trim() }) : patch(`/admin/starter-packs/${editing.id}`, body)), {
      success: isNew ? 'Pack created' : 'Pack saved',
      after: () => {
        setEditing(null);
        reload();
      },
    });
  };
  const remove = (p) =>
    run(() => del(`/admin/starter-packs/${p.id}`), {
      confirm: p.builtIn ? `“${p.name}” comes with the app, so it will be hidden (not deleted). Continue?` : `Delete “${p.name}”?`,
      success: p.builtIn ? 'Pack hidden' : 'Pack deleted',
      after: () => {
        setEditing(null);
        reload();
      },
    });

  const toggleTemplate = (slug) =>
    setEditing((e) => ({ ...e, templateSlugs: e.templateSlugs.includes(slug) ? e.templateSlugs.filter((s) => s !== slug) : [...e.templateSlugs, slug] }));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="Starter packs" subtitle="Bundles of templates. New members pick one and get several trackers in one tap — no empty screen.">
        <button className="btn btn-primary" onClick={() => setEditing(blank)}>+ New pack</button>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />

      <DataTable
        loading={loading}
        rows={data?.packs}
        empty="No packs yet."
        onRowClick={(p) => setEditing({ ...p })}
        columns={[
          {
            key: 'name',
            title: 'Pack',
            render: (p) => (
              <div className="row" style={{ gap: 12 }}>
                <span style={{ fontSize: 26 }}>{p.emoji}</span>
                <div>
                  <strong>{p.name}</strong> {p.builtIn ? <Badge>built-in</Badge> : null}
                  <div className="muted small">{p.description}</div>
                </div>
              </div>
            ),
          },
          { key: 'templates', title: 'Trackers', render: (p) => <span className="small">{p.templateSlugs.map(nameOf).join(' · ')}</span> },
          { key: 'used', title: 'Trackers created', align: 'right', render: (p) => <span className="small">{used(p)}</span> },
          { key: 'active', title: 'Status', render: (p) => (p.active ? <Badge tone="success">Shown</Badge> : <Badge>Hidden</Badge>) },
        ]}
      />

      {editing ? (
        <Modal
          title={editing.id ? `Edit ${editing.name}` : 'New starter pack'}
          onClose={() => setEditing(null)}
          wide
          footer={
            <div className="row between" style={{ width: '100%' }}>
              {editing.id ? <button className="btn btn-danger" disabled={busy} onClick={() => remove(editing)}>{editing.builtIn ? 'Hide' : 'Delete'}</button> : <span />}
              <div className="row">
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy || !editing.name.trim() || !editing.templateSlugs.length || (!editing.id && !editing.slug.trim())} onClick={save}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          }>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <Field label="Emoji">
              <input className="input" value={editing.emoji} maxLength={8} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} style={{ width: 80, fontSize: 20 }} />
            </Field>
            <Field label="Name">
              <input className="input" value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Morning routine" style={{ width: 260 }} />
            </Field>
            {!editing.id ? (
              <Field label="Slug (never changes)" hint="lowercase-with-dashes">
                <input className="input mono" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase() })} placeholder="morning-routine" style={{ width: 200 }} />
              </Field>
            ) : null}
            <Field label="Order">
              <input className="input" type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} style={{ width: 90 }} />
            </Field>
          </div>
          <Field label="Description (shown in the app)">
            <textarea rows={2} style={{ fontFamily: 'inherit', fontSize: 14 }} maxLength={200} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </Field>
          <Field label={`Trackers in this pack (${editing.templateSlugs.length} selected)`} hint="Members who already have one of these just get the others.">
            <div className="pack-picker">
              {templates.map((t) => (
                <label key={t.slug} className={`pack-chip ${editing.templateSlugs.includes(t.slug) ? 'on' : ''}`}>
                  <input type="checkbox" checked={editing.templateSlugs.includes(t.slug)} onChange={() => toggleTemplate(t.slug)} />
                  {t.name} <span className="muted small">· {t.type}</span>
                </label>
              ))}
            </div>
          </Field>
          <Toggle checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} label={editing.active ? 'Shown in the app' : 'Hidden'} />
        </Modal>
      ) : null}
    </div>
  );
}
