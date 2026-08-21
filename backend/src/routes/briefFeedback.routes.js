import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { notify, logActivity } from '../lib/utils.js';

const router = Router();

/** Worker flags an unclear task brief. */
router.post('/', auth, async (req, res, next) => {
  try {
    const { taskId, note } = req.body;
    if (!taskId || !note?.trim()) return res.status(400).json({ error: 'taskId and note required' });

    const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
    const assignment = await prisma.assignment.findFirst({ where: { taskId, workerId: worker.id, active: true } });
    if (!assignment) return res.status(403).json({ error: 'Task not assigned to you' });

    const fb = await prisma.briefFeedback.create({
      data: { taskId, workerId: worker.id, note },
    });
    await notify(null, 'brief_feedback', 'Task brief flagged as unclear',
      `${req.user.name} flagged "${taskId}": ${note.slice(0, 140)}`);
    res.status(201).json(fb);
  } catch (e) { next(e); }
});

/** Admin: list brief feedback. */
router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const rows = await prisma.briefFeedback.findMany({
      include: { task: { select: { id: true, title: true } }, worker: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
