'use client';

import { useRouter } from 'next/navigation';
import { BarChart, Bars, ErrorBox, PageHeader, PageSkeleton, Section, Spinner, StatCard } from '@/components/admin/kit';
import { useAdmin } from '@/components/AdminShell';
import { can, PERMISSIONS as P } from '@/lib/roles';
import { useResource } from '@/lib/useApi';

const CATEGORY_LABELS = {
  trading: 'Trading & Investing', fitness: 'Health & Fitness', mind: 'Mind & Wellbeing', money: 'Money & Spending',
  productivity: 'Study & Productivity', quit: 'Quit Bad Habits', other: 'Other',
};
const TYPE_LABELS = { habit: 'Habits', trading: 'Trading plans', spending: 'Budgets' };
const BADGE_LABELS = {
  first_step: 'First step', first_win: 'First win', streak_3: '3-day streak', streak_7: '7-day streak', streak_30: '30-day streak',
  streak_100: '100-day streak', clean_trader_5: 'Clean hands', clean_trader_20: 'Professional', budget_7: 'Money minded',
  journal_7: 'Self-aware', checkins_50: 'Fifty strong', checkins_365: 'A year of you', all_rounder: 'All-rounder',
  honest: 'Honest with myself', level_5: 'Level 5', level_10: 'Level 10',
};

export default function DashboardPage() {
  const me = useAdmin();
  const router = useRouter();
  const overview = useResource('/admin/overview');
  const analytics = useResource('/admin/analytics');

  if (overview.loading && !overview.data) return <PageSkeleton />;
  if (overview.error) return <ErrorBox error={overview.error} onRetry={overview.reload} />;
  const { users: u, activity, signups, trackersByCategory, trackersByType } = overview.data;
  const an = analytics.data;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const go = (href, permission) => (can(me, permission) ? () => router.push(href) : undefined);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <PageHeader title="Dashboard" subtitle="How Anchor is doing right now.">
        <button className="btn" onClick={() => { overview.reload(); analytics.reload(); }}>Refresh</button>
      </PageHeader>

      <div className="grid grid-4">
        <StatCard icon="👥" accent="violet" label="Members" value={u.total} sub={`+${u.new7d} this week · +${u.new30d} this month`} onClick={go('/admin/users', P.USERS_VIEW)} />
        <StatCard icon="⚡" accent="green" label="Active today" value={u.active1d} sub={`${u.active7d} this week · ${u.active30d} this month`} />
        <StatCard icon="🔁" accent="blue" label="30-day retention" value={an?.retention.rate != null ? `${an.retention.rate}%` : '—'} sub={an ? `${an.retention.retained} of ${an.retention.cohort} who joined 8–37 days ago are still active` : ''} />
        <StatCard icon="✉️" accent="amber" label="New feedback" value={an?.feedback.new ?? '—'} sub={an ? `${an.feedback.total} total` : ''} onClick={go('/admin/feedback', P.FEEDBACK_MANAGE)} />
      </div>

      <div className="grid grid-2">
        <Section title="Members logging something · 30 days">
          {an ? <BarChart data={an.activeSeries} color="#22c55e" label="Active members per day" /> : <Spinner />}
        </Section>
        <Section title={`Sign-ups · 30 days (${signups.reduce((s, d) => s + d.n, 0)})`}>
          <BarChart data={signups} label="Sign-ups per day" />
        </Section>
      </div>

      <div className="grid grid-2">
        <Section title="Trackers by category">
          <Bars items={trackersByCategory.map((c) => ({ label: CATEGORY_LABELS[c.category] ?? c.category, value: c.n }))} />
        </Section>
        <Section title="Most used templates">
          {an ? <Bars color="var(--blue)" items={an.topTemplates.map((t) => ({ label: t.name, value: t.n }))} /> : <Spinner />}
        </Section>
      </div>

      <div className="grid grid-2">
        <Section title="Trackers by type">
          <Bars items={Object.entries(trackersByType).map(([k, v]) => ({ label: TYPE_LABELS[k] ?? k, value: v }))} />
        </Section>
        <Section title="Badges earned">
          {an ? <Bars color="var(--amber)" items={an.achievements.map((a) => ({ label: BADGE_LABELS[a.achievement] ?? a.achievement, value: a.n }))} /> : <Spinner />}
        </Section>
      </div>

      <Section title="Rules broken most · 30 days">
        <p className="small muted" style={{ marginTop: -8 }}>Where members struggle — use it to write tips, announcements or better templates.</p>
        {an ? <Bars color="var(--red)" items={(an.ruleBreaks ?? []).map((b) => ({ label: b.label, value: b.n }))} /> : <Spinner />}
      </Section>

      <div className="grid grid-4">
        <StatCard icon="✅" accent="green" label="Verified email" value={pct(u.verified, u.total)} sub={`${u.verified} members · ${u.suspended} suspended · ${u.staff} staff`} />
        <StatCard icon="📅" accent="violet" label="Check-ins" value={activity.checkins} sub={`${activity.checkins1d} in the last 24h`} />
        <StatCard icon="📈" accent="blue" label="Trades · Expenses" value={`${activity.trades} · ${activity.expenses}`} />
        <StatCard icon="🛡️" accent="red" label="Rule breaks recorded" value={activity.rule_breaks} sub={`${u.marketing} members opted into emails`} />
      </div>

      <div className="grid grid-4">
        <StatCard icon="🤝" accent="green" label="Joined via invites" value={an?.invites?.joined ?? '—'} sub={an ? `${an.invites.inviters} members invited someone` : ''} />
        <StatCard icon="🗓️" accent="violet" label="Weekly reviews · 30 days" value={an?.weeklyReviews30d ?? '—'} sub="members reflecting on their week" />
      </div>
    </div>
  );
}
