'use client';

import { useMemo, useState } from 'react';
import { Badge, ErrorBox, Field, PageHeader, Section, PageSkeleton, Toggle, useToast } from '@/components/admin/kit';
import { del, put } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAction, useResource } from '@/lib/useApi';

/**
 * Renders every setting defined in backend/src/services/settings.js automatically —
 * adding a setting there makes it appear here with the right input. No code needed.
 */

function SettingInput({ def, value, onChange }) {
  switch (def.type) {
    case 'boolean':
      return <Toggle checked={value} onChange={onChange} label={value ? 'On' : 'Off'} />;
    case 'number':
      return <input className="input" type="number" min={def.min ?? 0} max={def.max} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'select':
      return (
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case 'text':
      return <textarea rows={3} style={{ fontFamily: 'inherit', fontSize: 14 }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'list':
      return (
        <textarea
          rows={6}
          style={{ fontFamily: 'inherit', fontSize: 14 }}
          value={(value ?? []).join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n'))}
          placeholder="One item per line"
        />
      );
    default:
      return <input className="input" type={def.type === 'email' ? 'email' : def.type === 'url' ? 'url' : 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

// Lists are edited as free text; drop blank lines before saving
const clean = (def, v) => (def.type === 'list' ? v.map((x) => x.trim()).filter(Boolean) : v);

export default function SettingsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useResource('/admin/settings');
  const [draft, setDraft] = useState({});
  const { run, busy } = useAction(toast);

  const groups = useMemo(() => {
    const g = new Map();
    for (const s of data?.settings ?? []) {
      if (!g.has(s.group)) g.set(s.group, []);
      g.get(s.group).push(s);
    }
    return [...g.entries()];
  }, [data]);

  if (loading && !data) return <PageSkeleton />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const defs = Object.fromEntries(data.settings.map((s) => [s.key, s]));
  const dirtyKeys = Object.keys(draft);
  const valueOf = (key) => (key in draft ? draft[key] : defs[key].value);
  const setValue = (key, v) =>
    setDraft((d) => {
      const next = { ...d, [key]: v };
      if (JSON.stringify(clean(defs[key], v)) === JSON.stringify(defs[key].value)) delete next[key];
      return next;
    });

  const save = () =>
    run(() => put('/admin/settings', { values: Object.fromEntries(dirtyKeys.map((k) => [k, clean(defs[k], draft[k])])) }), {
      success: `Saved ${dirtyKeys.length} setting${dirtyKeys.length > 1 ? 's' : ''}. The app picks it up within a minute.`,
      after: async () => {
        setDraft({});
        await reload();
      },
    });

  const reset = (key) =>
    run(() => del(`/admin/settings/${key}`), {
      confirm: { icon: '↺', title: 'Reset to default?', message: `“${defs[key].label}” goes back to its built-in value.`, confirmLabel: 'Reset' },
      success: 'Reset to default',
      after: async () => {
        setDraft(({ [key]: _, ...rest }) => rest);
        await reload();
      },
    });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="App settings" subtitle="Change how the app and website behave — no new release needed. Changes reach the app within about a minute." />
      {groups.map(([group, items]) => (
        <Section key={group} title={group}>
          {items.map((s) => (
            <div key={s.key} className="setting-row">
              <div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <strong>{s.label}</strong>
                  {s.customised ? <Badge tone="info">custom</Badge> : <Badge>default</Badge>}
                  {s.public ? null : <Badge tone="warning">server only</Badge>}
                </div>
                {s.description ? <p className="small muted" style={{ margin: '6px 0 0' }}>{s.description}</p> : null}
                {s.updatedBy ? <p className="small muted" style={{ margin: '6px 0 0' }}>Changed {timeAgo(s.updatedAt)} by {s.updatedBy}</p> : null}
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <Field>
                  <SettingInput def={s} value={valueOf(s.key)} onChange={(v) => setValue(s.key, v)} />
                </Field>
                {s.customised ? (
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => reset(s.key)} disabled={busy}>
                    Reset to default
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </Section>
      ))}
      {dirtyKeys.length ? (
        <div className="save-bar">
          <span>{dirtyKeys.length} unsaved change{dirtyKeys.length > 1 ? 's' : ''}</span>
          <div className="row">
            <button className="btn" onClick={() => setDraft({})} disabled={busy}>Discard</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
