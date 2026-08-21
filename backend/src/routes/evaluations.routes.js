import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { logActivity, notify } from '../lib/utils.js';
import { evaluateSubmission } from '../services/ai/evaluation.js';
import { learnFromScoreOverride } from '../services/ai/learning.js';

const router = Router();

/** List evaluations (with filters). */
router.get('/', auth, async (req, res, next) => {
  try {
    const { taskId, workerId, verdict } = req.query;
    const where = {};
    if (taskId) where.submission = { taskId };
    if (workerId) where.submission = { workerId };
    if (verdict) where.verdict = verdict;

    const evals = await prisma.evaluation.findMany({
      where,
      include: {
        submission: {
          include: {
            task: true,
            worker: { include: { user: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
      take: 200,
    });
    res.json(evals);
  } catch (e) { next(e); }
});

/** Run (or re-run) evaluation for a submission. */
router.post('/:submissionId/run', auth, adminOnly, async (req, res, next) => {
  try {
    const evaluation = await evaluateSubmission(req.params.submissionId, { override: true });
    res.json(evaluation);
  } catch (e) { next(e); }
});

/** Admin override of an AI score. */
router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { qualityScore, verdict, critique, note } = req.body;
    const existing = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: { submission: true },
    });
    if (!existing) return res.status(404).json({ error: 'Evaluation not found' });

    const before = existing.qualityScore;
    const updated = await prisma.evaluation.update({
      where: { id: req.params.id },
      data: {
        qualityScore: qualityScore ?? existing.qualityScore,
        verdict: verdict || existing.verdict,
        critique: critique ?? existing.critique,
        overriddenBy: req.user.id,
        overriddenAt: new Date(),
        overrideNote: note || null,
      },
    });

    await learnFromScoreOverride({
      submissionId: existing.submissionId,
      before,
      after: updated.qualityScore,
      adminId: req.user.id,
    });
    await logActivity(req.user.id, 'evaluation.override', 'evaluation', req.params.id, { before, after: updated.qualityScore });

    // reflect verdict on the task
    if (updated.verdict === 'PASS') {
      await prisma.task.update({ where: { id: existing.submission.taskId }, data: { status: 'COMPLETED' } });
    } else {
      await prisma.task.update({ where: { id: existing.submission.taskId }, data: { status: 'IN_REVISION' } });
    }

    res.json(updated);
  } catch (e) { next(e); }
});

/** Worker grade appeal flow. */
router.post('/appeal/:evaluationId', auth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Appeal reason required' });

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.evaluationId },
      include: { submission: true },
    });
    if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });

    const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
    if (evaluation.submission.workerId !== worker.id) {
      return res.status(403).json({ error: 'You can only appeal your own evaluations' });
    }

    const existingAppeal = await prisma.appeal.findFirst({
      where: { taskId: evaluation.submission.taskId, workerId: worker.id, status: 'PENDING' },
    });
    if (existingAppeal) return res.status(409).json({ error: 'You already have a pending appeal on this task' });

    const appeal = await prisma.appeal.create({
      data: { taskId: evaluation.submission.taskId, workerId: worker.id, reason },
    });
    await notify(null, 'appeal', 'Grade appeal submitted',
      `${req.user.name} appealed an evaluation: ${reason.slice(0, 120)}`);
    res.status(201).json(appeal);
  } catch (e) { next(e); }
});

export default router;
