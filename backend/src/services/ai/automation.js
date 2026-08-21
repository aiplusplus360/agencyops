import prisma from '../../lib/prisma.js';
import { getSettings, setSetting, recordAiDecision } from '../../lib/utils.js';
import { emitToAdmins } from '../realtime.js';
import { logger } from '../../lib/logger.js';

/**
 * PROACTIVE OPERATIONS AUTOMATION
 *
 * The AI-COO watches the operation between messages and keeps the owner
 * informed without being asked:
 *
 *  1. COMPLETION WATCHER — when any employee's task is confirmed/completed,
 *     the admin gets an in-app notification ("Ayesha completed 'Landing page'").
 *  2. IDLE PREDICTION — each run, workers whose active workload is about to
 *     hit zero (or is already zero while matching open work exists) are
 *     flagged to the admin so nobody sits idle.
 *
 * Both are driven by cron (see jobs/cron.js). Deduplication is persisted in
 * the Setting table so we never re-notify about the same completion window or
 * hammer the admin with the same idle state.
 */

/** Create an in-app notification for every active admin + live socket push. */
export async function notifyAllAdmins(type, title, body = null, socketEvent = 'notification') {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true } });
  const records = [];
  for (const admin of admins) {
    try {
      const record = await prisma.notification.create({
        data: { userId: admin.id, type, title, body },
      });
      records.push(record);
      emitToAdmins(socketEvent, record);
    } catch (e) {
      logger.warn(`[automation] notifyAllAdmins failed for ${admin.id}:`, e.message);
    }
  }
  return records;
}

/**
 * Check for tasks that were confirmed/completed since the last check and
 * notify the admin, grouped by worker. Runs on a short cron cadence.
 */
export async function watchCompletedTasks() {
  const settings = await getSettings();
  const key = 'automation.lastCompletionCheck';
  const lastCheckRaw = settings[key];
  let lastCheck = lastCheckRaw && typeof lastCheckRaw === 'string' && !Number.isNaN(Date.parse(lastCheckRaw))
    ? new Date(lastCheckRaw)
    : new Date(Date.now() - 30 * 60 * 1000); // first run: look back 30 min
  const now = new Date();

  const confirmed = await prisma.assignment.findMany({
    where: {
      confirmedAt: { gte: lastCheck, lte: now },
      active: false,
    },
    include: {
      task: { select: { id: true, title: true } },
      worker: { include: { user: { select: { name: true } } } },
    },
    orderBy: { confirmedAt: 'asc' },
  });

  if (confirmed.length) {
    // Group by worker for readable notifications.
    const byWorker = new Map();
    for (const a of confirmed) {
      const name = a.worker?.user?.name || 'A team member';
      const entry = byWorker.get(a.workerId) || { name, tasks: [] };
      entry.tasks.push(a.task.title);
      byWorker.set(a.workerId, entry);
    }

    for (const [workerId, entry] of byWorker) {
      const titles = entry.tasks.slice(0, 3);
      const more = entry.tasks.length - titles.length;
      const body = `${titles.map((t) => `"${t}"`).join(', ')}${more > 0 ? ` +${more} more` : ''}`;
      await notifyAllAdmins(
        'task_completed',
        `✅ ${entry.name} completed ${entry.tasks.length} task${entry.tasks.length > 1 ? 's' : ''}`,
        body
      );
    }

    await recordAiDecision('EVALUATION', {
      completed: confirmed.map((a) => ({ taskId: a.taskId, workerId: a.workerId })),
    }, {
      entityId: null,
      rationale: 'Completion watcher detected newly completed tasks and notified the admin.',
    }).catch(() => {});
  }

  // Persist the pointer so the next run only sees fresh completions.
  await setSetting(key, now.toISOString()).catch(() => {});
  logger.info(`[automation] completion watcher: ${confirmed.length} confirmed task(s) since ${lastCheck.toISOString()}`);
  return confirmed.length;
}

/**
 * Predict which workers will sit idle in the near future.
 *
 * Heuristic: a worker is "predicted idle" when their active workload (tasks
 * not submitted/completed) will hit zero within the horizon, OR they already
 * have zero active tasks while matching open work exists in the pool. We only
 * notify the admin when a worker's idle state CHANGES, so it's not spammy.
 */
