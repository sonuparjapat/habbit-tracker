'use client';

import { useEffect, useState } from 'react';
import { get } from '@/lib/api';

const CATEGORY_LABELS = {
  trading: 'Trading & Investing', fitness: 'Health & Fitness', mind: 'Mind & Wellbeing', money: 'Money & Spending',
  productivity: 'Study & Productivity', quit: 'Quit Bad Habits', other: 'Other',
};
const TYPE_LABELS = { habit: 'Habits', trading: 'Trading plans', spending: 'Budgets' };

function Kpi({ label, value, sub }) {
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

function SignupChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 180, display: 'block' }} role="img" aria-label="Sign-ups per day, last 30 days">
        {data.map((d, i) => {
          const h = (d.n / max) * 36;
          return (
            <rect key={d.date} x={i * w + w * 0.15} y={40 - h - 0.5} width={w * 0.7} height={Math.max(h, 0.4)} rx={0.6} fill={d.n ? '#7c5cff' : '#232a39'}>
              <title>{`${d.date}: ${d.n} sign-up${d.n === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="row between small muted" style={{ marginTop: 8 }}>
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="stack" style={{ gap: 12 }}>
      {items.length === 0 ? <div className="muted small">No data yet</div> : null}
      {items.map((i) => (
        <div key={i.label}>
          <div className="row between small" style={{ marginBottom: 6 }}>
            <span>{i.label}</span>
            <strong>{i.value}</strong>
          </div>
          <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(i.value / max) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    get('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="spinner" />;
  const u = data.users;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>How Anchor is doing right now.</p>
        </div>
      </div>

      <div className="grid grid-4">
        <Kpi label="Total users" value={u.total} sub={`+${u.new7d} this week · +${u.new30d} this month`} />
        <Kpi label="Active today" value={u.active1d} sub={`${pct(u.active1d, u.total)} of all users`} />
        <Kpi label="Active this week" value={u.active7d} sub={`${u.active30d} in the last 30 days`} />
        <Kpi label="Verified email" value={pct(u.verified, u.total)} sub={`${u.verified} users · ${u.suspended} suspended · ${u.staff} staff`} />
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2>Sign-ups · last 30 days</h2>
          <span className="muted small">{data.signups.reduce((s, d) => s + d.n, 0)} total</span>
        </div>
        <SignupChart data={data.signups} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Trackers by category</h2>
          <Bars items={data.trackersByCategory.map((c) => ({ label: CATEGORY_LABELS[c.category] ?? c.category, value: c.n }))} />
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Trackers by type</h2>
          <Bars items={Object.entries(data.trackersByType).map(([k, v]) => ({ label: TYPE_LABELS[k] ?? k, value: v }))} />
        </div>
      </div>

      <div className="grid grid-4">
        <Kpi label="Check-ins" value={data.activity.checkins} sub={`${data.activity.checkins1d} in the last 24h`} />
        <Kpi label="Trades logged" value={data.activity.trades} />
        <Kpi label="Expenses logged" value={data.activity.expenses} />
        <Kpi label="Rule breaks recorded" value={data.activity.rule_breaks} sub={`${u.marketing} users opted into emails`} />
      </div>
    </div>
  );
}
