
/**
 * Public legal pages (Google Play needs a public Privacy Policy URL and an account-deletion URL).
 * Keep in sync with the in-app copy: mobile/src/app/legal/[doc].tsx
 * ⚠️ Starting-point text — have it reviewed for your launch countries (India DPDP, EU GDPR, ...).
 */
export const UPDATED = '18 November 2026';
export const LEGAL_TITLES = { privacy: 'Privacy Policy', terms: 'Terms of Use', 'delete-account': 'Delete your account' };

/** Legal content with the live app name and support email (from Admin → App settings). */
export const getLegal = ({ appName: APP_NAME, supportEmail: SUPPORT_EMAIL }) => ({
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['What we collect', 'Your name, email address, timezone and currency, and what you choose to log in the app: trackers, check-ins, trades, expenses, journal entries and rule breaks. We also record when you accept these policies.'],
      ['What we don’t collect', 'We do not access your contacts, location, camera, microphone, photos or other apps. We do not connect to your broker or bank. Reminders are scheduled on your device and only if you allow them.'],
      ['How we use it', 'Only to run the app for you: saving your data, calculating your streaks and reports, and sending account emails (verification and password reset). Product emails only if you opt in, and you can opt out anytime.'],
      ['Who can see it', 'Only you. We never sell your data. Administrators can see account details (name, email, sign-up date) and counts, never the content of your trades, expenses or journal.'],
      ['Advertising', `Free versions of ${APP_NAME} may show ads from Google AdMob. Where required, we ask for your consent before personalised ads are shown.`],
      ['Your rights', 'From Profile in the app you can export all your data, change your email preferences, and permanently delete your account. Deletion removes your data from our database immediately.'],
      ['Security', 'Passwords are hashed with bcrypt, data travels over HTTPS, and sessions can be revoked from every device.'],
      ['Contact', `Questions or requests: ${SUPPORT_EMAIL}`],
    ],
  },
  terms: {
    title: 'Terms of Use',
    sections: [
      ['The service', `${APP_NAME} helps you track habits, spending and trading discipline. It is a self-improvement tool.`],
      ['Not financial advice', 'Nothing in the app is financial, investment or trading advice. Trading involves substantial risk of loss. You are solely responsible for your trading and financial decisions.'],
      ['Not medical advice', 'Health and habit features are not medical advice. Talk to a professional about addiction, health or mental-health concerns.'],
      ['Your account', 'Keep your password safe. You must be old enough to form a binding contract in your country (and at least 13). One person per account.'],
      ['Acceptable use', 'Don’t misuse the service, attempt to access other people’s data, or overload our systems. We may suspend accounts that do.'],
      ['Your content', 'You own what you log. You give us permission to store and process it only to provide the service to you.'],
      ['Changes', 'We may update these terms. If we do, we’ll ask you to accept the new version in the app.'],
      ['Contact', SUPPORT_EMAIL],
    ],
  },
  'delete-account': {
    title: 'Delete your account',
    sections: [
      ['In the app (instant)', `Open ${APP_NAME} → Profile → Delete account, enter your password and confirm. Your account and all its data are deleted immediately.`],
      ['Without the app', `Email ${SUPPORT_EMAIL} from the address you signed up with and ask us to delete your account. We verify it’s you and delete it within 7 days.`],
      ['What is deleted', 'Your profile, trackers, check-ins, trades, expenses, journal entries, rule-break history and consent records. Nothing is kept.'],
      ['Want a copy first?', 'Before deleting, use Profile → Export my data in the app to download everything.'],
    ],
  },
});