export async function predictIdleWorkers({ horizonDays = 3 } = {}) {
  const settings = await getSettings();
  const stateKey = 'automation.idlePredicted'; // map workerId -> { since }
  const state = settings[stateKey] && typeof settings[stateKey] === 'object' ? settings[stateKey] : {};

  const horizon = new Date(Date.now() + horizonDays * 24 * 3600 * 1000);

  const [workers, openPool] = await Promise.all([
    prisma.worker.findMany({
      where: { user: { active: true }, availability: { not: 'ON_LEAVE' } },
      include: {
        user: { select: { name: true } },
        skills: { include: { skill: true } },
        assignments: {
          where: { active: true, task: { status: { notIn: ['SUBMITTED', 'COMPLETED'] } } },
          include: { task: { select: { deadline: true } } },
        },
      },
    }),
    prisma.task.findMany({
      where: { assignments: { none: { active: true } }, status: { not: 'COMPLETED' } },
      select: { skillTags: true, deadline: true, priority: true },
    }),
  ]);

  const newState = {};
  const alerts = [];

  for (const w of workers) {
    const activeTasks = w.assignments.length;
    // Tasks still in progress (not submitted/completed) that will be done
    // within the horizon → the queue drains around/after those deadlines.
    const draining = w.assignments.filter((a) => a.task.deadline <= horizon).length;
    const workloadEnds = activeTasks > 0 && activeTasks - draining <= 0;

    // Matching open work available in the pool (any skill overlap).
    const wSkills = new Set(w.skills.map((s) => s.skill.name.toLowerCase()));
    const matchingPool = openPool.filter((t) => {
      const tags = (t.skillTags || []).map((s) => String(s).toLowerCase());
      return tags.length === 0 || tags.some((t2) => wSkills.has(t2));
    }).length;

    const predictedIdle = activeTasks === 0 || workloadEnds;
    if (!predictedIdle) continue;

    const isNew = !state[w.id];
    const idleNow = activeTasks === 0;
    newState[w.id] = { since: isNew ? new Date().toISOString() : state[w.id].since };

    // Only alert on state changes (new idle or back-to-idle after being busy),
    // and don't nag when there is literally nothing else the owner could do
    // except wait for the pool to fill.
    if (!isNew) continue;
    if (idleNow && matchingPool === 0 && openPool.length === 0) continue;

    if (idleNow) {
      alerts.push({
        type: 'info',
        workerId: w.id,
        name: w.user.name,
        title: `🆓 ${w.user.name} is idle right now`,
        body: matchingPool > 0
          ? `${matchingPool} matching open task${matchingPool > 1 ? 's' : ''} waiting in the pool — assign something to keep them busy.`
          : 'No active tasks right now. Feed them work when the pool fills.',
      });
    } else {
      const lastDeadline = w.assignments
        .filter((a) => a.task.deadline <= horizon)
        .reduce((max, a) => (a.task.deadline > max ? a.task.deadline : max), new Date(0));
      alerts.push({
        type: 'warning',
        workerId: w.id,
        name: w.user.name,
        title: `⏳ ${w.user.name} will run out of work soon`,
        body: `Queue drains by ${lastDeadline.toISOString().slice(0, 10)} — plan their next assignment so they don't sit idle.`,
      });
    }
  }

  if (alerts.length) {
    for (const a of alerts) {
      await notifyAllAdmins('idle_prediction', a.title, a.body);
    }
    await recordAiDecision('FORECAST', {
      idlePredicted: alerts.map((a) => ({ workerId: a.workerId, type: a.type })),
    }, {
      entityId: null,
      rationale: 'Idle prediction flagged workers whose workload is about to drain.',
    }).catch(() => {});
  }

  await setSetting(stateKey, newState).catch(() => {});
  logger.info(`[automation] idle prediction: ${alerts.length} worker(s) newly flagged (${Object.keys(newState).length} currently idle-predicted)`);
  return alerts;
}
