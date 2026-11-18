'use client';

import { useCallback, useEffect, useState } from 'react';
import { del, get, patch, post } from '@/lib/api';

const CATEGORIES = ['trading', 'fitness', 'mind', 'money', 'productivity', 'quit', 'other'];
const TYPES = ['habit', 'trading', 'spending'];

const CONFIG_HINTS = {
  habit: '{\n  "kind": "build",            // build | quit | limit\n  "goalType": "count",        // boolean | count | duration\n  "target": 20,\n  "unit": "pages",\n  "days": [0,1,2,3,4,5,6]\n}',
  trading: '{\n  "market": "stocks",   // stocks | index | options | futures | crypto | forex | commodities | other\n  "maxTradesPerDay": 1,\n  "dailyProfitTarget": 1000,\n  "dailyMaxLoss": 1000,\n  "stopAfterTarget": true\n}',
  spending: '{\n  "dailyLimit": 1000,\n  "monthlyLimit": 25000,\n  "noSpendDays": []\n}',
};

const blank = { slug: '', category: 'fitness', type: 'habit', name: '', subtitle: '', icon: 'target', color: '#7C5CFF', config: {}, sortOrder: 0, active: true };

export default function TemplatesPage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    get('/admin/templates').then((d) => setList(d.templates)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const toggle = async (t) => {
    try {
      await patch(`/admin/templates/${t.id}`, { active: !t.active });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Templates</h1>
          <p>What users see in “New tracker”. Changes go live instantly — no app update needed.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...blank })}>+ New template</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {!list ? <div className="spinner" /> : null}
      {list ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Category</th>
                <th>Type</th>
                <th>Order</th>
                <th>Visible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}>
                  <td>
                    <div className="row">
                      <span className="dot" style={{ background: t.color }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div className="muted small">{t.subtitle || t.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>{t.category}</td>
                  <td><span className="badge">{t.type}</span></td>
                  <td className="muted">{t.sortOrder}</td>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={t.active} onChange={() => toggle(t)} /> {t.active ? 'Shown' : 'Hidden'}
                    </label>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => setEditing(t)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing ? (
        <TemplateEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateEditor({ initial, onClose, onSaved }) {
  const isNew = !initial.id;
  const [t, setT] = useState(initial);
  const [configText, setConfigText] = useState(JSON.stringify(initial.config ?? {}, null, 2));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setT({ ...t, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const save = async () => {
    setError(null);
    let config;
    try {
      config = JSON.parse(configText || '{}');
    } catch {
      setError('Config is not valid JSON (remove any // comments).');
      return;
    }
    const body = { slug: t.slug, category: t.category, type: t.type, name: t.name, subtitle: t.subtitle, icon: t.icon, color: t.color, config, sortOrder: t.sortOrder, active: t.active };
    setSaving(true);
    try {
      if (isNew) await post('/admin/templates', body);
      else await patch(`/admin/templates/${t.id}`, body);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete template "${t.name}"? Trackers already created from it are not affected.`)) return;
    try {
      await del(`/admin/templates/${t.id}`);
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{isNew ? 'New template' : `Edit “${initial.name}”`}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="field">Name<input className="input" value={t.name} onChange={set('name')} /></label>
          <label className="field">Slug (unique id)<input className="input" value={t.slug} onChange={set('slug')} placeholder="e.g. morning-run" /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Subtitle<input className="input" value={t.subtitle} onChange={set('subtitle')} /></label>
          <label className="field">Category
            <select value={t.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field">Type
            <select value={t.type} onChange={set('type')} disabled={!isNew}>{TYPES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field">Icon (Material Community name)<input className="input" value={t.icon} onChange={set('icon')} /></label>
          <label className="field">Colour
            <div className="row"><input type="color" value={t.color} onChange={set('color')} style={{ width: 44, height: 40, padding: 2, borderRadius: 10, border: '1px solid var(--border-strong)', background: 'none' }} /><input className="input" value={t.color} onChange={set('color')} style={{ flex: 1 }} /></div>
          </label>
          <label className="field">Sort order<input className="input" type="number" value={t.sortOrder} onChange={set('sortOrder')} /></label>
          <label className="check" style={{ alignSelf: 'end', height: 40 }}><input type="checkbox" checked={t.active} onChange={set('active')} /> Visible in app</label>
        </div>
        <label className="field">
          Default config (JSON) — users can change every value
          <textarea rows={8} value={configText} onChange={(e) => setConfigText(e.target.value)} spellCheck={false} />
        </label>
        <details className="small muted">
          <summary style={{ cursor: 'pointer' }}>Config reference for “{t.type}”</summary>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{CONFIG_HINTS[t.type]}</pre>
        </details>
        {error ? <div className="error">{error}</div> : null}
        <div className="row between">
          {!isNew ? <button className="btn btn-danger" onClick={remove}>Delete</button> : <span />}
          <div className="row">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !t.name || !t.slug}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
