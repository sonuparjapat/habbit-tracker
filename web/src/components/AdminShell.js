'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, use, useEffect, useState } from 'react';

/** Light / dark switch for the admin (saved in this browser). */
function ThemeToggle() {
  const [theme, setTheme] = useState(() => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark');
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {}
    setTheme(next);
  };
  return (
    <button className="theme-toggle" onClick={flip} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle light or dark mode">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
import { get } from '@/lib/api';
import { can, PERMISSIONS as P, ROLE_BADGE } from '@/lib/roles';
import { useBusy } from '@/lib/useApi';
import { ConfirmProvider, ToastProvider, TopProgress } from './admin/kit';

/**
 * Admin navigation. To add a page: create src/app/admin/(panel)/<name>/page.js and add one entry here.
 * Entries the signed-in admin lacks permission for are hidden (and blocked if opened directly).
 */
const NAV = [
  { group: 'Overview' },
  { href: '/admin', label: 'Dashboard', icon: '◧', permission: P.DASHBOARD_VIEW },
  { group: 'People' },
  { href: '/admin/users', label: 'Users', icon: '◉', permission: P.USERS_VIEW },
  { href: '/admin/feedback', label: 'Feedback', icon: '✉', permission: P.FEEDBACK_MANAGE, countKey: 'feedback' },
  { group: 'Content' },
  { href: '/admin/templates', label: 'Templates', icon: '▦', permission: P.TEMPLATES_MANAGE },
  { href: '/admin/packs', label: 'Starter packs', icon: '🎁', permission: P.TEMPLATES_MANAGE },
  { href: '/admin/announcements', label: 'Announcements', icon: '📣', permission: P.CONTENT_MANAGE },
  { href: '/admin/notifications', label: 'Notifications', icon: '🔔', permission: P.CONTENT_MANAGE },
  { group: 'Configuration' },
  { href: '/admin/settings', label: 'App settings', icon: '⚙', permission: P.SETTINGS_MANAGE },
  { href: '/admin/security', label: 'Security', icon: '🛡', permission: P.SECURITY_MANAGE },
  { href: '/admin/system', label: 'System', icon: '◎', permission: P.SYSTEM_VIEW },
  { href: '/admin/sync', label: 'Offline sync', icon: '🔄', permission: P.SYSTEM_VIEW },
  { href: '/admin/audit', label: 'Audit log', icon: '☰', permission: P.AUDIT_VIEW },
  { group: 'Help' },
  { href: '/admin/docs', label: 'Help & docs', icon: '📖', permission: P.DASHBOARD_VIEW },
];

const isActive = (href, pathname) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

export function AdminShell({ children }) {
  const busy = useBusy();
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [denied, setDenied] = useState(false);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    get('/auth/me')
      .then((res) => (res.data.user.isAdmin ? setMe(res.data.user) : setDenied(true)))
      .catch(() => {
        localStorage.removeItem('token');
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      });
    // Only on first load of the admin area
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unread-feedback badge in the menu, refreshed when navigating
  useEffect(() => {
    if (!me || !can(me, P.FEEDBACK_MANAGE)) return;
    get('/admin/feedback?status=new')
      .then((res) => setCounts({ feedback: res.data.counts?.new ?? 0 }))
      .catch(() => {});
  }, [me, pathname]);

  const signOut = async () => {
    localStorage.removeItem('token');
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
  if (!me)
    return (
      <div className="boot">
        <div className="boot-mark">⚓</div>
        <div className="muted small">Opening the admin panel…</div>
      </div>
    );

  const visible = NAV.filter((n, i) => {
    if (!n.group) return can(me, n.permission);
    // Show a group heading only if at least one item under it is visible
    for (let j = i + 1; j < NAV.length && !NAV[j].group; j++) if (can(me, NAV[j].permission)) return true;
    return false;
  });
  const current = NAV.filter((n) => n.href && isActive(n.href, pathname)).sort((a, b) => b.href.length - a.href.length)[0];
  const allowed = !current || can(me, current.permission);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <TopProgress busy={busy} />
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">⚓</div>
            Anchor <span className="badge violet">Admin</span>
            <ThemeToggle />
          </div>
          {visible.map((n) =>
            n.group ? (
              <div key={n.group} className="nav-group">{n.group}</div>
            ) : (
              <Link key={n.href} href={n.href} className={`nav-item ${current?.href === n.href ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
                <span style={{ width: 18, textAlign: 'center' }}>{n.icon}</span>
                {n.label}
                {n.countKey && counts[n.countKey] ? <span className="nav-count">{counts[n.countKey]}</span> : null}
              </Link>
            ),
          )}
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
      </ConfirmProvider>
    </ToastProvider>
  );
}

const AdminContext = createContext(null);
/** The signed-in admin, for pages inside the admin area. */
export const useAdmin = () => use(AdminContext);
