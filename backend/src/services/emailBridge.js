import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import prisma from '../lib/prisma.js';
import { env } from '../config/env.js';
import { sendEmail, wrapHtml, escapeHtml } from './email.js';
import { processAiMessage } from '../routes/aiChat.routes.js';
import { logger } from '../lib/logger.js';

let polling = false;
let lastPollAt = null;
let lastPollError = null;
let lastPollCount = 0;

export function getBridgeStatus() {
  return {
    configured: !!(env.imap.host && env.imap.user && env.imap.pass),
    polling,
    lastPollAt,
    lastPollError,
    lastPollCount,
  };
}

/** The owner/admin account the AI converses with over email. */
async function findOwnerUser() {
  if (env.ownerEmail) {
    const byEmail = await prisma.user.findFirst({ where: { email: env.ownerEmail, role: 'ADMIN', active: true } });
    if (byEmail) return byEmail;
  }
  return prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { createdAt: 'asc' } });
}

/** Emails the bridge is allowed to act on — the owner + system admins only. */
async function allowedSenders() {
  const set = new Set([env.ownerEmail].filter(Boolean).map((e) => e.toLowerCase()));
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { email: true } });
  for (const a of admins) if (a.email) set.add(a.email.toLowerCase());
  return set;
}

/**
 * Persistent "Email bridge" conversation per owner — keeps the AI's context
 * across separate emails, just like a chat thread.
 */
async function getBridgeConversation(userId) {
  const setting = await prisma.setting.findUnique({ where: { key: 'emailBridge' } });
  const map = setting?.value && typeof setting.value === 'object' ? setting.value : {};
  if (map[userId]) {
    const existing = await prisma.conversation.findFirst({ where: { id: map[userId], userId } });
    if (existing) return existing;
  }
  const conv = await prisma.conversation.create({ data: { userId, title: 'Email bridge' } });
  await prisma.setting.upsert({
    where: { key: 'emailBridge' },
    create: { key: 'emailBridge', value: { ...map, [userId]: conv.id } },
    update: { value: { ...map, [userId]: conv.id } },
  });
  return conv;
}

/** Strip quoted reply and signature noise from an email body. */
export function cleanReplyBody(text) {
  let body = String(text || '').trim().replace(/\r\n/g, '\n');
  body = body.split(/\n\s*>?\s*On\s+.{0,80}wrote:/i)[0];
  body = body.split(/\n\s*From:\s+[^\n]+@[^\n]+\s+Sent:/i)[0];
  body = body
    .split('\n')
    .filter((line) => !/^>/.test(line.trim()) && !/^Sent from my (iPhone|Android|phone|Galaxy)/i.test(line.trim()))
    .join('\n')
    .trim();
  return body.slice(0, 12000);
}

/** Strip HTML into readable text (mailparser gives us .text, this is a fallback). */
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Format bridge conversation history into the messages shape the AI expects. */
async function buildHistory(conversation) {
  const msgs = await prisma.conversationMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });
  return msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
}

/**
 * Process ONE incoming email: run it through the AI pipeline and email the
 * reply back to the sender. Returns true when a reply was sent.
 */
export async function processIncomingEmail(from, subject, bodyText, messageId) {
  const owner = await findOwnerUser();
  if (!owner) {
    logger.warn('[email-bridge] no admin user found — skipping email reply.');
    return false;
  }

  const conversation = await getBridgeConversation(owner.id);
  const history = await buildHistory(conversation);
  const userMessage = bodyText || `(no message body — subject: ${subject})`;
  const userContent = `[From email] ${userMessage}`;

  // Run the exact same AI pipeline as the in-app chat.
  let replyText = '';
  let extra = '';
  try {
    const result = await processAiMessage({
      userId: owner.id,
      messages: [...history, { role: 'user', content: userContent }],
      productIds: [],
      conversationId: conversation.id,
      model: undefined,
    });
    replyText = result?.reply || 'I got your message. Let me know what you need and I’ll take care of it.';

    // Surface proposed artifacts over email so the owner knows to check the app.
    if (result?.draft) extra = '\n\nI’ve prepared a draft plan for this — open the AgencyOps app to review and approve it.';
    if (result?.taskChanges?.length) extra = `\n\nI’ve proposed ${result.taskChanges.length} task change(s) — open the app to review and apply them.`;
    if (result?.productChanges?.length) extra = `\n\nI’ve proposed ${result.productChanges.length} portfolio change(s) — open the app to review and apply them.`;
    if (result?.employeeDrafts?.length) extra = `\n\nI’ve prepared ${result.employeeDrafts.length} employee login profile(s) — open the app to review and create them.`;
    if (result?.emailDraft) extra = `\n\nI’ve drafted an email for you — open the app to review and send it.`;
  } catch (e) {
    logger.error(`[email-bridge] AI pipeline failed for "${subject}":`, e?.message || e);
    replyText = 'I hit a hiccup processing your email. Please try again in a moment, or reach out in the app chat.';
  }

  const replySubject = subject && !/^re:/i.test(subject) ? `Re: ${subject}` : subject || 'Re: your email';
  const textBody = `${replyText}${extra}\n\n— AgencyOps`;
  const htmlBody = wrapHtml(replySubject, `
    <p style="color:#334155;">${escapeHtml(replyText).replace(/\n/g, '<br/>')}${extra ? `<br/><br/>${escapeHtml(extra).replace(/\n/g, '<br/>')}` : ''}</p>
  `);

  const res = await sendEmail(from, replySubject, { html: htmlBody, text: textBody });
  await logEmailExchange({ from, subject, replyText, messageId, sent: !!res.ok });

  if (res.ok) logger.info(`[email-bridge] replied to ${from} re: "${replySubject}"`);
  else logger.warn(`[email-bridge] reply to ${from} failed: ${res.error || 'unknown'}`);
  return !!res.ok;
}

