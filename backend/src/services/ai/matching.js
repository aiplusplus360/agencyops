import prisma from '../../lib/prisma.js';
import { getSettings, recordAiDecision } from '../../lib/utils.js';
import { notifyWorker } from '../workerNotify.js';

/**
 * Compute a compatibility score (0-100) between a task and a worker.
 * Factors: skill match, seniority fit, load (effective capacity), history.
 */
export async function computeCompatibility(task, worker) {
  const settings = await getSettings();
  const skillTags = task.skillTags || [];

  const workerSkills = await prisma.workerSkill.findMany({
    where: { workerId: worker.id },
    include: { skill: true },
  });
  const skillNames = workerSkills.map((ws) => ws.skill.name.toLowerCase());

  // 1. Skill match (40%)
  let skillScore = 0;
  if (skillTags.length) {
    const matched = skillTags.filter((t) => skillNames.includes(String(t).toLowerCase())).length;
    skillScore = (matched / skillTags.length) * 100;
  } else {
    skillScore = 70; // no explicit tags → neutral
  }

  // 2. Seniority fit (15%)
  const tiers = { JUNIOR: 1, MID: 2, SENIOR: 3, LEAD: 4 };
  const workerTier = tiers[worker.seniorityTier] || 2;
  const taskTier = Math.min(4, Math.max(1, Math.ceil(task.effortHours / 6)));
  let seniorityScore = 100 - Math.abs(workerTier - taskTier) * 20;

  // 3. Load / bandwidth (30%) — SUBMITTED tasks no longer occupy capacity
  const activeCount = await prisma.assignment.count({
    where: {
      workerId: worker.id,
      active: true,
      task: { status: { notIn: ['SUBMITTED', 'COMPLETED'] } },
    },
  });
  const effCap = worker.effectiveCapacity || worker.baseCapacity || 3;
  const loadRatio = activeCount / effCap;
  let loadScore;
  if (loadRatio >= 1) loadScore = 0; // at/over capacity → exclude
  else if (loadRatio >= 0.75) loadScore = 40;
  else if (loadRatio >= 0.5) loadScore = 70;
  else loadScore = 100;

  // 4. History (15%)
  const evals = await prisma.evaluation.findMany({
    where: { submission: { workerId: worker.id, taskId: task.id }, verdict: 'PASS' },
    select: { qualityScore: true },
    take: 20,
    orderBy: { evaluatedAt: 'desc' },
  });
  const historyScore = evals.length
    ? evals.reduce((s, e) => s + e.qualityScore, 0) / evals.length
    : 60;

  const total =
    skillScore * 0.4 + seniorityScore * 0.15 + loadScore * 0.3 + historyScore * 0.15;

  const rationale = {
    skill: Math.round(skillScore),
    seniority: Math.round(seniorityScore),
    load: Math.round(loadScore),
    history: Math.round(historyScore),
    activeTasks: activeCount,
    effectiveCapacity: effCap,
  };

  return { score: Math.max(0, Math.min(100, Math.round(total))), rationale };
}

export async function getEligibleWorkers(task, { respectAvailability = true } = {}) {
  const workers = await prisma.worker.findMany({
    where: {
      user: { active: true },
      ...(respectAvailability
        ? { availability: { notIn: ['ON_LEAVE'] } }
        : {}),
    },
    include: { user: true, skills: { include: { skill: true } } },
  });
  return workers;
}

/**
 * Suggest a ranked shortlist of workers for a task.
 * Excludes overloaded (at/over effective capacity) and on-leave workers by default.
 */
export async function suggestForTask(task, { includeOverloaded = false } = {}) {
  const workers = await getEligibleWorkers(task);
  const scored = [];
  for (const w of workers) {
    const { score, rationale } = await computeCompatibility(task, w);
    const activeCount = rationale.activeTasks;
    const effCap = w.effectiveCapacity || w.baseCapacity || 3;
    const overloaded = activeCount >= effCap;
    if (overloaded && !includeOverloaded) continue;
    scored.push({
      workerId: w.id,
      worker: { id: w.id, name: w.user.name, email: w.user.email, avatar: w.user.avatar },
      seniorityTier: w.seniorityTier,
      score,
      rationale,
      overloaded,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Batch suggest: for a list of tasks, return best-match shortlist per task.
 */
export async function suggestBatch(taskIds, adminUserId) {
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, status: 'PENDING' },
    include: { assignments: true },
  });
  const results = [];
  for (const task of tasks) {
    const shortlist = await suggestForTask(task);
    const best = shortlist[0] || null;
    results.push({
      taskId: task.id,
      taskTitle: task.title,
      best,
      shortlist: shortlist.slice(0, 3),
      assigned: task.assignments.some((a) => a.active),
    });
    await recordAiDecision('ASSIGNMENT', { taskId: task.id, best: best?.workerId }, {
      entityId: task.id,
      rationale: `Suggested ${shortlist.length} worker(s) ranked by compatibility.`,
      snapshot: { shortlist: shortlist.map((s) => ({ workerId: s.workerId, score: s.score })) },
      createdBy: adminUserId,
    });
  }
  return results;
}

/**
 * Assign a single task to a worker.
 */
export async function assignTask(taskId, workerId, { assignedBy = 'AI', rationale = null, adminUserId = null } = {}) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!task || !worker) throw Object.assign(new Error('Task or worker not found'), { status: 404 });

  const { score } = await computeCompatibility(task, worker);

  const assignment = await prisma.assignment.create({
    data: {
      taskId,
      workerId,
      compatibilityScore: score,
      rationale: rationale || `AI-selected best match (${score}/100).`,
      assignedBy,
    },
  });

  await prisma.taskActivity.create({
    data: {
      taskId,
      workerId,
      type: 'assigned',
      note: `Assigned to ${worker.userId} by ${assignedBy} (score ${score}).`,
    },
  });

  const notif = await notifyWorker({
    userId: worker.userId,
    type: 'new_assignment',
    title: 'New task assigned',
    body: `${task.title}`,
    socketEvent: 'queue_update',
  });

  await recordAiDecision('ASSIGNMENT', { taskId, workerId, score }, {
    entityId: taskId,
    rationale: rationale || `Compatibility score ${score}.`,
    createdBy: adminUserId,
  });

  return { assignment, notification: notif, score };
}
