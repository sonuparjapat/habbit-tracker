import { SiteFooter, SiteNav } from '@/components/SiteChrome';
import { getSiteConfig } from '@/lib/siteConfig';

/**
 * Public homepage. The (site) route group holds public pages; the signed-in
 * user web app can be added later as another group, e.g. src/app/(app)/today/page.js.
 */

// Life areas, habit-first. Trading is one area among many.
const AREAS = [
  { icon: '💪', color: '#f59e0b', title: 'Health & fitness', text: 'Workouts, steps, water, sleep' },
  { icon: '🧘', color: '#7c5cff', title: 'Mind & wellbeing', text: 'Meditation, journaling, gratitude' },
  { icon: '📚', color: '#4f8bff', title: 'Study & focus', text: 'Reading, studying, deep work, waking early' },
  { icon: '🚭', color: '#f43f5e', title: 'Quit bad habits', text: 'Smoking, alcohol, social media, junk food' },
  { icon: '💰', color: '#14b8a6', title: 'Money', text: 'Daily budgets, no-spend days, saving' },
  { icon: '📈', color: '#22c55e', title: 'Trading discipline', text: 'Trade limits, profit targets, loss limits' },
];

const FEATURES = [
  { icon: '🔥', color: '#f59e0b', title: 'Streaks you won’t want to break', text: 'Every day you show up adds to your streak — and you’re warned before it’s about to reset.' },
  { icon: '🏆', color: '#ec4899', title: 'XP, levels & badges', text: 'Earn XP for every promise kept and unlock badges as you grow. Missing a day costs you.' },
  { icon: '🛡️', color: '#22c55e', title: 'Limits that hold', text: 'Cigarettes, screen time, spending, trades — set a daily limit and get stopped before you cross it.' },
  { icon: '📊', color: '#4f8bff', title: 'Honest progress reports', text: 'Weekly, monthly and yearly — your best days, weak spots and what’s really working.' },
  { icon: '⏰', color: '#7c5cff', title: 'Gentle reminders', text: 'Only at the times you choose, and only if you allow them.' },
  { icon: '🔒', color: '#f43f5e', title: 'Private by design', text: 'No contacts, location or camera. Nothing is sold. Export or delete your data anytime.' },
];

const STEPS = [
  ['Pick what you want to change', 'A habit to build, one to quit, a budget — or several.'],
  ['Set your own goal', '20 pages a day. Five cigarettes max. Gym on weekdays. Your rules.'],
  ['Show up every day', 'Check in, keep the streak, level up — and see your progress add up.'],
];

export default async function Home() {
  const { appName: APP_NAME, playStoreUrl: PLAY_STORE_URL } = await getSiteConfig();
  return (
    <div className="site">
      <SiteNav />

      <main className="site-main">
        <section className="hero">
          <span className="eyebrow">THE HABIT APP FOR EVERY GOAL</span>
          <h1>Build habits that stick. Break the ones that don’t.</h1>
          <p>
            Workouts, reading, sleep, quitting smoking, spending less — pick what matters to you, set your own goal, and {APP_NAME} keeps
            you on track every single day.
          </p>
          <div className="cta">
            {PLAY_STORE_URL ? (
              <a className="btn btn-primary btn-lg" href={PLAY_STORE_URL}>Download for Android — free</a>
            ) : (
              <span className="btn btn-primary btn-lg" aria-disabled>Android app coming soon</span>
            )}
            <a className="btn btn-lg" href="#areas">What can I track?</a>
          </div>
        </section>

        <h2 className="section-title" id="areas">What do you want to change?</h2>
        <p className="section-sub">One app for every part of your life. Every goal and every limit is yours to set.</p>
        <div className="features">
          {AREAS.map((a) => (
            <div key={a.title} className="card feature">
              <div className="ic" style={{ background: `${a.color}22` }}>{a.icon}</div>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </div>
          ))}
        </div>

        <h2 className="section-title">How it works</h2>
        <p className="section-sub">Ten seconds to start. A few taps a day.</p>
        <div className="features">
          {STEPS.map(([title, text], i) => (
            <div key={title} className="card feature">
              <div className="ic" style={{ background: 'var(--primary-soft)', fontWeight: 800, fontSize: 18, color: '#c4b5fd' }}>{i + 1}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>

        <h2 className="section-title">Why people stick with it</h2>
        <p className="section-sub">Motivation fades. Systems don’t.</p>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card feature">
              <div className="ic" style={{ background: `${f.color}22` }}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>

        <section className="hero" style={{ paddingTop: 80, paddingBottom: 0 }}>
          <h2 style={{ fontSize: 32 }}>Start with one small habit today.</h2>
          <div className="cta">
            {PLAY_STORE_URL ? (
              <a className="btn btn-primary btn-lg" href={PLAY_STORE_URL}>Get {APP_NAME} free</a>
            ) : (
              <span className="btn btn-primary btn-lg" aria-disabled>Coming soon to Google Play</span>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
