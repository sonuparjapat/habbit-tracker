'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { post } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Only allow redirects back into the admin area
  const next = params.get('next');
  const target = next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await post('/auth/login', { email, password });
      if (!res.data.user.isAdmin) throw new Error('This account does not have admin access');
      localStorage.setItem('token', res.data.token);
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
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
  );
}

export default function AdminLogin() {
  return (
    <div className="login">
      <Suspense fallback={<div className="spinner" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
