import prisma from '../lib/prisma.js';
import { getSettings, logActivity } from '../lib/utils.js';
import { sendEmail, wrapHtml, escapeHtml } from './email.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Daily & Weekly Admin Digest.
 * Aggregates key metrics and delivers in-app (stored) and by email (SMTP).
 */
async function buildDailyDigest() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const [newAssignments, overdue, inEval, revisions, escalations] = await Promise.all([
    prisma.assignment.count({ where: { assignedAt: { gte: since } } }),
    prisma.task.count({ where: { status: 'PENDING', deadline: { lt: new Date() } } }),
    prisma.task.count({ where: { status: 'SUBMITTED' } }),
    prisma.revision.count({ where: { createdAt: { gte: since } } }),
    prisma.activityLog.count({ where: { action: 'escalation', createdAt: { gte: since } } }),
  ]);

  return {
    period: 'DAILY',
    date: new Date().toISOString().slice(0, 10),
    newAssignments,
    overdue,
    inEval,
    revisions,
    escalations,
  };
}

async function buildWeeklyDigest() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [completed, evaluations, active, workers, revisions] = await Promise.all([
    prisma.task.count({ where: { status: 'COMPLETED', updatedAt: { gte: since } } }),
    prisma.evaluation.findMany({ where: { evaluatedAt: { gte: since } } }),
    prisma.task.count({ where: { status: { in: ['PENDING', 'WORKING_ON_IT', 'SUBMITTED', 'IN_REVISION'] } } }),
    prisma.worker.findMany({ include: { user: true } }),
    prisma.revision.count({ where: { createdAt: { gte: since } } }),
  ]);

  const avgQuality = evaluations.length
    ? Math.round(evaluations.reduce((s, e) => s + e.qualityScore, 0) / evaluations.length)
    : 0;

  // Per-worker aggregates for top/bottom performers
  const perWorker = [];
  for (const w of workers) {
    const wEvals = evaluations.filter((e) => e.submissionId && e.submissionId.includes(w.userId));
    // simpler: query evaluations per worker
  }
  // top/bottom via direct query
  const workersWithScores = await Promise.all(
    workers.map(async (w) => {
      const evals = await prisma.evaluation.findMany({
        where: { submission: { workerId: w.id }, evaluatedAt: { gte: since } },
      });
      const avg = evals.length ? evals.reduce((s, e) => s + e.qualityScore, 0) / evals.length : null;
      const done = await prisma.task.count({
        where: { assignments: { some: { workerId: w.id, confirmedAt: { gte: since } } }, status: 'COMPLETED' },
      });
      return { name: w.user.name, avg: avg ? Math.round(avg) : null, done };
    })
  );
  const scored = workersWithScores.filter((x) => x.avg !== null).sort((a, b) => b.avg - a.avg);
  const top = scored.slice(0, 3);
  const bottom = scored.slice(-3).reverse();

  return {
    period: 'WEEKLY',
    weekStart: since.toISOString().slice(0, 10),
    completed,
    avgQuality,
    active,
    revisions,
    topPerformers: top,
    bottomPerformers: bottom,
  };
}

function renderDigestHtml(digest) {
  const rows = (arr) => arr
    .map((w) => `<tr><td>${escapeHtml(w.name)}</td><td>${w.avg ?? '—'}</td><td>${w.done}</td></tr>`)
    .join('');

  if (digest.period === 'DAILY') {
    return wrapHtml('Daily Digest', `
      <p style="color:#475569;">Operations snapshot for <b>${digest.date}</b>.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${[['New assignments', digest.newAssignments], ['Overdue tasks', digest.overdue], ['Under evaluation', digest.inEval], ['Revisions inserted', digest.revisions], ['Escalations', digest.escalations]]
          .map(([k, v]) => `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#475569;">${k}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a;">${v}</td></tr>`)
          .join('')}
      </table>`);
  }
  return wrapHtml('Weekly Digest', `
    <p style="color:#475569;">Team performance for the week starting <b>${digest.weekStart}</b>.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${[['Tasks completed', digest.completed], ['Avg quality score', digest.avgQuality], ['Active tasks', digest.active], ['Revisions', digest.revisions]]
        .map(([k, v]) => `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#475569;">${k}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a;">${v}</td></tr>`)
        .join('')}
    </table>
    <h3 style="color:#0f172a;margin:20px 0 8px;">Top performers</h3>
    <table style="width:100%;border-collapse:collapse;">${rows(digest.topPerformers)}</table>
    <h3 style="color:#0f172a;margin:20px 0 8px;">Needs attention</h3>
    <table style="width:100%;border-collapse:collapse;">${rows(digest.bottomPerformers)}</table>`);
}

export async function generateDigest(period) {
  const settings = await getSettings();
  const payload = period === 'DAILY' ? await buildDailyDigest() : await buildWeeklyDigest();

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true } });
  const records = [];
  for (const admin of admins) {
    const record = await prisma.digest.create({
      data: {
        adminId: admin.id,
        period,
        payload,
        deliveredAt: new Date(),
      },
    });
    records.push(record);
  }

  // Email delivery
  const recipients = env.smtp.digestEmail
    ? [env.smtp.digestEmail]
    : admins.filter((a) => a.emailNotifs).map((a) => a.email);
  const subject = period === 'DAILY' ? 'AgencyOps Daily Digest' : 'AgencyOps Weekly Digest';
  const html = renderDigestHtml(payload);
  let emailStatus = 'skipped';
  for (const to of recipients) {
    if (!to) continue;
    const res = await sendEmail(to, subject, { html, text: '' });
    emailStatus = res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed';
  }
  if (records.length) {
    await prisma.digest.updateMany({ where: { id: { in: records.map((r) => r.id) } }, data: { emailStatus } });
  }
  await logActivity(null, period === 'DAILY' ? 'daily_digest' : 'weekly_digest', 'digest');
  logger.info(`[digest] ${period} generated and delivered (${emailStatus}).`);
  return records;
}
