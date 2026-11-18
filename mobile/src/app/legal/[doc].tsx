import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Card, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { supportEmail } from '@/lib/support';

/**
 * ⚠️ Starting-point text only. Have these reviewed for the countries you launch in
 * (e.g. India DPDP Act 2023, EU GDPR, California CCPA) before publishing.
 * Replace the contact email and company name. Bump TERMS_VERSION on the server when they change.
 */
// Replaced with the support email from Admin → App settings when the page is shown
const CONTACT = '{{contact}}';
const UPDATED = '18 November 2026';

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['What we collect', 'Your name, email address, timezone and currency, and what you choose to log in the app: trackers, check-ins, trades, expenses, journal entries and rule breaks. We also record when you accept these policies.'],
      ['What we don’t collect', 'We do not access your contacts, location, camera, microphone, photos or other apps. We do not connect to your broker or bank. Reminders are scheduled on your device and only if you allow them.'],
      ['How we use it', 'Only to run the app for you: saving your data, calculating your streaks and reports, and sending account emails (verification and password reset). Product emails only if you opt in, and you can opt out anytime.'],
      ['Who can see it', 'Only you. We never sell your data. Administrators can see account details (name, email, sign-up date) and counts, never the content of your trades, expenses or journal.'],
      ['Advertising', 'Free versions of the app may show ads from Google AdMob. Where required, we ask for your consent before personalised ads are shown.'],
      ['Your rights', 'From Profile you can export all your data, change your email preferences, and permanently delete your account. Deletion removes your data from our database immediately.'],
      ['Security', 'Passwords are hashed with bcrypt, data travels over HTTPS, and sessions can be revoked from every device.'],
      ['Contact', `Questions or requests: ${CONTACT}`],
    ],
  },
  terms: {
    title: 'Terms of Use',
    sections: [
      ['The service', 'Anchor helps you track habits, spending and trading discipline. It is a self-improvement tool.'],
      ['Not financial advice', 'Nothing in the app is financial, investment or trading advice. Trading involves substantial risk of loss. You are solely responsible for your trading and financial decisions.'],
      ['Not medical advice', 'Health and habit features are not medical advice. Talk to a professional about addiction, health or mental-health concerns.'],
      ['Your account', 'Keep your password safe. You must be old enough to form a binding contract in your country (and at least 13). One person per account.'],
      ['Acceptable use', 'Don’t misuse the service, attempt to access other people’s data, or overload our systems. We may suspend accounts that do.'],
      ['Your content', 'You own what you log. You give us permission to store and process it only to provide the service to you.'],
      ['Changes', 'We may update these terms. If we do, we’ll ask you to accept the new version in the app.'],
      ['Contact', CONTACT],
    ],
  },
};

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = DOCS[doc] ?? DOCS.privacy!;
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: d.title }} />
      <Txt variant="caption" style={{ marginBottom: 16 }}>Last updated {UPDATED}</Txt>
      <View style={{ gap: 12 }}>
        {d.sections.map(([h, body]) => (
          <Card key={h} style={{ gap: 8 }}>
            <Txt variant="h3">{h}</Txt>
            <Txt color={colors.textMuted} style={{ fontSize: 15, lineHeight: 22 }}>{body.replace('{{contact}}', supportEmail() || 'Profile → Help & support in the app')}</Txt>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
