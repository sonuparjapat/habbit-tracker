import { getLegal, LEGAL_TITLES, UPDATED } from '@/lib/legal';
import { getSiteConfig } from '@/lib/siteConfig';
import { SiteFooter, SiteNav } from './SiteChrome';

export function legalMetadata(key) {
  return { title: LEGAL_TITLES[key], alternates: { canonical: `/${key}` } };
}

export async function LegalPage({ doc }) {
  const d = getLegal(await getSiteConfig())[doc];
  return (
    <div className="site">
      <SiteNav />
      <main className="site-main" style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: 36, marginTop: 32 }}>{d.title}</h1>
        <p className="muted" style={{ margin: '8px 0 28px' }}>Last updated {UPDATED}</p>
        <div className="stack">
          {d.sections.map(([heading, body]) => (
            <section key={heading} className="card">
              <h2 style={{ marginBottom: 8 }}>{heading}</h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>{body}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
