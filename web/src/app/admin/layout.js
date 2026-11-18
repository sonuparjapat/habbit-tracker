export const metadata = {
  title: { default: 'Admin', template: '%s · Anchor Admin' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }) {
  return children;
}
