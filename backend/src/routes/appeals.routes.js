import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { notify, logActivity } from '../lib/utils.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const appeals = await prisma.appeal.findMany({
      include: {
        task: { select: { id: true, title: true } },
        worker: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(appeals);
  } catch (e) { next(e); }
});

/** Admin reviews an appeal. */
router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { status, reviewNote } = req.body;
    if (!['UPHELD', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const appeal = await prisma.appeal.findUnique({ where: { id: req.params.id } });
    if (!appeal) return res.status(404).json({ error: 'Appeal not found' });

    const updated = await prisma.appeal.update({
      where: { id: req.params.id },
      data: { status, reviewedBy: req.user.id, reviewNote },
    });

    const worker = await prisma.worker.findUnique({ where: { id: appeal.workerId } });
    await notify(worker.userId, 'appeal_result', status === 'UPHELD' ? 'Appeal upheld' : 'Appeal rejected',
      reviewNote || `Your appeal was ${status.toLowerCase()}.`);

    if (status === 'UPHELD') {
      // reopen the task for revision so the worker can improve & resubmit
      await prisma.task.update({ where: { id: appeal.taskId }, data: { status: 'IN_REVISION' } });
    }
    await logActivity(req.user.id, 'appeal.review', 'appeal', appeal.id, { status });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
