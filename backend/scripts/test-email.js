// Usage: npm run email:test -- you@example.com
// Sends a real test email with the configured provider (Brevo / SMTP / SES) and reports the result.
// Sending an email needs no database, so don't require one here.
// (Set before loading config; dotenv never overrides variables that already exist.)
process.env.DATABASE_URL ||= 'postgres://not-used-by-email-test';
process.env.JWT_SECRET ||= 'not-used-by-email-test-'.repeat(2);
const { config } = await import('../src/config.js');
const { sendVerificationCode } = await import('../src/services/email.js');

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Usage: npm run email:test -- you@example.com');
  process.exit(1);
}

const { provider, from, brevo } = config.email;
console.log(`Provider: ${provider}`);
console.log(`From:     ${from.name} <${from.email}>`);
console.log(`To:       ${to}`);

if (provider === 'brevo' && !brevo.apiKey) {
  console.error('\n✗ BREVO_API_KEY is empty in backend/.env');
  process.exit(1);
}
if (provider === 'console') console.log('\n(console provider: the email is printed below, nothing is sent)');

try {
  await sendVerificationCode(to, 'there', '123456');
  console.log(provider === 'console' ? '' : '\n✓ Sent. Check the inbox (and the spam folder).');
} catch (err) {
  console.error(`\n✗ Failed: ${err.message}`);
  if (/401|Key not found|unauthorized/i.test(err.message)) console.error('  → The API key is wrong or was deleted. Create a new one in Brevo → SMTP & API → API Keys.');
  if (/sender|not valid|not verified/i.test(err.message)) console.error('  → MAIL_FROM is not a verified sender in Brevo → Senders, Domains & Dedicated IPs → Senders.');
  if (/IP|unrecognised|unrecognized/i.test(err.message)) console.error('  → Brevo blocked this server’s IP. Allow it in Brevo → Security → Authorised IPs (or turn that check off).');
  process.exit(1);
}
