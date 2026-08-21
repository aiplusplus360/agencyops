import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { getSettings, notify, logTaskActivity } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { evaluateSubmission } from '../services/ai/evaluation.js';
import { refillAllWorkers } from '../services/ai/autoRefill.js';
import { recomputeAllScaling, forecastAllWorkers } from '../services/ai/scaling.js';
import { instantiateDueTemplates } from '../services/ai/templates.js';
import { generateDigest } from '../services/digest.js';
import { watchCompletedTasks, predictIdleWorkers } from '../services/ai/automation.js';
import { notifyWorker } from '../services/workerNotify.js';
import { emitToAdmins } from '../services/realtime.js';
import { pollInbox } from '../services/emailBridge.js';
import { runWatchtowerScan, checkWatchtowerEscalations } from '../services/watchtower.js';

let jobs = [];

// In-flight guard: node-cron fires on schedule even if the previous run is
// still executing. Long-running jobs (e.g. watchtower's AI compose can take
// ~60-120s) would otherwise pile up every tick, exhausting the DB pool and
// freezing the event loop. If a job is still running, skip this tick.
const running = new Set();

async function run(name, fn) {
  if (running.has(name)) {
    logger.warn(`[cron] ${name} skipped — previous run still in progress`);
    return;
  }
  running.add(name);
  try {
    await fn();
    logger.info(`[cron] ${name} completed.`);
  } catch (e) {
    logger.error(`[cron] ${name} failed:`, e.message);
  } finally {
    running.delete(name);
  }
}

/** Deadline reminders + overdue escalation. */
async function deadlineWatchdog() {
  const settings = await getSettings();
  const { remind, overdueWindowHours } = settings.escalation;
  const now = Date.now();

  const active = await prisma.assignment.findMany({
    where: { active: true },
    include: { task: true, worker: { include: { user: true } } },
  });

  for (const a of active) {
    const hoursLeft = (a.task.deadline.getTime() - now) / 3600000;
    if (hoursLeft > 0) {
      for (const h of remind) {
        if (Math.abs(hoursLeft - h) < 0.5) {
          await notifyWorker({
            userId: a.worker.userId,
            type: 'deadline_reminder',
            title: 'Deadline approaching',
            body: `${a.task.title} — ${h}h remaining.`,
          });
        }
      }
    } else if (hoursLeft < 0) {
      // overdue
      await notifyWorker({
        userId: a.worker.userId,
        type: 'task_overdue',
        title: 'Task overdue',
        body: `${a.task.title} is overdue.`,
      });
      const overdueMs = -hoursLeft * 3600000;
      if (overdueMs >= overdueWindowHours * 3600000) {
        await logTaskActivity(a.task.id, 'escalated', a.workerId, 'Overdue window exceeded — escalated.');
        await notify(null, 'escalation', 'Overdue task escalated',
          `${a.task.title} exceeded the overdue window.`);
        emitToAdmins('alert', {
          type: 'escalation',
          taskId: a.task.id,
          title: a.task.title,
          workerName: a.worker.user.name,
        });
      }
    }
  }
}

/** Idle start watchdog — task untouched for N hours. */
async function idleWatchdog() {
  const settings = await getSettings();
  const threshold = settings.idleStartHours * 3600000;
  const cutoff = new Date(Date.now() - threshold);

  const stale = await prisma.assignment.findMany({
    where: { active: true, startedAt: null, assignedAt: { lt: cutoff } },
    include: { task: true, worker: { include: { user: true } } },
  });

  for (const a of stale) {
    await notify(null, 'idle_task', 'Task not started',
      `${a.task.title} assigned to ${a.worker.user.name} has not been started for ${settings.idleStartHours}h.`);
    emitToAdmins('alert', {
      type: 'idle_task',
      taskId: a.task.id,
      title: a.task.title,
      workerName: a.worker.user.name,
    });
  }
}

/** Evaluate pending submissions. */
async function evaluationQueue() {
  const pending = await prisma.submission.findMany({
    where: { evaluations: { none: { overriddenAt: null } } },
    include: { evaluations: true },
    orderBy: { submittedAt: 'asc' },
    take: 10,
  });
  for (const s of pending) {
    const hasEval = s.evaluations.length > 0;
    if (hasEval) continue;
    await run('evaluation', () => evaluateSubmission(s.id));
  }
}

async function dailyJobs() {
  await run('scaling', recomputeAllScaling);
  await run('forecast', () => forecastAllWorkers(7));
  await run('templates', instantiateDueTemplates);
  await run('autoRefill', refillAllWorkers);
  await run('digest:daily', () => generateDigest('DAILY'));
}

async function weeklyJobs() {
  await run('digest:weekly', () => generateDigest('WEEKLY'));
}

export function startCron() {
  // Run every 15 minutes: deadline + idle watchdogs
  jobs.push(cron.schedule('*/15 * * * *', () => run('deadline', deadlineWatchdog)));
  jobs.push(cron.schedule('*/15 * * * *', () => run('idle', idleWatchdog)));
  // Evaluation queue every 5 minutes
  jobs.push(cron.schedule('*/5 * * * *', () => run('evaluationQueue', evaluationQueue)));
  // Proactive automation: detect newly completed tasks + predict idle workers.
  // Completion watcher every 10 min (matches the eval cadence), idle forecast
  // every 30 min so the owner hears about a draining queue promptly.
  jobs.push(cron.schedule('*/10 * * * *', () => run('completionWatcher', watchCompletedTasks)));
  jobs.push(cron.schedule('*/30 * * * *', () => run('idlePrediction', () => predictIdleWorkers({ horizonDays: 3 }))));
  // Auto-refill + scaling + forecast every 30 minutes
  jobs.push(cron.schedule('*/30 * * * *', () => run('refill', refillAllWorkers)));
  jobs.push(cron.schedule('0 */4 * * *', () => run('scaling', recomputeAllScaling)));
  jobs.push(cron.schedule('0 */6 * * *', () => run('forecast', () => forecastAllWorkers(7))));
  // Templates daily at 00:05
  jobs.push(cron.schedule('5 0 * * *', () => run('templates', instantiateDueTemplates)));
  // Email bridge: check the owner's inbox every 2 minutes and let the AI
  // answer their emails, keeping one continuous conversation.
  jobs.push(cron.schedule('*/2 * * * *', () => run('emailBridge', pollInbox)));
  // Operations Watchtower: continuous progress checking. Scan every minute
  // (internal settings gate how often an alert is actually posted — dedup
  // + minInterval prevent spam), and check for unanswered alerts that need
  // an escalation email every minute too so a decision is always fresh.
  jobs.push(cron.schedule('* * * * *', () => run('watchtowerScan', runWatchtowerScan)));
  jobs.push(cron.schedule('* * * * *', () => run('watchtowerEscalation', checkWatchtowerEscalations)));
  // Daily digest at 08:00, weekly digest Monday 08:00
  jobs.push(cron.schedule('0 8 * * *', () => run('digest:daily', dailyJobs)));
  jobs.push(cron.schedule('0 8 * * 1', () => run('digest:weekly', weeklyJobs)));

  logger.info('[cron] Scheduler started.');
}

export function stopCron() {
  jobs.forEach((j) => j.stop());
  jobs = [];
}
