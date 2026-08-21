import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { getSettings, setSetting, notify } from '../lib/utils.js';
import { emitToUser } from './realtime.js';
import { sendEmail, wrapHtml, escapeHtml } from './email.js';
import { chat, parseJson } from './ai/client.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * OPERATIONS WATCHTOWER
 *
 * Continuously watches what employees are doing between conversations and
 * auto-triggers a brief in the owner's AI chat whenever there is something
 * worth acting on: overdue work, tasks that were never started, blocked or
 * stalled tasks, evaluations waiting too long, idle or overloaded team
 * members. It also posts a short progress note when tasks were completed.
 *
 * If the owner does NOT reply in-app to the latest watchtower alert within
 * `escalationHours`, the same brief is emailed to them so nothing gets lost.
 *
 * Flow (driven by cron, see jobs/cron.js):
 *   1. scanOperations()  → read live state into structured findings
 *   2. runWatchtowerScan()→ dedupe + compose AI brief + post to chat + notify
 *   3. checkWatchtowerEscalations() → email alerts that were never answered
 */

export const WATCHTOWER_TITLE = '⚡ Operations Watchtower';

const ACTIONABLE = ['overdue', 'idle', 'blocked', 'staleSubmitted', 'inRevision', 'idleWorkers', 'overCapacity'];

/** Read the live operation and reduce it to structured findings. */
export async function scanOperations(since) {
  const settings = await getSettings().catch(() => null);
  const idleStartHours = settings?.idleStartHours ?? 24;
  const nearDeadlineHours = 24;
  const staleSubmittedHours = 6;
  const now = new Date();
  const sinceBoundary = since || new Date(now.getTime() - 30 * 60 * 1000);

  const [activeAssignments, openPoolCount, recentConfirmed] = await Promise.all([
    prisma.assignment.findMany({
      where: { active: true },
      include: {
        task: { select: { id: true, title: true, status: true, deadline: true, updatedAt: true } },
        worker: { include: { user: { select: { name: true } } } },
      },
    }),
    prisma.task.count({
      where: { status: { notIn: ['COMPLETED', 'SUBMITTED'] }, assignments: { none: { active: true } } },
    }),
    prisma.assignment.findMany({
      where: { confirmedAt: { gte: sinceBoundary } },
      select: { taskId: true, confirmedAt: true, task: { select: { title: true } }, worker: { include: { user: { select: { name: true } } } } },
    }),
  ]);

  // Per-worker active load for capacity checks.
  const loadByWorker = new Map();
  for (const a of activeAssignments) {
    loadByWorker.set(a.workerId, (loadByWorker.get(a.workerId) || 0) + 1);
  }

  const overdue = [];
  const nearDeadline = [];
  const idle = [];
  const blocked = [];
  const staleSubmitted = [];
  const inRevision = [];

  for (const a of activeAssignments) {
    const t = a.task;
    const workerName = a.worker?.user?.name || 'Unassigned';
    const msLeft = t.deadline.getTime() - now.getTime();

    if (['PENDING', 'WORKING_ON_IT', 'IN_REVISION', 'BLOCKED'].includes(t.status)) {
      if (msLeft < 0) {
        overdue.push({ taskId: t.id, title: t.title, workerName, deadline: t.deadline });
      } else if (msLeft <= nearDeadlineHours * 3600000) {
        nearDeadline.push({ taskId: t.id, title: t.title, workerName, deadline: t.deadline });
      }
    }

    if (t.status === 'PENDING' && !a.startedAt && a.assignedAt.getTime() < now.getTime() - idleStartHours * 3600000) {
      idle.push({ taskId: t.id, title: t.title, workerName, assignedAt: a.assignedAt });
    }

    if (t.status === 'BLOCKED') {
      blocked.push({ taskId: t.id, title: t.title, workerName });
    }

    if (t.status === 'SUBMITTED' && t.updatedAt.getTime() < now.getTime() - staleSubmittedHours * 3600000) {
      staleSubmitted.push({ taskId: t.id, title: t.title, workerName, sinceHours: Math.round((now.getTime() - t.updatedAt.getTime()) / 3600000) });
    }

    if (t.status === 'IN_REVISION') {
      inRevision.push({ taskId: t.id, title: t.title, workerName });
    }
  }

  // Idle / overloaded team members.
  const workers = await prisma.worker.findMany({
    where: { user: { active: true }, availability: { not: 'ON_LEAVE' } },
    include: { user: { select: { name: true } } },
  });

  const idleWorkers = [];
  const overCapacity = [];
  for (const w of workers) {
    const load = loadByWorker.get(w.id) || 0;
    if (load === 0) idleWorkers.push({ workerId: w.id, name: w.user.name });
    else if (load > w.effectiveCapacity) {
      overCapacity.push({ workerId: w.id, name: w.user.name, load, cap: w.effectiveCapacity });
    }
  }

  const completed = recentConfirmed.map((a) => ({
    taskId: a.taskId,
    title: a.task.title,
    workerName: a.worker?.user?.name || 'Team member',
    confirmedAt: a.confirmedAt,
  }));

  return {
    scannedAt: now,
    overdue,
    nearDeadline,
    idle,
    blocked,
    staleSubmitted,
    inRevision,
    idleWorkers,
    overCapacity,
    openPool: openPoolCount,
    completed,
  };
}

