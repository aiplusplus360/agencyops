import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { recordEstimationAccuracy } from '../services/ai/estimation.js';

const router = Router();

/** Most useful / least useful ranking (per period). */
router.get('/ranking', auth, adminOnly, async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const since = new Date(Date.now() - (period === 'week' ? 7 : period === 'quarter' ? 90 : 30) * 24 * 3600 * 1000);

    const workers = await prisma.worker.findMany({ include: { user: { select: { id: true, name: true } } } });
    const ranked = [];
    for (const w of workers) {
      const evals = await prisma.evaluation.findMany({ where: { submission: { workerId: w.id }, evaluatedAt: { gte: since } } });
      const confirmed = await prisma.task.count({
        where: {
          status: 'COMPLETED',
          assignments: { some: { workerId: w.id, confirmedAt: { gte: since } } },
        },
      });
      const avg = evals.length ? evals.reduce((s, e) => s + e.qualityScore, 0) / evals.length : null;
      const onTime = evals.length ? evals.filter((e) => e.deadlineScore >= 60).length / evals.length : null;
      const score = avg !== null
        ? Math.round(avg * 0.5 + (onTime || 0) * 100 * 0.25 + Math.min(100, confirmed * 10) * 0.25)
        : 0;
      ranked.push({ workerId: w.id, name: w.user.name, score, completed: confirmed, avgQuality: avg ? Math.round(avg) : null, onTimeRate: onTime !== null ? Math.round(onTime * 100) : null });
    }
    ranked.sort((a, b) => b.score - a.score);
    const total = ranked.length;
    res.json({
      period,
      mostUseful: ranked.slice(0, Math.max(1, Math.ceil(total / 3))),
      leastUseful: ranked.slice(-Math.max(1, Math.ceil(total / 3))).reverse(),
      fullRanking: ranked,
    });
  } catch (e) { next(e); }
});

/** Monthly task report: per task × month × DEP status per employee. */
router.get('/monthly-report', auth, adminOnly, async (req, res, next) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const assignments = await prisma.assignment.findMany({
      where: { assignedAt: { gte: start, lt: end } },
      include: {
        task: true,
        worker: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { assignedAt: 'asc' },
    });

    const report = assignments.map((a) => ({
      workerName: a.worker.user.name,
      taskTitle: a.task.title,
      month: `${year}-${String(month).padStart(2, '0')}`,
      status: a.task.status,
      deployed: a.task.status === 'COMPLETED',
      score: null,
    }));
    res.json({ year, month, rows: report });
  } catch (e) { next(e); }
});

/** Estimation accuracy for all workers. */
router.get('/estimation', auth, adminOnly, async (req, res, next) => {
  try {
    const workers = await prisma.worker.findMany({ include: { user: { select: { name: true } } } });
    const rows = [];
    for (const w of workers) {
      const est = await recordEstimationAccuracy(w.id);
      rows.push({ workerId: w.id, name: w.user.name, ...est });
    }
    res.json(rows);
  } catch (e) { next(e); }
});

/** Per-employee full log timeline (drill-down data). */
router.get('/employee/:workerId/timeline', auth, adminOnly, async (req, res, next) => {
  try {
    const activities = await prisma.taskActivity.findMany({
      where: { workerId: req.params.workerId },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(activities);
  } catch (e) { next(e); }
});

export default router;
