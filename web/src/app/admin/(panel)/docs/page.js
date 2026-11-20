'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/admin/kit';

/**
 * Help & docs for admins. KEEP THIS UP TO DATE: every new feature or admin control gets a section
 * (or a line in one) here, written for a non-technical admin.
 */
const SECTIONS = [
  {
    id: 'start',
    icon: '🧭',
    title: 'Getting around',
    body: [
      'The menu on the left only shows what your role can use. Super admins (role 1) see everything; admins (role 2) manage members, templates, content and feedback.',
      'Every change you make is recorded in Audit log — who did what, and when.',
      'Super admins are only ever created on the server: npm run create-admin -- you@example.com "password".',
      'The ☀️ / 🌙 button next to the logo switches the admin panel between light and dark (saved in this browser).',
    ],
  },
  {
    id: 'users',
    icon: '👥',
    title: 'Members, roles, lock and suspend',
    body: [
      'Users: search by name or email, filter by role or status, open anyone to see their trackers and counts. For privacy you only see counts — never their trades, journals or expenses.',
      '🔒 Lock (owner can unlock): signs them out everywhere and emails a code. They unlock it themselves in the app ("Unlock my account") or by resetting their password. Use it when an account looks compromised.',
      '⛔ Suspend (only an admin can lift it): add a reason — it is emailed to them and shown when they try to sign in. ✅ Reactivate emails them too.',
      'Accounts also lock automatically after too many wrong passwords in a row (App settings → Security → "Lock an account after…").',
      'Only super admins can make someone an admin, and nobody can change their own role or suspend themselves. The last super admin can never be removed.',
    ],
  },
  {
    id: 'security',
    icon: '🛡',
    title: 'Security & blocked IPs (super admins)',
    body: [
      'Security page: blocked IPs, locked accounts, the networks with the most wrong passwords in the last 24 h (with a "Block 24h" button) and a security log.',
      'Block an IP (203.0.113.7) or a range (203.0.113.0/24) for 1 hour, 24 hours, 7 days or until removed. Be careful with ranges — many people can share one mobile-network IP.',
      'A network failing sign-ins on many accounts is blocked automatically for a while (App settings → Security). You can never block your own IP from the panel.',
      'Locked yourself out? On the server run: npm run unblock-ip -- <ip>   (or -- --all). It takes effect within 30 seconds.',
      'Other protection that is always on: request limits, weak passwords refused, sessions can’t be forged, a password change signs out other devices and emails the owner.',
    ],
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Phone notifications',
    body: [
      'Notifications page: write a title and message, pick the screen it opens, and choose who gets it — everyone, people interested in an area, people away for N days, or one person by email. The preview shows it like a real phone notification bar.',
      'Always "Send test to my phone" first (your account must be signed in on a phone with notifications allowed). Every send is recorded with delivered / failed counts.',
      'Only members who allowed notifications and kept "News & tips" on in Profile receive them. Uninstalled phones are cleaned up automatically.',
      'Phone notifications from the server need Firebase set up once (see PLAY_STORE.md section 6). Reminders at the times members choose work without it.',
    ],
  },
  {
    id: 'checkin',
    icon: '🌙',
    title: 'Evening check-in',
    body: [
      'Every 5 minutes the server checks members who switched it on (Profile → Evening check-in). At the hour you set (App settings → Evening check-in, in each member’s own timezone) anyone who missed a tracker with a reminder gets ONE push and/or email. Members who logged everything are never disturbed.',
      'System page → Evening check-in shows how many opted in, what the last run did, and a "Run now" button.',
    ],
  },
  {
    id: 'sync',
    icon: '🔄',
    title: 'Offline sync — nothing a member does is lost',
    body: [
      'The app opens instantly with the data saved on the phone, even while the server is asleep, and refreshes when it answers.',
      'Check-ins, journals, weekly-review answers and "badges seen" update the screen at once and wait in the phone’s outbox until the server is reachable. Sign-in, trades and expenses always go to the server live (rules must be judged right then).',
      'On the server every change is stored first, then applied. The same change sent twice is applied once; an old change arriving after a newer one is skipped ("Replaced by newer").',
      'Offline sync page: "Retrying" = a temporary problem, retried automatically every 2 minutes. "Rejected" = it can never work (e.g. the tracker was deleted) — the member is told. "Gave up" = failed 10 times. Use Retry, Discard or "Retry all now".',
    ],
  },
  {
    id: 'content',
    icon: '📣',
    title: 'Content: announcements, templates, starter packs, tour',
    body: [
      'Announcements: banners on the app’s Today screen, with optional start / end dates and a button. Only live ones are shown.',
      'Templates: the ready-made trackers in "New tracker". Hidden templates disappear from the app; members who already use one keep it.',
      'Starter packs: bundles of templates ("Morning routine"). One tap creates them all; members never get duplicates. Built-in packs can only be hidden, not deleted (they would come back on the next start).',
      'Onboarding tour: App settings → Onboarding tour. One step per line: emoji | title | text.',
    ],
  },
  {
    id: 'game',
    icon: '🎮',
    title: 'Games, XP and streak shields',
    body: [
      'XP is calculated from what members really did — undoing a check-in takes its XP back. Change the XP per action in App settings → Game.',
      'Forest, weekly boss, piggy bank, discipline fortress and money saved are all calculated from logs, so they can’t be faked.',
      'Streak shields: every N days in a row earns a shield (up to the maximum); a missed day uses one instead of breaking the streak. App settings → Streak shields.',
      'Invites: a friend counts (and the inviter gets the XP + Ambassador badge) only after the friend verifies their email.',
      'Rating prompt: shown only right after a win, never in a member’s first 5 days, at most every 2 months (App settings → Features).',
    ],
  },
  {
    id: 'settings',
    icon: '⚙',
    title: 'App settings — the main switches',
    body: [
      'General: support email, website and Play Store links (used in the app and emails).',
      'Features: trading, money trackers, gamification, weekly review, focus timer, rating prompt, ads — switch any of them off instantly.',
      'Maintenance mode pauses the app for members with your message; staff can still work. Sign-ups can be paused separately.',
      'Minimum / latest app version: older apps see "Update available"; below the minimum they must update.',
      'Look & feel: the default light / dark theme (members can override it in Profile).',
      '"Reset" on any setting puts the built-in default back.',
    ],
  },
  {
    id: 'language',
    icon: '🌐',
    title: 'Languages (English & Hindi)',
    body: [
      'Hindi is switched OFF for now (App settings → Look & feel → Hindi language): everyone sees English and the language choice is hidden. Switching it on needs no new app build.',
      'When it is on, members pick English or हिन्दी on the first screen or in Profile → Language. The app’s screens and the server’s messages (alerts, insights, badges, errors) are both translated.',
      'What members type themselves (tracker names, notes, journals) is never changed.',
      'Text you write in the admin panel (announcements, tour steps, quotes, notifications) is shown exactly as you write it — write it in the language you want members to see.',
    ],
  },
  {
    id: 'feedback',
    icon: '✉',
    title: 'Feedback and crash reports',
    body: [
      'Feedback page: bugs, ideas and questions from members (and guests with an email). Mark them in progress / resolved and add an internal note; "Reply by email" opens your mail app.',
      '"App crash" items are sent automatically when a screen crashes (the member sees a friendly "Try again" screen). They contain only the error, app version and platform.',
    ],
  },
  {
    id: 'system',
    icon: '◎',
    title: 'System, email and deploying',
    body: [
      'System page: API and database health, database migrations, email status (with a test email button) and the evening check-in.',
      'If email shows "not working", set BREVO_API_KEY (and MAIL_FROM, a sender verified in Brevo) in Render → Environment and redeploy.',
      'Database changes run by themselves when the backend starts. Every push to GitHub runs the automatic checks (tests, app typecheck, website build).',
      'Turn on daily database backups in your database host. Free hosting sleeps after 15 minutes idle — an uptime monitor calling /health every 10 minutes keeps it awake.',
    ],
  },
];

export default function DocsPage() {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = SECTIONS.map((s) => ({ ...s, lines: s.body.filter((l) => !needle || l.toLowerCase().includes(needle) || s.title.toLowerCase().includes(needle)) })).filter((s) => s.lines.length);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="Help & docs" subtitle="How every part of Anchor works, and what each admin control does.">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs…" style={{ width: 260 }} />
      </PageHeader>

      <div className="docs-toc">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="pack-chip" style={{ textDecoration: 'none' }}>
            {s.icon} {s.title.split(' — ')[0].split(':')[0]}
          </a>
        ))}
      </div>

      {shown.length === 0 ? <div className="card empty">Nothing matches “{q}”.</div> : null}
      {shown.map((s) => (
        <section key={s.id} id={s.id} className="card" style={{ scrollMarginTop: 20 }}>
          <h2 style={{ marginBottom: 12 }}>
            <span style={{ marginRight: 8 }}>{s.icon}</span>
            {s.title}
          </h2>
          <ul className="docs-list">
            {s.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
