import prisma from '../lib/prisma.js';
import { sendEmail, wrapHtml, escapeHtml } from './email.js';
import { logger } from '../lib/logger.js';

/**
 * Send a worker a notification email IF they have opted in (emailNotifs).
 * Always records the send attempt in email_logs via sendEmail.
 */
export async function notifyWorkerEmail(userId, subject, { title, body }) {
  if (!userId) return null;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.emailNotifs || !user.email) return null;

    const html = wrapHtml(title || subject, `<p style="color:#475569;">${escapeHtml(body || '')}</p>`);
    const res = await sendEmail(user.email, subject, { html, text: body || '' });
    if (!res.ok && !res.skipped) {
      logger.warn(`[email] worker notification to ${user.email} failed`);
    }
    return res;
  } catch (e) {
    logger.error('[email] notifyWorkerEmail failed', e.message);
    return null;
  }
}
