'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, use, useEffect, useState } from 'react';
import { session } from '@/lib/api';
import { can, PERMISSIONS, ROLE_BADGE } from '@/lib/roles';

// Each page needs a permission; pages the signed-in admin can't use are hidden.
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '◧', permission: PERMISSIONS.DASHBOARD_VIEW },
  { href: '/admin/users', label: 'Users', icon: '◉', permission: PERMISSIONS.USERS_VIEW },
  { href: '/admin/templates', label: 'Templates', icon: '▦', permission: PERMISSIONS.TEMPLATES_MANAGE },
  { href: '/admin/audit', label: 'Audit log', icon: '☰', permission: PERMISSIONS.AUDIT_VIEW },
];

export function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    session
      .get()
      .then(({ user }) => (user.isAdmin ? setMe(user) : setDenied(true)))
      .catch(() => router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`));
    // Only on first load of the admin area
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await session.logout().catch(() => {});
    router.replace('/admin/login');
    router.refresh();
  };

  if (denied)
    return (
      <div className="login">
        <div className="card">
          <h2>No admin access</h2>
          <p className="muted">You are signed in with an account that is not an admin.</p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  if (!me) return <div className="spinner" />;

  const current = NAV.find((n) => (n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href)));
  const allowed = !current || can(me, current.permission);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">⚓</div>
          Anchor <span className="badge violet">Admin</span>
        </div>
        {NAV.filter((n) => can(me, n.permission)).map((n) => {
          const active = n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`nav-item ${active ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
              <span style={{ width: 18, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
        <div className="sidebar-foot">
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{me.name}</div>
          {ROLE_BADGE[me.role] ? <span className={ROLE_BADGE[me.role].className} style={{ margin: '4px 0' }}>{ROLE_BADGE[me.role].label}</span> : null}
          <div style={{ wordBreak: 'break-all' }}>{me.email}</div>
          <button className="btn btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <AdminContext value={me}>
          {allowed ? children : <div className="card"><h2>No access</h2><p className="muted">Your role doesn’t include this page. Ask a super admin if you need it.</p></div>}
        </AdminContext>
      </main>
    </div>
  );
}

const AdminContext = createContext(null);
/** The signed-in admin, for pages inside the admin area. */
export const useAdmin = () => use(AdminContext);
