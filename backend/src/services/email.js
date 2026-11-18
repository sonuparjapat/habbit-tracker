/**
 * Email delivery with pluggable providers, chosen by EMAIL_PROVIDER:
 *   console (dev) | ses (AWS SES v2) | smtp (any SMTP: SendGrid, Mailgun, Brevo, Zoho, ...)
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport;

function getTransport() {
  if (transport) return transport;
  const { provider, aws, smtp } = config.email;

  if (provider === 'ses') {
    const client = new SESv2Client({
      region: aws.region,
      // Falls back to the default AWS credential chain (IAM role on EC2/ECS) when keys are empty
      credentials: aws.accessKeyId ? { accessKeyId: aws.accessKeyId, secretAccessKey: aws.secretAccessKey } : undefined,
    });
    transport = async ({ to, subject, html, text }) => {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: config.email.from,
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
    transport = ({ to, subject, html, text }) => t.sendMail({ from: config.email.from, to, subject, html, text });
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

export async function sendEmail(message) {
  await getTransport()(message);
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

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
