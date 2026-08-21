import { chat, parseJson } from './client.js';
import prisma from '../../lib/prisma.js';
import { getSettings, recordAiDecision, logTaskActivity, notify } from '../../lib/utils.js';
import { assignTask } from './matching.js';
import { notifyWorker } from '../workerNotify.js';
import { emitToAdmins } from '../realtime.js';

const EVAL_SYSTEM_PROMPT = `You are the objective AI evaluation engine of a marketing agency operations system. Grade a team member's task submission with the strictness of an agency account director.

You grade three weighted dimensions:
1. Intent Matching (40%) — did the deliverable serve the campaign objective and the task's true purpose?
2. Completeness (40%) — is it client-ready: were all acceptance criteria met, is it on-brand, proofed and complete?
3. Deadline Adherence (20%) — was it submitted on time relative to the strict campaign deadline?

Return ONLY JSON:
{
  "intentScore": 0-100,
  "completenessScore": 0-100,
  "deadlineScore": 0-100,
  "critique": "specific, actionable feedback for the worker"
}
Be strict and fair. A vague, half-finished or off-brand submission gets low completeness. Missing the deadline reduces deadlineScore proportionally.`;

/**
 * Run the AI evaluation for a submission. Falls back to a deterministic
 * heuristic grade when no AI key is configured (development mode).
 */
export async function evaluateSubmission(submissionId, { override = false } = {}) {
  const settings = await getSettings();
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { task: true, worker: { include: { user: true } } },
  });
  if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });

  const task = submission.task;
  const weights = settings.rubricWeights;

  // Deadline adherence — computed deterministically regardless of AI.
  const totalMs = task.deadline.getTime() - submission.submittedAt.getTime();
  // estimate start as assignment time
  const assignment = await prisma.assignment.findFirst({
    where: { taskId: task.id, workerId: submission.workerId, active: true },
  });
  const startedAt = assignment?.startedAt || task.createdAt;
  const availableMs = task.deadline.getTime() - startedAt.getTime();
  let deadlineScore = 100;
  if (availableMs > 0) {
    deadlineScore = Math.max(0, Math.min(100, Math.round((totalMs / availableMs) * 100)));
  }

  const existing = await prisma.evaluation.findFirst({
    where: { submissionId, overriddenAt: null },
  });
  if (existing && !override) return existing;

  const content = await chat('evaluation', [
    { role: 'system', content: EVAL_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `TASK: ${task.title}\nDESCRIPTION: ${task.description || ''}\nACCEPTANCE CRITERIA: ${JSON.stringify(task.acceptanceCriteria || [])}`,
        `DEADLINE: ${task.deadline.toISOString()}`,
        `WORKER SUBMISSION:\n${submission.text}`,
        submission.logs ? `LOGS:\n${submission.logs.slice(0, 3000)}` : '',
        submission.outputLinks ? `OUTPUT LINKS: ${JSON.stringify(submission.outputLinks)}` : '',
      ].join('\n'),
    },
  ], { temperature: 0.2, json: true }).catch(() => null);

  let intentScore, completenessScore;
  let critique = '';

  if (content) {
    const parsed = parseJson(content);
    if (parsed) {
      intentScore = clamp(parsed.intentScore);
      completenessScore = clamp(parsed.completenessScore);
      critique = parsed.critique || '';
    }
  }
  if (intentScore === undefined) {
    // Deterministic fallback: token-coverage of acceptance criteria as proxy
    const ac = (task.acceptanceCriteria || []).map((a) => String(a).toLowerCase());
    const text = `${submission.text} ${submission.logs || ''}`.toLowerCase();
    const significant = (s) => s.split(/\W+/).filter((w) => w.length > 3);
    const covered = ac.filter((c) => {
      const words = significant(c);
      if (!words.length) return false;
      const hits = words.filter((w) => text.includes(w)).length;
      return hits / words.length >= 0.5;
    }).length;
    completenessScore = ac.length ? Math.round((covered / ac.length) * 100) : 60;
    intentScore = submission.text.length > 120 ? 80 : 50;
    critique = 'Heuristic evaluation (no AI key configured). Submission completeness judged by keyword coverage of acceptance criteria.';
  }

  const qualityScore = Math.round(
    intentScore * weights.intent + completenessScore * weights.completeness + deadlineScore * weights.deadline
  );
  const threshold = task.qualityThreshold || settings.qualityThreshold;
  const verdict = qualityScore >= threshold ? 'PASS' : 'REVISE';

  const evaluation = await prisma.evaluation.create({
    data: {
      submissionId,
      intentScore,
      completenessScore,
      deadlineScore,
      qualityScore,
      verdict,
      critique,
    },
  });

  await recordAiDecision('EVALUATION', {
    submissionId,
    scores: { intentScore, completenessScore, deadlineScore, qualityScore },
    verdict,
  }, {
    entityId: task.id,
    rationale: `Rubric ${JSON.stringify(weights)}; threshold ${threshold}.`,
    snapshot: { taskId: task.id, workerId: submission.workerId },
  });

  await logTaskActivity(task.id, 'evaluated', submission.workerId,
    `Scored ${qualityScore}/100 (${verdict}).`);

  await notifyWorker({
    userId: submission.worker.userId,
    type: 'evaluation_verdict',
    title: verdict === 'PASS' ? 'Task approved' : 'Task needs revision',
    body: `${task.title} — ${verdict === 'PASS' ? 'approved' : 'needs revision'} (${qualityScore}/100).`,
    socketEvent: 'queue_update',
  });

  // Self-healing
  if (verdict === 'PASS') {
    await handlePass(task, submission, qualityScore);
  } else {
    await handleRevise(task, submission, evaluation);
  }

  return evaluation;
}

