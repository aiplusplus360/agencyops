import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { forecastAllWorkers } from '../services/ai/scaling.js';

const router = Router();

/** Team rankings by quality, speed, workload. */
router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    const since = new Date(Date.now() - (range === '7d' ? 7 : range === '90d' ? 90 : 30) * 24 * 3600 * 1000);

    const workers = await prisma.worker.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        assignments: { where: { active: true } },
        skills: { include: { skill: true } },
      },
    });

    const rows = [];
    for (const w of workers) {
      const evals = await prisma.evaluation.findMany({
        where: { submission: { workerId: w.id }, evaluatedAt: { gte: since } },
      });
      const confirmed = await prisma.assignment.findMany({
        where: { workerId: w.id, confirmedAt: { gte: since } },
        include: { task: true },
      });

      const avgQuality = evals.length
        ? evals.reduce((s, e) => s + e.qualityScore, 0) / evals.length
        : 0;
      const onTime = evals.filter((e) => e.deadlineScore >= 60).length;
      const onTimeRate = evals.length ? (onTime / evals.length) * 100 : 0;

      // avg hours to completion
      const durations = confirmed
        .filter((a) => a.startedAt && a.confirmedAt)
        .map((a) => (a.confirmedAt - a.startedAt) / 3600000);
      const avgSpeed = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;

      const completionRate = confirmed.length; // tasks confirmed in period

      rows.push({
        workerId: w.id,
        name: w.user.name,
        email: w.user.email,
        avatar: w.user.avatar,
        seniorityTier: w.seniorityTier,
        avgQuality: Math.round(avgQuality),
        onTimeRate: Math.round(onTimeRate),
        avgSpeedHours: avgSpeed ? Math.round(avgSpeed) : null,
        completed: completionRate,
        activeWorkload: w.assignments.length,
        effectiveCapacity: w.effectiveCapacity,
        skills: w.skills.map((s) => s.skill.name),
        composite: Math.round(
          avgQuality * 0.5 +
          onTimeRate * 0.25 +
          (avgSpeed ? Math.max(0, 100 - avgSpeed / 2) : 50) * 0.15 +
          Math.min(100, completionRate * 10) * 0.1
        ),
      });
    }

    rows.sort((a, b) => b.composite - a.composite);
    res.json(rows);
  } catch (e) { next(e); }
});

/** Quality-score trend series for charts. */
router.get('/trends', auth, adminOnly, async (req, res, next) => {
  try {
    const { workerId, days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const where = { evaluatedAt: { gte: since } };
    if (workerId) where.submission = { workerId };

    const evals = await prisma.evaluation.findMany({
      where,
      include: { submission: true },
      orderBy: { evaluatedAt: 'asc' },
    });

    // bucket by day
    const buckets = {};
    for (const e of evals) {
      const day = e.evaluatedAt.toISOString().slice(0, 10);
      if (!buckets[day]) buckets[day] = [];
      buckets[day].push(e.qualityScore);
    }
    const series = Object.entries(buckets).map(([day, scores]) => ({
      date: day,
      avgQuality: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length),
      count: scores.length,
    }));
    res.json(series);
  } catch (e) { next(e); }
});

/** Predictive workload forecast for all workers. */
router.get('/forecast', auth, adminOnly, async (req, res, next) => {
  try {
    const results = await forecastAllWorkers(7);
    res.json(results);
  } catch (e) { next(e); }
});

export default router;
