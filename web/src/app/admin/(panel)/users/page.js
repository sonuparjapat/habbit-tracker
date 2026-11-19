'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/AdminShell';
import { del, get, patch, post } from '@/lib/api';
import { fmtDate, fmtDateTime, timeAgo } from '@/lib/format';
import { can, PERMISSIONS, ROLE_BADGE, ROLES } from '@/lib/roles';

function RoleBadge({ role }) {
  const b = ROLE_BADGE[role];
  return b ? <span className={b.className}>{b.label}</span> : null;
}

/** Mirrors the backend rules: nobody changes a super admin here; only super admins change admins. */
function canActOn(me, target, { allowSelf = false } = {}) {
  if (target.id === me.id) return allowSelf;
  if (target.role === ROLES.SUPER_ADMIN) return false;
  if (target.role === ROLES.ADMIN) return can(me, PERMISSIONS.ADMINS_MANAGE);
  return true;
}

const PAGE_SIZE = 25;

export default function UsersPage() {
  const me = useAdmin();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (query) params.set('search', query);
    if (status) params.set('status', status);
    if (role) params.set('role', role);
    get(`/admin/users?${params}`)
      .then((res) => {
        setError(null);
        setData(res.data);
      })
      .catch((e) => setError(e.message));
  }, [page, query, status, role]);

  useEffect(load, [load]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>{data ? `${data.total} account${data.total === 1 ? '' : 's'}` : 'Loading…'}</p>
        </div>
        <div className="row wrap">
          <input className="input" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="1">Super admins</option>
            <option value="2">Admins</option>
            <option value="3">Users</option>
          </select>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {!data && !error ? <div className="spinner" /> : null}

      {data ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Trackers</th>
                <th>Last active</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">No users match.</td>
                </tr>
              ) : null}
              {data.users.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setOpenId(u.id)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {u.name} <RoleBadge role={u.role} />
                    </div>
                    <div className="muted small">{u.email} {u.emailVerified ? '✓' : ''}</div>
                  </td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'green' : 'red'}`}>{u.status}</span>
                    {u.locked ? <span className="badge amber" style={{ marginLeft: 6 }}>🔒 locked</span> : null}
                  </td>
                  <td>{u.trackers}</td>
                  <td className="muted">{timeAgo(u.lastActiveAt)}</td>
                  <td className="muted">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && pages > 1 ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      ) : null}

      {openId ? <UserDrawer id={openId} me={me} onClose={() => setOpenId(null)} onChanged={load} /> : null}
    </div>
  );
}

function UserDrawer({ id, me, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    get(`/admin/users/${id}`).then((res) => setData(res.data)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const done = await fn();
      onChanged();
      if (done === 'close') onClose();
      else load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const u = data?.user;
  const self = u?.id === me.id;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>User details</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {!data ? <div className="spinner" /> : null}
        {u ? (
          <>
            <div className="card stack" style={{ gap: 8 }}>
              <div className="row wrap">
                <h2>{u.name}</h2>
                <span className={`badge ${u.status === 'active' ? 'green' : 'red'}`}>{u.status}</span>
                {u.locked ? <span className="badge amber">🔒 locked</span> : null}
                <RoleBadge role={u.role} />
              </div>
              {u.locked ? (
                <div className="error" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
                  Locked {timeAgo(u.lockedAt)} — {u.lockReason === 'admin' ? 'by an admin' : 'too many wrong passwords'}. The owner can unlock it with the code we emailed.
                </div>
              ) : null}
              {u.status === 'suspended' && u.suspendReason ? <div className="error">Suspended: {u.suspendReason}</div> : null}
              {u.failedLogins ? <div className="small muted">{u.failedLogins} wrong password{u.failedLogins === 1 ? '' : 's'} in a row</div> : null}
              <div className="muted">{u.email} · {u.emailVerified ? <span style={{ color: 'var(--green)' }}>verified</span> : 'not verified'}</div>
              <div className="small muted">
                Joined {fmtDateTime(u.createdAt)} · last active {timeAgo(u.lastActiveAt)}
                <br />
                {u.timezone} · {u.currency} · interests: {u.interests?.length ? u.interests.join(', ') : '—'}
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[['Trades', data.counts.trades], ['Expenses', data.counts.expenses], ['Check-ins', data.counts.checkins], ['Rule breaks', data.counts.ruleBreaks]].map(([l, v]) => (
                <div key={l} className="card" style={{ padding: 14 }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
                </div>
              ))}
            </div>
            <p className="small muted" style={{ margin: 0 }}>For privacy, admins see counts only — never the content of a user’s trades, expenses or journal.</p>

            <div>
              <h3 style={{ marginBottom: 10 }}>Trackers ({data.trackers.length})</h3>
              <div className="stack" style={{ gap: 8 }}>
                {data.trackers.length === 0 ? <div className="muted small">None yet</div> : null}
                {data.trackers.map((t) => (
                  <div key={t.id} className="row between card" style={{ padding: '10px 14px' }}>
                    <span>{t.name}</span>
                    <span className="row small muted">
                      <span className="badge">{t.type}</span> {t.category} {t.archived ? '· archived' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: 10 }}>Consent history</h3>
              <div className="stack small" style={{ gap: 6 }}>
                {data.consents.map((c, i) => (
                  <div key={i} className="row between">
                    <span>{c.kind}{c.version ? ` (v${c.version})` : ''}</span>
                    <span className={c.granted ? '' : 'muted'}>{c.granted ? 'granted' : 'withdrawn'} · {fmtDateTime(c.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>

            <UserActions me={me} u={u} id={id} busy={busy} act={act} self={self} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function UserActions({ me, u, id, busy, act, self }) {
  const manage = can(me, PERMISSIONS.USERS_MANAGE) && canActOn(me, u);
  const verify = can(me, PERMISSIONS.USERS_MANAGE) && canActOn(me, u, { allowSelf: true }) && !u.emailVerified;
  const changeRole = can(me, PERMISSIONS.ADMINS_MANAGE) && canActOn(me, u);
  const remove = can(me, PERMISSIONS.USERS_DELETE) && canActOn(me, u);

  const reason = self
    ? 'This is your own account — use the app or the server to change it.'
    : u.role === ROLES.SUPER_ADMIN
      ? 'Super admin accounts can only be changed on the server (npm run create-admin).'
      : !manage && !changeRole && !remove
        ? 'Your role can view this account but not change it.'
        : null;

  return (
    <div className="stack" style={{ gap: 10, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <h3>Actions</h3>
      <div className="row wrap">
        {manage && !u.locked ? (
          <button
            className="btn"
            disabled={busy}
            title="Signs them out and emails a code — they unlock it themselves"
            onClick={() => act(() => post(`/admin/users/${id}/lock`), `Lock ${u.email} for safety?\n\nThey are signed out everywhere and emailed a code to unlock it themselves.`)}>
            🔒 Lock (owner can unlock)
          </button>
        ) : null}
        {manage && u.locked ? (
          <button className="btn" disabled={busy} onClick={() => act(() => post(`/admin/users/${id}/unlock`))}>🔓 Unlock</button>
        ) : null}
        {manage && u.status === 'active' ? (
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt(`Suspend ${u.email}?\n\nOnly an admin can lift this. They are signed out and emailed.\nReason (shown to them, optional):`);
              if (reason === null) return;
              act(() => patch(`/admin/users/${id}`, { status: 'suspended', reason: reason.trim() || undefined }));
            }}>
            ⛔ Suspend
          </button>
        ) : null}
        {manage && u.status !== 'active' ? (
          <button className="btn" disabled={busy} onClick={() => act(() => patch(`/admin/users/${id}`, { status: 'active' }), `Reactivate ${u.email}? They will be emailed.`)}>✅ Reactivate</button>
        ) : null}
        {verify ? <button className="btn" disabled={busy} onClick={() => act(() => post(`/admin/users/${id}/verify-email`))}>Mark email verified</button> : null}
        {manage ? (
          <button className="btn" disabled={busy} onClick={() => act(() => post(`/admin/users/${id}/logout`), 'Sign this account out of every device?')}>Sign out everywhere</button>
        ) : null}
        {changeRole && u.role === ROLES.ADMIN ? (
          <button className="btn" disabled={busy} onClick={() => act(() => patch(`/admin/users/${id}`, { role: ROLES.USER }), 'Remove admin access? They become a normal user.')}>Make normal user</button>
        ) : null}
        {changeRole && u.role === ROLES.USER ? (
          <button className="btn" disabled={busy} onClick={() => act(() => patch(`/admin/users/${id}`, { role: ROLES.ADMIN }), `Make ${u.email} an admin? They will get access to the admin panel.`)}>Make admin</button>
        ) : null}
      </div>
      {remove ? (
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => act(async () => { await del(`/admin/users/${id}`); return 'close'; }, `Permanently delete ${u.email} and ALL their data? This cannot be undone.`)}>
          Delete account permanently
        </button>
      ) : null}
      {reason ? <div className="small muted">{reason}</div> : null}
    </div>
  );
}
