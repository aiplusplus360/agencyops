import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { logActivity, logApiUsage, getEmployeeManagementPolicy } from '../lib/utils.js';
import { recordEstimationAccuracy } from '../services/ai/estimation.js';
import { recomputeScaling } from '../services/ai/scaling.js';

const router = Router();

const workerInclude = {
  user: { select: { id: true, name: true, email: true, avatar: true, active: true } },
  skills: { include: { skill: true } },
};

async function serializeWorker(w) {
  return {
    id: w.id,
    userId: w.userId,
    name: w.user.name,
    email: w.user.email,
    avatar: w.user.avatar,
    seniorityTier: w.seniorityTier,
    baseCapacity: w.baseCapacity,
    effectiveCapacity: w.effectiveCapacity,
    scalingFactor: w.scalingFactor,
    scalingState: w.scalingState,
    scalingLocked: w.scalingLocked,
    availability: w.availability,
    availabilityUntil: w.availabilityUntil,
    strengthsNotes: w.strengthsNotes,
    skills: w.skills.map((s) => ({ id: s.skillId, name: s.skill.name, proficiency: s.proficiency })),
    activeTasks: await prisma.assignment.count({
      where: { workerId: w.id, active: true, task: { status: { notIn: ['SUBMITTED', 'COMPLETED'] } } },
    }),
  };
}

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const workers = await prisma.worker.findMany({ include: workerInclude });
    const out = [];
    for (const w of workers) out.push(await serializeWorker(w));
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const w = await prisma.worker.findUnique({ where: { id: req.params.id }, include: workerInclude });
    if (!w) return res.status(404).json({ error: 'Worker not found' });
    res.json(await serializeWorker(w));
  } catch (e) { next(e); }
});

router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { userId, seniorityTier = 'MID', baseCapacity = 3, strengthsNotes, skillIds = [] } = req.body;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const worker = await prisma.worker.create({
      data: {
        userId,
        seniorityTier,
        baseCapacity,
        effectiveCapacity: baseCapacity,
        strengthsNotes,
        skills: {
          create: skillIds.map((skillId) => ({ skillId, proficiency: 3 })),
        },
      },
      include: workerInclude,
    });
    await logActivity(req.user.id, 'worker.create', 'worker', worker.id);
    res.status(201).json(await serializeWorker(worker));
  } catch (e) { next(e); }
});

router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const policy = await getEmployeeManagementPolicy();
    if (!policy.editEnabled) {
      return res.status(403).json({ error: 'Employee editing is currently disabled in Settings → Employee Management.' });
    }
    const { seniorityTier, baseCapacity, strengthsNotes, scalingLocked, skillIds, skills } = req.body;
    const data = {};
    if (seniorityTier) data.seniorityTier = seniorityTier;
    if (baseCapacity) data.baseCapacity = baseCapacity;
    if (strengthsNotes !== undefined) data.strengthsNotes = strengthsNotes;
    if (scalingLocked !== undefined) data.scalingLocked = scalingLocked;

    const w = await prisma.worker.findUnique({ where: { id: req.params.id } });
    if (!w) return res.status(404).json({ error: 'Worker not found' });

    if (skills && Array.isArray(skills)) {
      await prisma.workerSkill.deleteMany({ where: { workerId: req.params.id } });
      data.skills = {
        create: skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency || 3 })),
      };
    }

    const updated = await prisma.worker.update({
      where: { id: req.params.id },
      data,
      include: workerInclude,
    });
    await recomputeScaling(req.params.id);
    await logActivity(req.user.id, 'worker.update', 'worker', req.params.id);
    res.json(await serializeWorker(updated));
  } catch (e) { next(e); }
});

router.get('/:id/performance', auth, async (req, res, next) => {
  try {
    const worker = await prisma.worker.findUnique({ where: { id: req.params.id } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Admin can view any worker; a worker can only view their own performance
    if (req.user.role !== 'ADMIN' && worker.userId !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const [est, assignments, evaluations] = await Promise.all([
      recordEstimationAccuracy(req.params.id),
      prisma.assignment.findMany({
        where: { workerId: req.params.id },
        include: { task: true },
        orderBy: { assignedAt: 'desc' },
        take: 100,
      }),
      prisma.evaluation.findMany({
        where: { submission: { workerId: req.params.id } },
        include: { submission: { select: { taskId: true } } },
        orderBy: { evaluatedAt: 'desc' },
        take: 100,
      }),
    ]);

    const done = assignments.filter((a) => a.confirmedAt).length;
    const onTime = evaluations.filter((e) => e.deadlineScore >= 60).length;
    const onTimeRate = evaluations.length ? Math.round((onTime / evaluations.length) * 100) : 0;
    const avgQuality = evaluations.length
      ? Math.round(evaluations.reduce((s, e) => s + e.qualityScore, 0) / evaluations.length)
      : 0;
    const totalHours = assignments
      .filter((a) => a.confirmedAt && a.startedAt)
      .reduce((s, a) => s + (a.confirmedAt - a.startedAt) / 3600000, 0);

    res.json({
      workerId: req.params.id,
      estimationAccuracy: est.accuracy,
      estimationSamples: est.samples,
      completed: done,
      avgQuality,
      onTimeRate,
      totalHours: Math.round(totalHours),
      timeline: assignments.map((a) => ({
        taskId: a.taskId,
        title: a.task.title,
        status: a.task.status,
        assignedAt: a.assignedAt,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        confirmedAt: a.confirmedAt,
        deadline: a.task.deadline,
        score: evaluations.find((e) => e.submission.taskId === a.taskId)?.qualityScore ?? null,
      })),
    });
  } catch (e) { next(e); }
});

export default router;
