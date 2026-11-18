import { Geist, Geist_Mono } from 'next/font/google';
import { APP_NAME, SITE_URL } from '@/lib/config';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME} — keep the promises you make to yourself`, template: `%s · ${APP_NAME}` },
  description: 'Set your own limits for trading, spending, health and habits — and get stopped before you break them.',
};

export const viewport = { themeColor: '#0a0c11' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