/** Deterministic signature so we never spam the same state twice. */
function fingerprint(findings) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        overdue: findings.overdue.map((f) => f.taskId).sort(),
        idle: findings.idle.map((f) => f.taskId).sort(),
        blocked: findings.blocked.map((f) => f.taskId).sort(),
        staleSubmitted: findings.staleSubmitted.map((f) => f.taskId).sort(),
        inRevision: findings.inRevision.map((f) => f.taskId).sort(),
        idleWorkers: findings.idleWorkers.map((f) => f.workerId).sort(),
        overCapacity: findings.overCapacity.map((f) => f.workerId).sort(),
        openPool: findings.openPool,
        completed: findings.completed.map((f) => f.taskId).sort(),
      })
    )
    .digest('hex');
}

/** Count of actionable (needs-a-human) findings. */
export function actionableCount(findings) {
  return ACTIONABLE.reduce((sum, key) => sum + (Array.isArray(findings?.[key]) ? findings[key].length : 0), 0);
}

const WATCHTOWER_SYSTEM = `You are the operations watchtower of AgencyOps AI-COO. You monitor employees' progress and alert the owner about work that is stuck, overdue, or needs attention, plus healthy progress.

Return ONLY valid JSON:
{
  "reply": "a concise 2-4 sentence brief addressed to the agency owner. Lead with the most urgent item, name who is affected, and end with a concrete recommendation (reassign, read out priorities, reschedule, or plan next steps). Keep it natural and direct.",
  "recommendations": [
    { "type": "warning" | "danger" | "info" | "assign", "title": "short bold headline", "detail": "one actionable sentence grounded ONLY in the findings" }
  ]
}

Rules:
- Never invent tasks, employees, or numbers that are not in the FINDINGS.
- If there are no issues, say so briefly and note the healthy progress.
- 1-4 recommendations maximum; empty array if everything is fine.`;

/** Compose the brief via the AI, with a deterministic fallback. */
async function composeWatchtowerBrief(findings) {
  const payload = JSON.stringify({
    overdue: findings.overdue.slice(0, 10).map((f) => ({ task: f.title, worker: f.workerName, deadline: f.deadline.toISOString().slice(0, 10) })),
    notStarted: findings.idle.slice(0, 10).map((f) => ({ task: f.title, worker: f.workerName, assigned: f.assignedAt.toISOString().slice(0, 10) })),
    blocked: findings.blocked.slice(0, 10).map((f) => ({ task: f.title, worker: f.workerName })),
    waitingForEvaluation: findings.staleSubmitted.slice(0, 10).map((f) => ({ task: f.title, worker: f.workerName, sinceHours: f.sinceHours })),
    inRevision: findings.inRevision.slice(0, 10).map((f) => ({ task: f.title, worker: f.workerName })),
    idleWorkers: findings.idleWorkers.slice(0, 10).map((f) => f.name),
    overCapacity: findings.overCapacity.slice(0, 10).map((f) => ({ worker: f.name, load: f.load, cap: f.cap })),
    openUnassignedPool: findings.openPool,
    completedSinceLastCheck: findings.completed.slice(0, 10).map((f) => ({ task: f.title, worker: f.workerName })),
  });

  try {
    const content = await chat(
      'aiWatchtower',
      [
        { role: 'system', content: WATCHTOWER_SYSTEM },
        { role: 'user', content: `FINDINGS (live operations snapshot):\n${payload}\n\nProduce the JSON brief now.` },
      ],
      { temperature: 0.4, json: true, maxTokens: 700, attempts: 2, model: env.deepseekFlashModel }
    );
    const parsed = content ? parseJson(content) : null;
    if (parsed?.reply) {
      return {
        reply: String(parsed.reply).slice(0, 1200),
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
              .map((r) => ({
                type: ['warning', 'danger', 'info', 'assign'].includes(r.type) ? r.type : 'info',
                title: String(r.title || '').slice(0, 120),
                detail: String(r.detail || '').slice(0, 300),
              }))
              .filter((r) => r.title)
              .slice(0, 5)
          : [],
      };
    }
  } catch (e) {
    logger.warn(`[watchtower] AI compose failed: ${e.message}`);
  }
  return deterministicBrief(findings);
}

