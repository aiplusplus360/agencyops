import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { logActivity, logTaskActivity, notify } from '../lib/utils.js';
import { rerouteTask } from '../services/ai/selfHealing.js';
import { assignTask } from '../services/ai/matching.js';

const router = Router();

const include = {
  roadmap: { select: { id: true, title: true, horizon: true } },
  product: { select: { id: true, name: true } },
  assignments: {
    where: { active: true },
    include: { worker: { include: { user: { select: { id: true, name: true } } } } },
  },
  submissions: { include: { evaluations: true }, orderBy: { attemptNo: 'desc' } },
};

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, workerId, horizon, priority, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = Number(priority);
    if (horizon) where.roadmap = { horizon };
    if (q) where.title = { contains: q, mode: 'insensitive' };

    // Worker sees only their own queue
    if (req.user.role === 'WORKER') {
      const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
      where.assignments = { some: { workerId: worker.id, active: true } };
    } else if (workerId) {
      where.assignments = { some: { workerId, active: true } };
    }

    const tasks = await prisma.task.findMany({
      where,
      include,
      orderBy: [{ priority: 'asc' }, { deadline: 'asc' }],
      take: 200,
    });
    res.json(tasks);
  } catch (e) { next(e); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        ...include,
        activities: { orderBy: { createdAt: 'desc' } },
        notes: { include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' } },
        briefFeedback: true,
        dependents: { include: { dependent: true } },
        dependencies: { include: { dependency: true } },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (e) { next(e); }
});

/** Worker status updates: working_on_it / blocked (can't do it) / completed. */
router.patch('/:id/status', auth, async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const allowed = ['WORKING_ON_IT', 'BLOCKED', 'COMPLETED', 'IN_REVISION'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const worker = await prisma.worker.findUnique({ where: { userId: req.user.id } });
    const assignment = await prisma.assignment.findFirst({
      where: { taskId: req.params.id, workerId: worker.id, active: true },
    });
    if (!assignment && req.user.role === 'WORKER') {
      return res.status(403).json({ error: 'Task is not assigned to you' });
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.id } });

    if (status === 'WORKING_ON_IT') {
      await prisma.task.update({ where: { id: req.params.id }, data: { status: 'WORKING_ON_IT' } });
      if (assignment && !assignment.startedAt) {
        await prisma.assignment.update({ where: { id: assignment.id }, data: { startedAt: new Date() } });
      }
      await logTaskActivity(req.params.id, 'started', worker.id, 'Worker started the task.');
    } else if (status === 'BLOCKED') {
      // cannot do it → re-route
      await prisma.task.update({ where: { id: req.params.id }, data: { status: 'BLOCKED' } });
      const result = await rerouteTask(req.params.id, worker.id, { note });
      await logTaskActivity(req.params.id, 'reassigned', worker.id, `Blocked by worker. Reassigned: ${result.reassignedTo ? 'yes' : 'no eligible worker'}`);
      await notify(null, 'task_blocked', 'Worker blocked on task', `${task.title} — ${note || 'no note'}`);
      return res.json({ status: 'BLOCKED', ...result });
    } else if (status === 'COMPLETED') {
      await prisma.task.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } });
      // note: submission flow sets to SUBMITTED instead — this marks intent
    }

    await logActivity(req.user.id, 'task.status_change', 'task', req.params.id, { status, note });
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

/** Admin note on a task (lightweight admin-worker channel). */
router.post('/:id/notes', auth, adminOnly, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Note body required' });
    const note = await prisma.taskNote.create({
      data: { taskId: req.params.id, authorId: req.user.id, body },
    });
    await logActivity(req.user.id, 'task.note', 'task', req.params.id);
    res.status(201).json(note);
  } catch (e) { next(e); }
});

/** Admin manually creates a task. */
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { title, description, acceptanceCriteria, skillTags, effortHours, priority, deadline, roadmapId, productId } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const task = await prisma.task.create({
      data: {
        title,
        description,
        acceptanceCriteria: acceptanceCriteria || [],
        skillTags: skillTags || [],
        effortHours: effortHours || 4,
        priority: priority || 2,
        deadline: deadline ? new Date(deadline) : new Date(Date.now() + 48 * 3600 * 1000),
        roadmapId: roadmapId || undefined,
        productId: productId || undefined,
      },
    });
    await logActivity(req.user.id, 'task.create', 'task', task.id);
    res.status(201).json(task);
  } catch (e) { next(e); }
});

