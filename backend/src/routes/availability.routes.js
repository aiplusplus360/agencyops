import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../lib/utils.js';
import { recomputeScaling } from '../services/ai/scaling.js';

const router = Router();

/** Worker sets their own availability. */
router.patch('/me', auth, async (req, res, next) => {
  try {
    const { availability, until, note } = req.body;
    const valid = ['ACTIVE', 'AT_CAPACITY', 'ON_LEAVE', 'BACK_TOMORROW'];
    if (!valid.includes(availability)) return res.status(400).json({ error: 'Invalid availability' });

    const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
    if (!worker) return res.status(404).json({ error: 'Worker profile not found' });

    const updated = await prisma.worker.update({
      where: { id: worker.id },
      data: {
        availability,
        availabilityUntil: until ? new Date(until) : null,
      },
    });

    await prisma.availabilityLog.create({
      data: { workerId: worker.id, status: availability, until: until ? new Date(until) : null, note },
    });

    // If going on leave/at capacity → rebalance active queue
    if (['ON_LEAVE', 'AT_CAPACITY'].includes(availability)) {
      const activeAssignments = await prisma.assignment.findMany({
        where: { workerId: worker.id, active: true },
        include: { task: true },
      });
      if (activeAssignments.length) {
        const { rerouteTask } = await import('../services/ai/selfHealing.js');
        const rebalanced = [];
        for (const a of activeAssignments) {
          const result = await rerouteTask(a.taskId, worker.id, { note: note || 'Worker unavailable' });
          rebalanced.push({ taskId: a.taskId, ...result });
        }
        res.json({ worker: updated, rebalanced });
        return;
      }
    }

    await recomputeScaling(worker.id);
    await logActivity(req.user.id, 'availability.update', 'worker', worker.id, { availability });
    res.json({ worker: updated });
  } catch (e) { next(e); }
});

export default router;