function clamp(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 60;
  return Math.max(0, Math.min(100, Math.round(v)));
}

async function handlePass(task, submission, evaluation) {
  const assignment = await prisma.assignment.findFirst({
    where: { taskId: task.id, workerId: submission.workerId, active: true },
  });
  if (assignment) {
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { confirmedAt: new Date(), active: false },
    });
  }
  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'COMPLETED' },
  });
  await logTaskActivity(task.id, 'confirmed', submission.workerId, 'Task passed evaluation.');
  emitToAdmins('team_update', { type: 'task_confirmed', taskId: task.id, title: task.title });
  notify(null, 'task_confirmed', 'Task confirmed', `${task.title} passed evaluation.`);

  // Unlock next sequential dependency into the unassigned pool.
  const dependents = await prisma.taskDependency.findMany({
    where: { dependencyId: task.id },
  });
  for (const dep of dependents) {
    const blocking = await prisma.taskDependency.findMany({
      where: { dependentId: dep.dependentId },
      include: { dependency: true },
    });
    const allPassed = blocking.every((b) => b.dependency.status === 'COMPLETED');
    if (allPassed) {
      const unlocked = await prisma.task.findUnique({ where: { id: dep.dependentId } });
      if (unlocked && unlocked.status === 'PENDING') {
        await logTaskActivity(unlocked.id, 'assigned', null, 'Dependency satisfied — task unlocked into allocation pool.');
      }
    }
  }
}

async function handleRevise(task, submission, evaluation) {
  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'IN_REVISION' },
  });
  await prisma.revision.create({
    data: {
      taskId: task.id,
      workerId: submission.workerId,
      reason: `Score ${Math.round(evaluation.qualityScore)} below threshold (${task.qualityThreshold}).`,
      critiqueRef: evaluation.id,
    },
  });
  await logTaskActivity(task.id, 'status_change', submission.workerId, 'Task moved to IN_REVISION (failed threshold).');
  await notifyWorker({
    userId: submission.worker.userId,
    type: 'revision_required',
    title: 'Task needs revision',
    body: `${task.title} scored below threshold.`,
    socketEvent: 'queue_update',
  });
}
