import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors.ts';
import { logger }          from '../utils/logger.ts';

// Reuse nodemailer transport from email service
import nodemailer from 'nodemailer';

function getTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
}

const MAX_LEN = { name: 100, email: 254, subject: 200, message: 4000 };

export async function sendContact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, email, subject, message } = req.body as Record<string, string>;

    // Server-side validation (defence in depth — client also validates)
    if (!name?.trim() || name.length > MAX_LEN.name) {
      throw new ValidationError('Name is required (max 100 chars)');
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > MAX_LEN.email) {
      throw new ValidationError('Valid email is required');
    }
    if (!subject?.trim() || subject.length > MAX_LEN.subject) {
      throw new ValidationError('Subject is required (max 200 chars)');
    }
    if (!message?.trim() || message.length < 10 || message.length > MAX_LEN.message) {
      throw new ValidationError('Message must be 10–4,000 characters');
    }

    const supportEmail = process.env.SUPPORT_EMAIL ?? process.env.SMTP_USER;

    if (supportEmail && process.env.SMTP_USER) {
      await getTransport().sendMail({
        from:     `"Plivio Contact" <${process.env.SMTP_USER}>`,
        to:       supportEmail,
        replyTo:  `"${name.trim()}" <${email.trim()}>`,
        subject:  `[Contact] ${subject.trim()}`,
        text:     `From: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`,
        html:     `<p><strong>From:</strong> ${escHtml(name)} &lt;${escHtml(email)}&gt;</p>
                   <p><strong>Subject:</strong> ${escHtml(subject)}</p>
                   <hr/>
                   <pre style="font-family:inherit;white-space:pre-wrap">${escHtml(message)}</pre>`,
      });
    } else {
      logger.info({ name, email, subject }, '[contact] SMTP not configured — message logged');
    }

    res.json({ success: true, message: 'Message sent. We will get back to you within 24 hours.' });
  } catch (err) { next(err); }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
