import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { logActivity, logTaskActivity } from '../lib/utils.js';
import { evaluateSubmission } from '../services/ai/evaluation.js';

const router = Router();

/** Worker submits work for a task. */
router.post('/', auth, upload.array('files', 5), async (req, res, next) => {
  try {
    const { taskId, text, logs, outputLinks } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId required' });
    if (!text?.trim() && !logs?.trim()) {
      return res.status(400).json({ error: 'Add a comment or execution log before submitting' });
    }

    const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
    const assignment = await prisma.assignment.findFirst({
      where: { taskId, workerId: worker.id, active: true },
    });
    if (!assignment) return res.status(403).json({ error: 'Task not assigned to you' });

    const attemptNo = (await prisma.submission.count({ where: { taskId, workerId: worker.id } })) + 1;

    const files = (req.files || []).map((f) => ({ name: f.originalname, path: f.path }));

    const submission = await prisma.submission.create({
      data: {
        taskId,
        workerId: worker.id,
        text: text || '',
        logs: logs || undefined,
        outputLinks: outputLinks
          ? (Array.isArray(outputLinks)
            ? outputLinks
            : (() => {
              try { return JSON.parse(outputLinks); } catch { return outputLinks.split(/[\s,]+/).filter(Boolean); }
            })())
          : undefined,
        files: files.length ? files : undefined,
        attemptNo,
      },
    });

    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { submittedAt: new Date() },
    });
    await prisma.task.update({ where: { id: taskId }, data: { status: 'SUBMITTED' } });
    await logTaskActivity(taskId, 'submitted', worker.id, `Submission attempt ${attemptNo}.`);
    await logActivity(req.user.id, 'submission.create', 'task', taskId, { attemptNo });

    res.status(201).json({ submission, submittedAt: new Date() });
  } catch (e) { next(e); }
});

/** Worker's own submissions. */
router.get('/mine', auth, async (req, res, next) => {
  try {
    const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
    const submissions = await prisma.submission.findMany({
      where: { workerId: worker.id },
      include: { task: true, evaluations: true },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(submissions);
  } catch (e) { next(e); }
});

/** Admin: list all submissions. */
router.get('/', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.role !== 'WORKER') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const where = {};
    if (req.query.taskId) where.taskId = req.query.taskId;
    if (req.query.workerId) where.workerId = req.query.workerId;
    const submissions = await prisma.submission.findMany({
      where,
      include: { task: true, evaluations: true, worker: { include: { user: { select: { name: true } } } } },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    });
    res.json(submissions);
  } catch (e) { next(e); }
});

export default router;
