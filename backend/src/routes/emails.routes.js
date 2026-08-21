import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { sendEmail, wrapHtml, escapeHtml } from '../services/email.js';
import { pollInbox, getBridgeStatus, processIncomingEmail } from '../services/emailBridge.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * Send an AI-composed email (the "Send email" action on the AI chat's
 * emailDraft card). Admin only — the owner approves before it goes out.
 */
router.post('/send', auth, adminOnly, async (req, res, next) => {
  try {
    const { to, subject, body } = req.body || {};
    if (!to || !String(to).includes('@')) return res.status(400).json({ error: 'A valid recipient email is required' });
    if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'A subject is required' });
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'A body is required' });

    const html = wrapHtml(
      String(subject).slice(0, 200),
      String(body)
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br/>')
    );
    const result = await sendEmail(String(to), String(subject).slice(0, 200), {
      html,
      text: String(body),
    });

    if (!result.ok && !result.skipped) {
      return res.status(502).json({ error: result.error || 'Email send failed' });
    }
    res.json({ ok: true, skipped: result.skipped || false, to, subject });
  } catch (e) { next(e); }
});

/**
 * Bridge health: whether IMAP/SMTP are configured, last poll, count handled.
 * Lets the owner confirm the email bridge is live from the app.
 */
router.get('/status', auth, adminOnly, async (req, res, next) => {
  try {
    res.json({
      ...getBridgeStatus(),
      ownerEmail: env.ownerEmail || null,
      smtpUser: env.smtp.user || null,
    });
  } catch (e) { next(e); }
});

/** Manually trigger an inbox poll (useful for testing). */
router.post('/poll', auth, adminOnly, async (req, res, next) => {
  try {
    const result = await pollInbox();
    res.json(result);
  } catch (e) { next(e); }
});

/** Developer/test helper: process a single message directly. */
router.post('/process-test', auth, adminOnly, async (req, res, next) => {
  try {
    const { from, subject, body } = req.body || {};
    if (!from || !body) return res.status(400).json({ error: 'from and body are required' });
    const ok = await processIncomingEmail(from, subject || '(no subject)', body, `test-${Date.now()}`);
    res.json({ ok });
  } catch (e) { next(e); }
});

export default router;