/** Hand-written fallback so the watchtower never goes silent. */
function deterministicBrief(findings) {
  const lines = [];
  const recs = [];
  const bold = (s) => `**${s}**`;

  if (findings.overdue.length) {
    const names = findings.overdue.slice(0, 3).map((f) => `"${f.title}" (${f.workerName})`).join(', ');
    lines.push(`${findings.overdue.length} task(s) are ${bold('overdue')}: ${names}${findings.overdue.length > 3 ? '…' : ''}`);
    recs.push({ type: 'danger', title: `${findings.overdue.length} overdue task(s)`, detail: 'Check why these missed their deadline and read out new expectations to the team.' });
  }
  if (findings.idle.length) {
    const names = findings.idle.slice(0, 3).map((f) => `"${f.title}" (${f.workerName})`).join(', ');
    lines.push(`${findings.idle.length} task(s) assigned but ${bold('never started')}: ${names}${findings.idle.length > 3 ? '…' : ''}`);
    recs.push({ type: 'warning', title: `${findings.idle.length} task(s) not started`, detail: 'Ask the assignee if they are blocked, or reassign to someone who can pick it up today.' });
  }
  if (findings.blocked.length) {
    const names = findings.blocked.slice(0, 3).map((f) => `"${f.title}" (${f.workerName})`).join(', ');
    lines.push(`${findings.blocked.length} task(s) are ${bold('blocked')}: ${names}${findings.blocked.length > 3 ? '…' : ''}`);
    recs.push({ type: 'danger', title: `${findings.blocked.length} blocked task(s)`, detail: 'Unblock these — check dependencies or the assignee, then plan the next step.' });
  }
  if (findings.staleSubmitted.length) {
    lines.push(`${findings.staleSubmitted.length} submission(s) ${bold('waiting for evaluation')} (${findings.staleSubmitted.slice(0, 2).map((f) => `"${f.title}" ${f.sinceHours}h`).join(', ')}${findings.staleSubmitted.length > 2 ? '…' : ''})`);
    recs.push({ type: 'info', title: 'Submissions waiting too long', detail: 'Review these quickly so the team gets feedback and the next task can start.' });
  }
  if (findings.inRevision.length) {
    lines.push(`${findings.inRevision.length} task(s) are ${bold('in revision')}.`);
    recs.push({ type: 'warning', title: 'Revisions in flight', detail: 'Follow up on revision loops so they close instead of dragging.' });
  }
  if (findings.idleWorkers.length) {
    const names = findings.idleWorkers.slice(0, 3).map((f) => f.name).join(', ');
    lines.push(`${bold(names)} ${findings.idleWorkers.length > 1 ? 'have' : 'has'} no active tasks${findings.openPool ? ` while ${findings.openPool} open task(s) sit in the pool` : ''}.`);
    recs.push({ type: 'assign', title: `${findings.idleWorkers.length} idle team member(s)`, detail: 'Assign them matching open work or plan their next project now.' });
  }
  if (findings.overCapacity.length) {
    const names = findings.overCapacity.slice(0, 2).map((f) => `${f.name} (${f.load}/${f.cap})`).join(', ');
    lines.push(`${bold(names)} ${findings.overCapacity.length > 1 ? 'are' : 'is'} over capacity.`);
    recs.push({ type: 'warning', title: 'Overloaded team member(s)', detail: 'Move some tasks off them so quality does not slip.' });
  }
  if (findings.completed.length) {
    lines.push(`${bold(findings.completed.length)} task(s) completed since the last check — ${findings.completed.slice(0, 3).map((f) => `"${f.title}" (${f.workerName})`).join(', ')}${findings.completed.length > 3 ? '…' : ''}.`);
  }
  if (findings.openPool && findings.overdue.length === 0 && findings.idle.length === 0) {
    lines.push(`${bold(findings.openPool)} open task(s) are still unassigned in the pool.`);
  }

  if (!lines.length) {
    return {
      reply: "Everything looks on track right now — no overdue, blocked, or stalled work, and nobody is sitting idle.",
      recommendations: [],
    };
  }

  const reply = `⚡ Operations check\n\n${lines.join('\n')}\n\nReply here and I'll act on any of these — or tell me how you want to plan next.`;
  return { reply, recommendations: recs.slice(0, 5) };
}