/** Resolve a task from an AI-proposed change (by id or fuzzy title match). */
async function resolveTask(change) {
  if (change.taskId) {
    const t = await prisma.task.findUnique({ where: { id: change.taskId } });
    if (t) return t;
  }
  if (change.taskMatch) {
    const q = String(change.taskMatch).trim();
    const tasks = await prisma.task.findMany({
      where: { title: { contains: q, mode: 'insensitive' }, status: { in: ['PENDING', 'WORKING_ON_IT', 'IN_REVISION'] } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    return tasks[0] || null;
  }
  return null;
}

/** Resolve a worker by name or email for a reassignment. */
async function resolveWorkerByNameOrEmail(nameOrEmail) {
  const q = String(nameOrEmail || '').trim().toLowerCase();
  if (!q) return null;
  return prisma.worker.findFirst({
    where: {
      user: {
        active: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
    },
    include: { user: { select: { name: true, email: true } } },
  });
}

/**
 * Apply an array of AI-proposed task changes (reschedule / edit / reassign).
 * Each entry is applied independently; one failure never blocks the rest.
 */
router.post('/apply-changes', auth, adminOnly, async (req, res, next) => {
  try {
    const { changes = [] } = req.body;
    if (!Array.isArray(changes) || !changes.length) {
      return res.status(400).json({ error: 'changes must be a non-empty array' });
    }

    const applied = [];
    const errors = [];

    for (const change of changes) {
      const label = change?.taskMatch || change?.taskId || 'unknown task';
      try {
        const action = String(change?.action || '').toLowerCase();
        if (!['reschedule', 'edit', 'reassign'].includes(action)) {
          throw new Error(`Unknown action "${change?.action}"`);
        }

        const task = await resolveTask(change);
        if (!task) throw new Error(`Could not find a task matching "${label}"`);

        if (action === 'reschedule') {
          const deadline = change.newDeadline ? new Date(`${change.newDeadline}T23:59:59`) : null;
          if (!deadline || isNaN(deadline)) throw new Error('Missing or invalid newDeadline (use YYYY-MM-DD)');
          await prisma.task.update({ where: { id: task.id }, data: { deadline } });
          await logTaskActivity(task.id, 'rescheduled', null, `Deadline moved to ${deadline.toISOString().slice(0, 10)}.${change.reason ? ` ${change.reason}` : ''}`);
          await logActivity(req.user.id, 'task.reschedule', 'task', task.id, { newDeadline: deadline.toISOString(), reason: change.reason });
          applied.push({ action, taskId: task.id, title: task.title, newDeadline: deadline.toISOString().slice(0, 10) });
        } else if (action === 'edit') {
          const fields = change.fields || {};
          const data = {};
          if (fields.title) data.title = String(fields.title).slice(0, 200);
          if (fields.description !== undefined) data.description = fields.description;
          if (fields.priority !== undefined) data.priority = Math.min(3, Math.max(1, Number(fields.priority) || 2));
          if (fields.effortHours !== undefined) data.effortHours = Math.min(40, Math.max(1, Number(fields.effortHours) || 4));
          if (Array.isArray(fields.skillTags)) data.skillTags = fields.skillTags.map((s) => String(s).trim()).filter(Boolean);
          if (Array.isArray(fields.acceptanceCriteria)) data.acceptanceCriteria = fields.acceptanceCriteria.map((s) => String(s).trim()).filter(Boolean);
          if (!Object.keys(data).length) throw new Error('No editable fields provided');
          await prisma.task.update({ where: { id: task.id }, data });
          await logTaskActivity(task.id, 'edited', null, `Task details updated.${change.reason ? ` ${change.reason}` : ''}`);
          await logActivity(req.user.id, 'task.edit', 'task', task.id, { fields: data, reason: change.reason });
          applied.push({ action, taskId: task.id, title: task.title, fields: data });
        } else if (action === 'reassign') {
          const worker = await resolveWorkerByNameOrEmail(change.newAssignee);
          if (!worker) throw new Error(`Could not find an employee matching "${change.newAssignee}"`);
          const current = await prisma.assignment.findFirst({ where: { taskId: task.id, active: true } });
          if (current) {
            await prisma.assignment.update({ where: { id: current.id }, data: { active: false } });
          }
          const { assignment, score } = await assignTask(task.id, worker.id, {
            assignedBy: 'AI',
            rationale: `Reassigned at owner's request.${change.reason ? ` ${change.reason}` : ''}`,
            adminUserId: req.user.id,
          });
          await logTaskActivity(task.id, 'reassigned', null, `Reassigned to ${worker.user.name} at owner's request.`);
          await logActivity(req.user.id, 'task.reassign', 'task', task.id, { toWorker: worker.id, reason: change.reason });
          await notify(worker.user.id, 'task_reassigned', 'Task moved to you', `"${task.title}" was reassigned to you.`).catch(() => {});
          applied.push({ action, taskId: task.id, title: task.title, workerName: worker.user.name, score });
        }
      } catch (e) {
        errors.push({ taskMatch: label, action: change?.action, error: e.message });
      }
    }

    const anyApplied = applied.length > 0;
    if (anyApplied) {
      await logActivity(req.user.id, 'task.apply_changes', null, null, { applied: applied.length, errors: errors.length });
    }

    res.status(anyApplied ? 200 : 400).json({ applied, errors });
  } catch (e) { next(e); }
});

export default router;
