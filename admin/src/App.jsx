import { useEffect, useState } from 'react';
import { get, post, session, setUnauthorizedHandler } from './api.js';
import { Audit } from './pages/Audit.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Templates } from './pages/Templates.jsx';
import { Users } from './pages/Users.jsx';

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', icon: '◧', Component: Dashboard },
  { key: 'users', label: 'Users', icon: '◉', Component: Users },
  { key: 'templates', label: 'Templates', icon: '▦', Component: Templates },
  { key: 'audit', label: 'Audit log', icon: '☰', Component: Audit },
];

function pageFromHash() {
  const key = window.location.hash.replace('#/', '');
  return PAGES.some((p) => p.key === key) ? key : 'dashboard';
}

export default function App() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(!!session.token);
  const [page, setPage] = useState(pageFromHash);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.set(null);
      setMe(null);
    });
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    if (session.token)
      get('/auth/me')
        .then(({ user }) => (user.role === 'admin' ? setMe(user) : session.set(null)))
        .catch(() => session.set(null))
        .finally(() => setChecking(false));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (checking) return <div className="spinner" />;
  if (!me) return <Login onLogin={setMe} />;

  const Current = PAGES.find((p) => p.key === page).Component;
  const go = (key) => {
    window.location.hash = `#/${key}`;
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">⚓</div>
          Anchor <span className="badge violet">Admin</span>
        </div>
        {PAGES.map((p) => (
          <button key={p.key} className={`nav-item ${page === p.key ? 'active' : ''}`} onClick={() => go(p.key)}>
            <span style={{ width: 18, textAlign: 'center' }}>{p.icon}</span>
            {p.label}
          </button>
        ))}
        <div className="sidebar-foot">
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{me.name}</div>
          <div style={{ wordBreak: 'break-all' }}>{me.email}</div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => {
              session.set(null);
              setMe(null);
            }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Current me={me} />
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await post('/auth/login', { email, password });
      if (user.role !== 'admin') throw new Error('This account does not have admin access.');
      session.set(token);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">⚓</div>
          Anchor Admin
        </div>
        <p className="muted" style={{ margin: 0 }}>Sign in with an admin account.</p>
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn btn-primary" disabled={loading} style={{ height: 44 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
