/**
 * Email service using Nodemailer over SMTP.
 *
 * Required environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   EMAIL_FROM  – e.g. "Plivio <noreply@plivio.com>"
 *   APP_URL     – frontend origin, e.g. https://plivio.com
 */
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.ts';

const APP_NAME  = 'Plivio';
const APP_URL   = process.env.APP_URL   ?? 'http://localhost:5173';
const FROM      = process.env.EMAIL_FROM ?? `${APP_NAME} <noreply@plivio.com>`;

// Lazily created so the app still starts even if SMTP is not configured.
let _transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (_transport) return _transport;

  _transport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });

  return _transport;
}

/** Shared HTML wrapper for every email. */
function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f0e14;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0e14;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#17161f;border-radius:12px;border:1px solid #2a2835;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#aa3bff;padding:24px 32px;text-align:center;">
              <span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:1px;">${APP_NAME}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#a09db0;font-size:15px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #2a2835;text-align:center;
                       color:#6b6880;font-size:12px;">
              © ${new Date().getFullYear()} ${APP_NAME} · Halvex Digital Inc.<br />
              If you did not request this email, you can safely ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, text: string): string {
  return `<a href="${href}"
     style="display:inline-block;margin:24px 0 8px;padding:14px 32px;
            background:#aa3bff;color:#fff;text-decoration:none;
            border-radius:8px;font-size:15px;font-weight:600;"
  >${text}</a>`;
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.SMTP_USER) {
    // SMTP not configured – log so developers can see the email during local dev
    logger.info({ to, subject }, '[email] SMTP not configured, skipping send');
    return;
  }
  try {
    await getTransport().sendMail({ from: FROM, to, subject, html });
    logger.info({ to, subject }, '[email] sent');
  } catch (err) {
    // Never throw – a failed email must never crash a request
    logger.error({ err, to, subject }, '[email] failed to send');
  }
}

// ─── Email types ─────────────────────────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${token}`;
  const body = `
    <p style="color:#f1f0f5;font-size:18px;font-weight:600;margin:0 0 12px;">
      Verify your email address
    </p>
    <p>Hi <strong>${username}</strong>,</p>
    <p>Thanks for joining ${APP_NAME}! Please click the button below to verify
       your email address and activate your account.</p>
    ${button(link, 'Verify Email')}
    <p style="color:#6b6880;font-size:13px;margin-top:8px;">
      This link expires in <strong>24 hours</strong>.<br />
      If the button doesn't work, copy and paste this URL into your browser:<br />
      <a href="${link}" style="color:#aa3bff;word-break:break-all;">${link}</a>
    </p>`;
  await send(to, `Verify your ${APP_NAME} account`, wrap('Email Verification', body));
}

export async function sendPasswordResetEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${token}`;
  const body = `
    <p style="color:#f1f0f5;font-size:18px;font-weight:600;margin:0 0 12px;">
      Reset your password
    </p>
    <p>Hi <strong>${username}</strong>,</p>
    <p>We received a request to reset the password for your ${APP_NAME} account.
       Click the button below to choose a new password.</p>
    ${button(link, 'Reset Password')}
    <p style="color:#6b6880;font-size:13px;margin-top:8px;">
      This link expires in <strong>15 minutes</strong>.<br />
      If you did not request a password reset, ignore this email —
      your account is safe and nothing has changed.<br /><br />
      If the button doesn't work, copy and paste:<br />
      <a href="${link}" style="color:#aa3bff;word-break:break-all;">${link}</a>
    </p>`;
  await send(to, `Reset your ${APP_NAME} password`, wrap('Password Reset', body));
}

export async function sendWithdrawalStatusEmail(
  to: string,
  username: string,
  amount: number,
  status: 'paid' | 'rejected',
): Promise<void> {
  const isPaid  = status === 'paid';
  const subject = isPaid
    ? `Your ₱${amount.toFixed(2)} withdrawal has been sent`
    : `Withdrawal of ₱${amount.toFixed(2)} was rejected`;

  const body = isPaid
    ? `
      <p style="color:#f1f0f5;font-size:18px;font-weight:600;margin:0 0 12px;">
        Withdrawal approved ✓
      </p>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Your withdrawal of <strong>₱${amount.toFixed(2)}</strong> has been
         <strong style="color:#22c55e;">approved</strong> and is being processed.
         Funds will arrive in your account shortly.</p>
      ${button(`${APP_URL}/withdraw`, 'View Withdrawals')}`
    : `
      <p style="color:#f1f0f5;font-size:18px;font-weight:600;margin:0 0 12px;">
        Withdrawal rejected
      </p>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Unfortunately your withdrawal request of <strong>₱${amount.toFixed(2)}</strong>
         has been <strong style="color:#ef4444;">rejected</strong>.</p>
      <p>The amount has been returned to your ${APP_NAME} balance.
         Please contact support if you have any questions.</p>
      ${button(`${APP_URL}/withdraw`, 'View Withdrawals')}`;

  await send(to, subject, wrap('Withdrawal Update', body));
}

export async function sendSubscriptionConfirmEmail(
  to: string,
  username: string,
  planName: string,
  expiresAt: Date,
): Promise<void> {
  const body = `
    <p style="color:#f1f0f5;font-size:18px;font-weight:600;margin:0 0 12px;">
      Subscription activated!
    </p>
    <p>Hi <strong>${username}</strong>,</p>
    <p>Your <strong>${planName}</strong> subscription is now active.</p>
    <p style="color:#6b6880;">
      Valid until: <strong style="color:#aa3bff;">
        ${expiresAt.toLocaleDateString('en-PH', { dateStyle: 'long' })}
      </strong>
    </p>
    ${button(`${APP_URL}/dashboard`, 'Go to Dashboard')}`;
  await send(to, `${planName} subscription activated – ${APP_NAME}`, wrap('Subscription', body));
}
