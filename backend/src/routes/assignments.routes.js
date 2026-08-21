import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { logActivity } from '../lib/utils.js';
import { suggestBatch, assignTask, computeCompatibility } from '../services/ai/matching.js';

const router = Router();

/** Ranked shortlist per task (AI compatibility matrix). */
router.post('/suggest', auth, adminOnly, aiLimiter, async (req, res, next) => {
  try {
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || !taskIds.length) {
      return res.status(400).json({ error: 'taskIds must be a non-empty array' });
    }
    const results = await suggestBatch(taskIds, req.user.id);
    res.json(results);
  } catch (e) { next(e); }
});

/** One-click auto-assign: assign every task to its best worker. */
router.post('/batch-assign', auth, adminOnly, async (req, res, next) => {
  try {
    const { assignments } = req.body; // [{ taskId, workerId? }]
    if (!Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ error: 'assignments must be a non-empty array' });
    }

    const results = [];
    for (const a of assignments) {
      try {
        let targetWorkerId = a.workerId;
        let score = null;
        if (!targetWorkerId) {
          // auto-suggest best
          const task = await prisma.task.findUnique({ where: { id: a.taskId } });
          const shortlist = await suggestBatch([a.taskId], req.user.id);
          const best = shortlist[0]?.best;
          if (!best) {
            results.push({ taskId: a.taskId, status: 'skipped', reason: 'No eligible worker' });
            continue;
          }
          targetWorkerId = best.workerId;
          score = best.score;
        }
        const { assignment } = await assignTask(a.taskId, targetWorkerId, {
          assignedBy: 'AI',
          rationale: score ? `Auto-assigned best match (${score}).` : 'Manually chosen worker.',
          adminUserId: req.user.id,
        });
        results.push({ taskId: a.taskId, workerId: targetWorkerId, status: 'assigned', assignmentId: assignment.id });
      } catch (e) {
        results.push({ taskId: a.taskId, status: 'failed', reason: e.message });
      }
    }

    await logActivity(req.user.id, 'assignment.batch', null, null, { count: results.length });
    res.json(results);
  } catch (e) { next(e); }
});

/** Manual override assignment. */
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { taskId, workerId, rationale } = req.body;
    const { assignment, score } = await assignTask(taskId, workerId, {
      assignedBy: 'ADMIN',
      rationale: rationale || 'Manual assignment by admin.',
      adminUserId: req.user.id,
    });
    await logActivity(req.user.id, 'assignment.manual', 'task', taskId, { workerId });
    res.status(201).json({ assignment, score });
  } catch (e) { next(e); }
});

/** Compatibility detail for a specific task+worker. */
router.get('/compatibility/:taskId/:workerId', auth, adminOnly, async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
    const worker = await prisma.worker.findUnique({ where: { id: req.params.workerId } });
    if (!task || !worker) return res.status(404).json({ error: 'Not found' });
    const { score, rationale } = await computeCompatibility(task, worker);
    res.json({ score, rationale });
  } catch (e) { next(e); }
});

/** Manually trigger the AI auto-refill engine for all workers. */
router.post('/refill', auth, adminOnly, async (req, res, next) => {
  try {
    const { refillAllWorkers } = await import('../services/ai/autoRefill.js');
    const results = await refillAllWorkers();
    await logActivity(req.user.id, 'assignment.refill_manual');
    res.json(results);
  } catch (e) { next(e); }
});

export default router;