/** Find (or create) the owner's watchtower conversation. */
export async function ensureWatchtowerConversation(userId) {
  let conv = await prisma.conversation.findFirst({ where: { userId, title: WATCHTOWER_TITLE } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { userId, title: WATCHTOWER_TITLE } });
  }
  return conv;
}

/**
 * Main watchtower pass. Scans the operation and, when something notable has
 * changed, posts an auto-triggered brief into the owner's AI chat.
 */
export async function runWatchtowerScan({ force = false } = {}) {
  const settings = await getSettings().catch(() => null);
  const cfg = settings?.watchtower || {};
  if (!force && cfg.enabled === false) {
    return { skipped: 'disabled' };
  }

  const scanMinutes = Math.max(1, Number(cfg.scanMinutes) || 1);
  const lastScanRaw = settings?.watchtowerLastScanAt || settings?.lastScanAt;
  const lastScan = lastScanRaw && typeof lastScanRaw === 'string' ? Date.parse(lastScanRaw) : 0;
  const due = force || !lastScan || Date.now() - lastScan >= scanMinutes * 60000;
  if (!due) return { skipped: 'not_due_yet', nextDueInMinutes: Math.ceil((scanMinutes * 60000 - (Date.now() - lastScan)) / 60000) };

  const findings = await scanOperations(new Date(lastScan || Date.now() - 30 * 60000));
  await setSetting('watchtowerLastScanAt', new Date().toISOString()).catch(() => {});

  const sig = fingerprint(findings);
  const lastSig = settings?.watchtowerLastSignature;
  const lastAlertAtRaw = settings?.watchtowerLastAlertAt;
  const lastAlertAt = lastAlertAtRaw && typeof lastAlertAtRaw === 'string' ? Date.parse(lastAlertAtRaw) : 0;
  const minIntervalMs = (Number(cfg.minIntervalMinutes) || 10) * 60000;

  const actionable = actionableCount(findings);
  const hasProgress = findings.completed.length > 0;
  const minFindings = Math.max(0, Number(cfg.minFindings) || 1);

  // Nothing worth a message at all.
  if (actionable < minFindings && !hasProgress) {
    return { skipped: 'nothing_to_report', actionable, progress: findings.completed.length };
  }

  // Same state already reported recently — don't spam.
  if (!force && sig === lastSig && lastAlertAt && Date.now() - lastAlertAt < minIntervalMs) {
    return { skipped: 'no_change', minutesSinceAlert: Math.round((Date.now() - lastAlertAt) / 60000) };
  }

  const brief = await composeWatchtowerBrief(findings);
  const alertId = crypto.randomBytes(8).toString('hex');
  const summary = brief.reply.slice(0, 240);

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true } });
  for (const admin of admins) {
    try {
      const conv = await ensureWatchtowerConversation(admin.id);
      const msg = await prisma.conversationMessage.create({
        data: {
          conversationId: conv.id,
          role: 'assistant',
          content: brief.reply,
          meta: {
            watchtower: {
              alertId,
              sentAt: new Date().toISOString(),
              summary,
              findings: {
                overdue: findings.overdue.length,
                notStarted: findings.idle.length,
                blocked: findings.blocked.length,
                staleSubmitted: findings.staleSubmitted.length,
                idleWorkers: findings.idleWorkers.length,
                overCapacity: findings.overCapacity.length,
                openPool: findings.openPool,
                completed: findings.completed.length,
              },
            },
            recommendations: brief.recommendations,
            modelUsed: null,
            modelLabel: 'Auto',
          },
        },
      });
      await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });

      await notify(admin.id, 'watchtower', '⚡ New operations update', summary).catch(() => {});
      emitToUser(admin.id, 'watchtower', {
        conversationId: conv.id,
        conversationTitle: WATCHTOWER_TITLE,
        alertId,
        messageId: msg.id,
        summary,
        findings: findings.overdue.length + findings.idle.length,
      });
    } catch (e) {
      logger.warn(`[watchtower] posting failed for admin ${admin.id}: ${e.message}`);
    }
  }

  await setSetting('watchtowerLastSignature', sig).catch(() => {});
  await setSetting('watchtowerLastAlertAt', new Date().toISOString()).catch(() => {});
  logger.info(`[watchtower] alert posted (actionable=${actionable}, progress=${findings.completed.length})`);
  return { posted: true, alertId, actionable, progress: findings.completed.length, reply: summary };
}

