import Link from 'next/link';
import { APP_NAME, PLAY_STORE_URL } from '@/lib/config';

/**
 * Public homepage. The (site) route group holds public pages; the signed-in
 * user web app can be added later as another group, e.g. src/app/(app)/today/page.js.
 */

const FEATURES = [
  { icon: '🛡️', color: '#22c55e', title: 'Trading day lock', text: 'Max trades, profit target, loss limit. Hit one and your day closes — no “one more trade”.' },
  { icon: '💰', color: '#14b8a6', title: 'Budgets that push back', text: 'Daily and monthly limits, no-spend days, and a projection of where your month is heading.' },
  { icon: '🔥', color: '#f59e0b', title: 'Habits & streaks', text: 'Build a habit, quit one, or stay under a daily limit. Streaks you won’t want to break.' },
  { icon: '📊', color: '#4f8bff', title: 'Honest reports', text: 'Weekly, monthly and yearly — including what breaking your own rules actually cost you.' },
  { icon: '🧠', color: '#7c5cff', title: 'Emotion insights', text: 'See how you perform when calm versus greedy, bored or chasing losses.' },
  { icon: '🔒', color: '#f43f5e', title: 'Private by design', text: 'No contacts, location or camera. Nothing is sold. Export or delete your data anytime.' },
];

export default function Home() {
  return (
    <div className="site">
      <nav className="site-nav">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">⚓</div>
          {APP_NAME}
        </div>
        {PLAY_STORE_URL ? (
          <a className="btn btn-primary" href={PLAY_STORE_URL}>Get the app</a>
        ) : (
          <span className="badge violet">Coming soon to Google Play</span>
        )}
      </nav>

      <main className="site-main">
        <section className="hero">
          <span className="eyebrow">DISCIPLINE, MADE VISIBLE</span>
          <h1>Keep the promises you make to yourself.</h1>
          <p>
            Set your own limits for trading, spending, health or any habit. {APP_NAME} stops you before you break them — and shows you
            honestly when you do.
          </p>
          <div className="cta">
            {PLAY_STORE_URL ? (
              <a className="btn btn-primary btn-lg" href={PLAY_STORE_URL}>Download for Android</a>
            ) : (
              <span className="btn btn-primary btn-lg" aria-disabled>Android app coming soon</span>
            )}
            <a className="btn btn-lg" href="#features">See how it works</a>
          </div>
        </section>

        <h2 className="section-title" id="features">One app for every promise</h2>
        <p className="section-sub">Pick what matters to you. Every limit is yours to set.</p>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card feature">
              <div className="ic" style={{ background: `${f.color}22` }}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="site-footer">
        © {APP_NAME}
        <span style={{ marginLeft: 12 }}>
          <Link href="#features">Features</Link>
        </span>
      </footer>
    </div>
  );
}
