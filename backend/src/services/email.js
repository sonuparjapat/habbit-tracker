/**
 * Email delivery with pluggable providers (see config.email.provider):
 *   brevo   (Brevo transactional API — BREVO_API_KEY)
 *   smtp    (MAIL_USER / MAIL_PASS — Gmail app password, Brevo SMTP, Zoho, ...)
 *   ses     (AWS SES v2)
 *   console (development: prints emails to the server log)
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport;
const { from } = config.email;
const fromHeader = `"${from.name.replace(/"/g, '')}" <${from.email}>`;

function getTransport() {
  if (transport) return transport;
  const { provider, smtp, brevo } = config.email;
  const aws = config.aws;

  if (provider === 'brevo') {
    transport = async ({ to, subject, html, text }) => {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000), // never let a slow email provider hang a sign-up
        headers: { 'api-key': brevo.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      });
      if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    };
  } else if (provider === 'ses') {
    const client = new SESv2Client({
      region: aws.region,
      // Falls back to the default AWS credential chain (IAM role on EC2/ECS) when keys are empty
      credentials: aws.accessKeyId ? { accessKeyId: aws.accessKeyId, secretAccessKey: aws.secretAccessKey } : undefined,
    });
    transport = async ({ to, subject, html, text }) => {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: fromHeader,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
    };
  } else if (provider === 'smtp') {
    const t = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    transport = ({ to, subject, html, text }) => t.sendMail({ from: fromHeader, to, subject, html, text });
  } else {
    transport = async ({ to, subject, text }) => {
      console.log(`\n📧 [email:console] to=${to}\n   subject: ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
    };
  }
  return transport;
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0A0C11;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="100%" style="max-width:480px;background:#12151D;border-radius:20px;padding:32px;color:#F4F6FB">
      <tr><td style="font-size:20px;font-weight:800;padding-bottom:16px">⚓ ${config.appName}</td></tr>
      <tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${title}</td></tr>
      <tr><td style="font-size:15px;line-height:22px;color:#C9CFDB">${bodyHtml}</td></tr>
      <tr><td style="font-size:12px;color:#5D6577;padding-top:24px">If you didn't request this, you can ignore this email.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

const codeBlock = (code) =>
  `<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#1A1F2B;border-radius:14px;padding:18px;text-align:center;margin:20px 0;color:#fff">${code}</div>`;

/**
 * What happened to the last emails — shown in Admin → System, so a broken email setup is obvious
 * (instead of only appearing in the server log).
 */
export const emailHealth = { sent: 0, failed: 0, lastSentAt: null, lastErrorAt: null, lastError: null, hint: null };

/** Turn a provider error into what to do about it. */
function hintFor(message) {
  const m = String(message).toLowerCase();
  if (m.includes('ip')) return 'Brevo is blocking this server’s IP address. In Brevo go to Settings → Security → Authorised IPs and turn the IP restriction off (or add the server’s IP).';
  if (m.includes('sender') || m.includes('not valid') || m.includes('not verified'))
    return 'MAIL_FROM is not a verified sender in Brevo. Verify it in Brevo → Senders, Domains & Dedicated IPs → Senders, or use one that is.';
  if (m.includes('401') || m.includes('key not found') || m.includes('unauthorized'))
    return 'The BREVO_API_KEY is wrong, deleted, or has a typo in its name on the server. Create a new key in Brevo → SMTP & API → API Keys and set it in Render → Environment.';
  if (m.includes('timeout') || m.includes('aborted') || m.includes('fetch failed')) return 'The email provider did not answer in time. Usually temporary — try the test email again.';
  return null;
}

export async function sendEmail(message) {
  try {
    await getTransport()(message);
    emailHealth.sent++;
    emailHealth.lastSentAt = new Date().toISOString();
  } catch (err) {
    emailHealth.failed++;
    emailHealth.lastErrorAt = new Date().toISOString();
    emailHealth.lastError = String(err?.message ?? err).slice(0, 400);
    emailHealth.hint = hintFor(emailHealth.lastError);
    throw err;
  }
}

export function sendVerificationCode(to, name, code) {
  return sendEmail({
    to,
    subject: `${code} is your ${config.appName} verification code`,
    text: `Hi ${name},\n\nYour verification code is ${code}. It expires in 15 minutes.`,
    html: layout('Verify your email', `Hi ${escape(name)}, enter this code in the app to verify your email:${codeBlock(code)}It expires in 15 minutes.`),
  });
}