/**
 * Escalation pass — email any watchtower alert the owner did not answer
 * in-app within `escalationHours`.
 */
export async function checkWatchtowerEscalations() {
  const settings = await getSettings().catch(() => null);
  const cfg = settings?.watchtower || {};
  if (cfg.enabled === false) return { skipped: 'disabled' };

  const escalationHours = Math.max(1, Number(cfg.escalationHours) || 3);
  const cutoff = new Date(Date.now() - escalationHours * 3600000);

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true } });
  let sent = 0;

  for (const admin of admins) {
    try {
      const conv = await ensureWatchtowerConversation(admin.id);

      const lastAlert = await prisma.conversationMessage.findFirst({
        where: { conversationId: conv.id, role: 'assistant', meta: { path: ['watchtower'], not: null } },
        orderBy: { createdAt: 'desc' },
      });
      if (!lastAlert) continue;

      const meta = lastAlert.meta || {};
      if (meta.watchtower?.emailSentAt) continue; // already emailed this alert

      // Owner replied in-app after the alert → considered answered.
      const replyAfter = await prisma.conversationMessage.findFirst({
        where: { conversationId: conv.id, role: 'user', createdAt: { gt: lastAlert.createdAt } },
      });
      if (replyAfter) {
        await prisma.conversationMessage.update({
          where: { id: lastAlert.id },
          data: { meta: { ...meta, watchtower: { ...meta.watchtower, respondedAt: new Date().toISOString() } } },
        }).catch(() => {});
        continue;
      }

      if (lastAlert.createdAt > cutoff) continue; // not old enough yet

      const to = String(cfg.emailTo || '').trim() || env.smtp.digestEmail || admin.email;
      if (!to) {
        logger.warn('[watchtower] no email recipient configured for escalation');
        continue;
      }

      const recsHtml = (meta.recommendations || [])
        .map((r) => `<li><b>${escapeHtml(r.title)}</b> — ${escapeHtml(r.detail || '')}</li>`)
        .join('');

      const html = wrapHtml(
        `⚡ Operations update — ${meta.watchtower?.findings?.overdue || 0} overdue, ${meta.watchtower?.findings?.notStarted || 0} not started`,
        `
        <p style="color:#475569;">This update was posted in your AI chat but hasn't been answered yet. Reply there or use the actions below.</p>
        <div style="background:#f8fafc;border-radius:10px;padding:16px;border:1px solid #e2e8f0;white-space:pre-wrap;">${escapeHtml(lastAlert.content)}</div>
        ${recsHtml ? `<h3 style="color:#0f172a;margin:16px 0 8px;">Recommended next steps</h3><ul>${recsHtml}</ul>` : ''}
        <p style="margin-top:16px;"><a href="${env.frontendUrl}/ai" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open the AI-COO chat</a></p>
        `
      );

      const result = await sendEmail(to, `⚡ AgencyOps — ${meta.watchtower?.findings?.overdue || 0} overdue task(s) need your attention`, {
        html,
        text: lastAlert.content,
      });

      if (result.ok || result.skipped) {
        await prisma.conversationMessage.update({
          where: { id: lastAlert.id },
          data: { meta: { ...meta, watchtower: { ...meta.watchtower, emailSentAt: new Date().toISOString() } } },
        }).catch(() => {});
        sent++;
        logger.info(`[watchtower] escalation email sent to ${to}`);
      }
    } catch (e) {
      logger.warn(`[watchtower] escalation failed for admin ${admin.id}: ${e.message}`);
    }
  }

  return { sent };
}

/** Status snapshot used by the API (admin-only). */
export async function getWatchtowerStatus() {
  const settings = await getSettings().catch(() => null);
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  let lastAlert = null;
  for (const admin of admins) {
    const conv = await prisma.conversation.findFirst({ where: { userId: admin.id, title: WATCHTOWER_TITLE } });
    if (!conv) continue;
    const msg = await prisma.conversationMessage.findFirst({
      where: { conversationId: conv.id, role: 'assistant', meta: { path: ['watchtower'], not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (msg && (!lastAlert || msg.createdAt > lastAlert.createdAt)) {
      lastAlert = { createdAt: msg.createdAt, summary: msg.meta?.watchtower?.summary || msg.content.slice(0, 160), findings: msg.meta?.watchtower?.findings || null, emailed: !!msg.meta?.watchtower?.emailSentAt };
    }
  }
  return {
    config: settings?.watchtower || {},
    lastScanAt: settings?.watchtowerLastScanAt || null,
    lastAlertAt: settings?.watchtowerLastAlertAt || null,
    lastAlert,
  };
}
