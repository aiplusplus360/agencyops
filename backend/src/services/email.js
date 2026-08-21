import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, user, pass } = env.smtp;
  if (!host || !user) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">
  <div style="background:#ffffff;border-radius:12px;box-shadow:0 4px 16px rgba(15,23,42,.06);overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#2563eb;padding:16px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:600;">AgencyOps</span>
    </div>
    <div style="padding:24px;">
      <h2 style="color:#0f172a;margin:0 0 16px;font-size:20px;">${escapeHtml(title)}</h2>
      ${bodyHtml}
    </div>
    <div style="background:#f8fafc;padding:12px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
      Sent by AgencyOps.
    </div>
  </div>
</div>
</body></html>`;
}

export async function sendEmail(to, subject, { html = '', text = '' }) {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('[email] SMTP not configured — skipping send.');
    return { skipped: true };
  }
  try {
    await transport.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text: text || 'Please view this email in an HTML client.',
      html: html || wrapHtml(subject, `<p>${escapeHtml(text)}</p>`),
    });
    await prisma.emailLog.create({
      data: { toEmail: to, subject, status: 'sent' },
    });
    return { ok: true };
  } catch (e) {
    logger.error('[email] send failed:', e.message);
    await prisma.emailLog.create({
      data: { toEmail: to, subject, status: 'failed', error: e.message },
    }).catch(() => {});
    return { ok: false, error: e.message };
  }
}

export async function sendTestEmail(to) {
  const transport = getTransporter();
  if (!transport) return { ok: false, error: 'SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.' };
  const result = await sendEmail(to, 'AgencyOps — SMTP test', {
    html: wrapHtml('SMTP configuration works', '<p>Your email settings are configured correctly.</p>'),
    text: 'Your email settings are configured correctly.',
  });
  return result;
}

export { wrapHtml, escapeHtml };