export function sendPasswordResetCode(to, name, code) {
  return sendEmail({
    to,
    subject: `Reset your ${config.appName} password`,
    text: `Hi ${name},\n\nYour password reset code is ${code}. It expires in 15 minutes.`,
    html: layout('Reset your password', `Hi ${escape(name)}, use this code to set a new password:${codeBlock(code)}It expires in 15 minutes.`),
  });
}

const REASON_TEXT = {
  too_many_attempts: 'there were too many wrong password attempts on it',
  admin: 'our team noticed something unusual and wants to make sure it’s really you',
};

/** The account was locked for safety; the owner can unlock it with this code. */
export function sendAccountLockedEmail(to, name, code, reason) {
  const why = REASON_TEXT[reason] ?? REASON_TEXT.admin;
  return sendEmail({
    to,
    subject: `Your ${config.appName} account was locked for your safety`,
    text: `Hi ${name},

We locked your account because ${why}.

To unlock it, open the app, tap "Unlock my account" and enter this code: ${code}
It expires in 15 minutes (you can ask for a new one).

If this wasn't you trying to sign in, also change your password after unlocking.`,
    html: layout(
      'Your account was locked',
      `Hi ${escape(name)}, we locked your account because ${escape(why)}. Nobody can sign in until it is unlocked.<br><br>To unlock it, open the app, tap <b>Unlock my account</b> and enter:${codeBlock(code)}It expires in 15 minutes — you can ask for a new one. If this wasn't you, change your password after unlocking.`,
    ),
  });
}

/** An admin suspended or reactivated the account. */
export function sendAccountStatusEmail(to, name, status, reason) {
  const suspended = status === 'suspended';
  const support = config.email.from.email;
  return sendEmail({
    to,
    subject: suspended ? `Your ${config.appName} account has been suspended` : `Your ${config.appName} account is active again`,
    text: suspended
      ? `Hi ${name},

Your account has been suspended${reason ? `: ${reason}` : '.'}

If you think this is a mistake, reply to this email.`
      : `Hi ${name},

Good news — your account is active again. You can sign in as usual.`,
    html: suspended
      ? layout('Your account has been suspended', `Hi ${escape(name)}, your account has been suspended${reason ? `:<br><br><i>${escape(reason)}</i>` : '.'}<br><br>If you think this is a mistake, reply to this email or write to ${escape(support)}.`)
      : layout('Your account is active again', `Hi ${escape(name)}, good news — your account is active again. You can sign in as usual.`),
  });
}

/** Sent after a password change, so the owner notices if it wasn't them. */
export function sendPasswordChangedEmail(to, name) {
  return sendEmail({
    to,
    subject: `Your ${config.appName} password was changed`,
    text: `Hi ${name},

Your password was just changed and you were signed out on other devices.

If this wasn't you, reset your password right away with "Forgot password" in the app.`,
    html: layout('Your password was changed', `Hi ${escape(name)}, your password was just changed and you were signed out on other devices.<br><br>If this wasn't you, reset your password right away with <b>Forgot password</b> in the app.`),
  });
}

/** Evening check-in: the member opted in and hasn't logged these yet today. */
export function sendNudgeEmail(to, name, missed) {
  const list = missed.map((m) => `<li style="padding:4px 0">${escape(m)}</li>`).join('');
  return sendEmail({
    to,
    subject: missed.length === 1 ? `Don’t forget today: ${missed[0]}` : `${missed.length} things left for today`,
    text: [
      `Hi ${name},`,
      '',
      'Still open today:',
      ...missed.map((m) => `- ${m}`),
      '',
      'A few seconds in the app keeps your streak alive.',
      '',
      `Don't want these? Profile → Evening check-in in the ${config.appName} app.`,
    ].join('\n'),
    html: layout(
      'Still open today',
      `Hi ${escape(name)}, these are waiting for you:<ul style="margin:14px 0;padding-left:20px;color:#F4F6FB">${list}</ul>A few seconds in the app keeps your streak alive. 🔥<br><br><span style="font-size:12px;color:#5D6577">You get this because you switched on evening check-ins. Turn them off any time in Profile → Evening check-in.</span>`,
    ),
  });
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
