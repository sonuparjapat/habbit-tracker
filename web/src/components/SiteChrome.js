import Link from 'next/link';
import { getSiteConfig } from '@/lib/siteConfig';

/** Header and footer shared by every public page (settings come from Admin → App settings). */

export async function SiteNav() {
  const { appName, playStoreUrl } = await getSiteConfig();
  return (
    <nav className="site-nav">
      <Link href="/" className="brand" style={{ padding: 0, color: 'var(--text)', textDecoration: 'none' }}>
        <div className="brand-mark">⚓</div>
        {appName}
      </Link>
      {playStoreUrl ? (
        <a className="btn btn-primary" href={playStoreUrl}>Get the app</a>
      ) : (
        <span className="badge violet">Coming soon to Google Play</span>
      )}
    </nav>
  );
}

export async function SiteFooter() {
  const { appName, supportEmail } = await getSiteConfig();
  return (
    <footer className="site-footer">
      <div>© {appName}</div>
      <div style={{ marginTop: 10 }}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/delete-account">Delete account</Link>
        {supportEmail ? <a href={`mailto:${supportEmail}`}>Contact</a> : null}
      </div>
    </footer>
  );
}
