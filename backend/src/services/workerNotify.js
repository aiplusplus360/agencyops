import prisma from '../lib/prisma.js';
import { sendEmail, wrapHtml, escapeHtml } from './email.js';
import { emitToUser } from './realtime.js';

/**
 * Unified worker notification: in-app record + optional SMTP email + live socket push.
 */
export async function notifyWorker({ userId, type, title, body = null, socketEvent = 'notification' }) {
  if (!userId) return null;

  const record = await prisma.notification.create({
    data: { userId, type, title, body },
  });

  emitToUser(userId, socketEvent, record);

  // Opt-in worker email via SMTP
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailNotifs: true, name: true },
  });
  if (user?.emailNotifs && user?.email) {
    sendEmail(user.email, title, {
      html: wrapHtml(title, `<p>${body ? escapeHtml(body) : ''}</p>`),
      text: `${title}\n${body || ''}`,
    }).catch(() => {});
  }

  return record;
}
