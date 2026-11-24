import 'dotenv/config';

const env = (name) => {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
};

function required(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

const isProd = env('NODE_ENV') === 'production';
const appName = env('APP_NAME') ?? 'Holdfast';

/** "Name <a@b.com>" or a bare "a@b.com" (the app name is added). */
function parseFrom(value) {
  if (!value) return { name: appName, email: 'no-reply@example.com' };
  const m = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || appName, email: m[2].trim() } : { name: appName, email: value };
}

const mailUser = env('MAIL_USER') ?? env('SMTP_USER');
const mailPass = env('MAIL_PASS') ?? env('SMTP_PASS');
const brevoKey = env('BREVO_API_KEY');

/**
 * Email provider: EMAIL_PROVIDER wins if set; otherwise
 * BREVO_API_KEY -> brevo, MAIL_USER + MAIL_PASS -> smtp, else console (dev).
 */
const emailProvider = env('EMAIL_PROVIDER') ?? (brevoKey ? 'brevo' : mailUser && mailPass ? 'smtp' : 'console');

// Sensible SMTP host defaults when only MAIL_USER/MAIL_PASS are given
const defaultSmtpHost = mailUser?.toLowerCase().endsWith('@gmail.com') ? 'smtp.gmail.com' : brevoKey ? 'smtp-relay.brevo.com' : undefined;

export const config = {
  isProd,
  port: Number(env('PORT') ?? 4000),
  appName,
  /** Public URL of this API, e.g. https://api.yourdomain.com (used in logs / links) */
  backendUrl: (env('BACKEND_URL') ?? `http://localhost:${env('PORT') ?? 4000}`).replace(/\/+$/, ''),
  corsOrigin: env('CORS_ORIGIN') ?? '*',
  /** Max API requests per minute from one IP (generous: mobile networks share IPs) */
  apiRateLimit: Number(env('API_RATE_LIMIT') ?? 600),

  databaseUrl: required('DATABASE_URL'),
  // Hosted Postgres (RDS, Neon, Supabase...) needs SSL. Default on in production unless DB_SSL=false.
  dbSsl: env('DB_SSL') ? env('DB_SSL') === 'true' : isProd,
  dbPoolMax: Number(env('DB_POOL_MAX') ?? 10),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: env('JWT_EXPIRES_IN') ?? '30d',

  email: {
    provider: emailProvider,
    from: parseFrom(env('MAIL_FROM') ?? env('EMAIL_FROM')),
    brevo: { apiKey: brevoKey },
    smtp: {
      host: env('SMTP_HOST') ?? env('MAIL_HOST') ?? defaultSmtpHost,
      port: Number(env('SMTP_PORT') ?? env('MAIL_PORT') ?? 587),
      secure: (env('SMTP_SECURE') ?? env('MAIL_SECURE')) === 'true',
      user: mailUser,
      pass: mailPass,
    },
  },

  aws: {
    region: env('AWS_REGION') ?? 'ap-south-1',
    accessKeyId: env('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
    bucket: env('AWS_BUCKET_NAME'),
  },

  // Reserved for the Premium plan (payments are not wired up yet)
  razorpay: {
    keyId: env('RAZORPAY_KEY_ID'),
    keySecret: env('RAZORPAY_KEY_SECRET'),
  },

  termsVersion: env('TERMS_VERSION') ?? '2026-11-18',
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
/** Why email cannot send right now (null = configured). Shown at startup and in Admin → System. */
config.email.problem =
  config.email.provider === 'brevo' && !brevoKey
    ? 'EMAIL_PROVIDER is brevo but BREVO_API_KEY is empty — no emails are sent.'
    : config.email.provider === 'smtp' && !(mailUser && mailPass)
      ? 'EMAIL_PROVIDER is smtp but MAIL_USER / MAIL_PASS are empty — no emails are sent.'
      : config.email.provider === 'console' && isProd
        ? 'No email provider configured — emails are only printed in the server log. Set BREVO_API_KEY.'
        : null;

if (config.email.provider === 'smtp' && !config.email.smtp.host) {
  throw new Error('SMTP email needs SMTP_HOST (or a Gmail MAIL_USER) — see .env.example');
}
