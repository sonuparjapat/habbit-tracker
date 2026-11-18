import { Geist, Geist_Mono } from 'next/font/google';
import { APP_NAME, SITE_URL } from '@/lib/config';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME} — build habits that stick`, template: `%s · ${APP_NAME}` },
  description: 'Build habits that stick and break the ones that don’t — workouts, reading, sleep, quitting smoking, budgets and more. Streaks, XP and honest progress reports.',
};

export const viewport = { themeColor: '#0a0c11' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