/** Record the bridge exchange for auditability. */
async function logEmailExchange({ from, subject, replyText, messageId, sent }) {
  try {
    await prisma.activityLog.create({
      data: {
        action: sent ? 'email_bridge_reply' : 'email_bridge_failed',
        entityType: 'email',
        entityId: messageId || undefined,
        meta: { from, subject, reply: replyText.slice(0, 500) },
      },
    });
  } catch { /* best effort */ }
}

/** Where we store the last poll boundary so we never reprocess old mail. */
async function getLastProcessedAt() {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'emailBridgePoll' } });
    if (s?.value?.lastProcessedAt) return new Date(s.value.lastProcessedAt);
  } catch { /* ignore */ }
  // Default: only act on mail from the last 2 days, so the 400+ old unseen
  // messages in the inbox are never fed to the AI.
  return new Date(Date.now() - 2 * 24 * 3600 * 1000);
}

async function saveLastProcessedAt(date) {
  try {
    await prisma.setting.upsert({
      where: { key: 'emailBridgePoll' },
      create: { key: 'emailBridgePoll', value: { lastProcessedAt: date.toISOString() } },
      update: { value: { lastProcessedAt: date.toISOString() } },
    });
  } catch { /* ignore */ }
}

/** Poll Gmail INBOX for new emails from the owner and reply to each one. */
export async function pollInbox() {
  if (polling) return { skipped: true };
  if (!env.imap.host || !env.imap.user || !env.imap.pass) {
    logger.warn('[email-bridge] IMAP not configured — poll skipped.');
    return { skipped: true, reason: 'imap_not_configured' };
  }

  polling = true;
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: true,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
    connectionTimeout: 30000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let processed = 0;
    let newestSeen = null;
    try {
      const allowed = await allowedSenders();
      const since = await getLastProcessedAt();
      // Only fetch mail from the owner — Gmail's FROM filter keeps this fast
      // and avoids downloading unrelated unseen mail (newsletters, etc.).
      const searchQuery = { seen: false, since };
      if (env.ownerEmail) searchQuery.from = env.ownerEmail;
      const searchRes = await client.search(searchQuery, { uid: false });
      const seqs = Array.from(searchRes || []);
      // Cap work per poll so a burst of emails can't wedge the event loop.
      const targets = seqs.slice(0, 10);

      for (const seq of targets) {
        const msg = await client.fetchOne(seq, { source: true, envelope: true }, { uid: false });
        if (!msg?.source) continue;

        const parsed = await simpleParser(msg.source);
        const from = parsed?.from?.value?.[0]?.address || '';
        if (!from || !allowed.has(from.toLowerCase())) continue;

        const subject = parsed.subject || '(no subject)';
        const body = cleanReplyBody(parsed.text || htmlToText(parsed.html) || '');
        if (!body) continue;

        const ok = await processIncomingEmail(from, subject, body, parsed.messageId);
        // Mark handled only on success so a failed attempt can be retried
        // (the time window above still guards against old mail).
        if (ok) await client.messageFlagsAdd(String(seq), ['\\Seen'], { uid: false });
        processed += 1;
        const d = parsed.date instanceof Date ? parsed.date : new Date();
        if (!newestSeen || d > newestSeen) newestSeen = d;
      }
    } finally {
      lock.release();
    }
    if (newestSeen) await saveLastProcessedAt(newestSeen);
    await client.logout();
    lastPollAt = new Date();
    lastPollError = null;
    lastPollCount = processed;
    logger.info(`[email-bridge] poll complete — ${processed} email(s) processed.`);
    return { processed, skipped: false };
  } catch (e) {
    lastPollAt = new Date();
    lastPollError = e?.message || String(e);
    logger.error('[email-bridge] poll failed:', lastPollError);
    try { await client.logout(); } catch { /* ignore */ }
    return { processed: 0, skipped: false, error: lastPollError };
  } finally {
    polling = false;
  }
}
