import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { upload } from '../middleware/upload.js';
import { logActivity } from '../lib/utils.js';
import { ingestVision } from '../services/ai/ingestion.js';
import { detectDuplicates } from '../services/ai/duplicates.js';
import { assignTask } from '../services/ai/matching.js';

const router = Router();

/** Resolve a worker by email or name from the AI draft's assignee field. */
async function resolveWorker(assignee) {
  if (!assignee || !String(assignee).trim()) return null;
  const term = String(assignee).trim();
  const byEmail = await prisma.worker.findFirst({
    where: { user: { email: term.toLowerCase() } },
    include: { user: true },
  });
  if (byEmail) return byEmail;
  const byName = await prisma.worker.findFirst({
    where: { user: { name: { contains: term, mode: 'insensitive' } } },
    include: { user: true },
  });
  return byName;
}

/** Assign a freshly-created task to the worker named in the discussion, if any. */
async function assignIfDiscussed(task, assignee, adminUserId, assigned, unassignedRef) {
  if (!assignee || !String(assignee).trim()) {
    unassignedRef.count += 1;
    return null;
  }
  const worker = await resolveWorker(assignee);
  if (!worker) {
    unassignedRef.count += 1;
    return null;
  }
  const { score } = await assignTask(task.id, worker.id, {
    assignedBy: 'ADMIN',
    rationale: 'Assigned during AI chat discussion.',
    adminUserId,
  });
  assigned.push({ taskTitle: task.title, workerName: worker.user.name, score });
  return worker;
}

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const visions = await prisma.vision.findMany({
      include: { roadmaps: { select: { id: true, title: true, horizon: true } }, products: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(visions);
  } catch (e) { next(e); }
});

router.get('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const v = await prisma.vision.findUnique({
      where: { id: req.params.id },
      include: { roadmaps: { include: { tasks: true } }, products: { include: { product: true } } },
    });
    if (!v) return res.status(404).json({ error: 'Vision not found' });
    res.json(v);
  } catch (e) { next(e); }
});

/** Ingest a brain-dump → AI produces roadmap preview (status PROCESSING → LIVE). */
router.post('/', auth, adminOnly, aiLimiter, upload.array('files', 5), async (req, res, next) => {
  try {
    const { rawText, productIds = [], ai } = req.body;
    if (!rawText || rawText.trim().length < 10) {
      return res.status(400).json({ error: 'Brain-dump text is required (min 10 chars)' });
    }

    const existingWork = await prisma.task
      .findMany({ where: { status: { not: 'COMPLETED' } }, select: { title: true }, take: 100 })
      .then((t) => t.map((x) => x.title).join('\n'));

    // If the AI chat already produced a draft, skip the expensive re-ingestion.
    let result, duplicates;
    if (ai && Array.isArray(ai.roadmap) && ai.roadmap.length) {
      result = {
        visionStatement: ai.visionStatement || 'Campaign plan',
        objectives: ai.objectives || [],
        roadmap: ai.roadmap,
        suggestedTasks: ai.suggestedTasks || [],
      };
      duplicates = [];
    } else {
      result = await ingestVision({ rawText, productIds, existingWork });
      duplicates = await detectDuplicates(rawText);
    }

    const files = (req.files || []).map((f) => ({ name: f.originalname, path: f.path }));

    const vision = await prisma.vision.create({
      data: {
        adminId: req.user.id,
        rawText,
        transcript: req.body.transcript || null,
        fileRefs: files.length ? files : undefined,
        status: 'LIVE',
        products: productIds.length
          ? { create: productIds.map((productId) => ({ productId })) }
          : undefined,
      },
    });

    await logActivity(req.user.id, 'vision.ingest', 'vision', vision.id);

    res.status(201).json({
      vision,
      ai: { ...result, duplicateFlags: duplicates },
    });
  } catch (e) { next(e); }
});

/** Approve the AI preview → materialize roadmaps + tasks. */
router.post('/:id/approve', auth, adminOnly, async (req, res, next) => {
  try {
    const vision = await prisma.vision.findUnique({
      where: { id: req.params.id },
      include: { products: true },
    });
    if (!vision) return res.status(404).json({ error: 'Vision not found' });

    const { roadmap, suggestedTasks = [] } = req.body;
    if (!Array.isArray(roadmap) || !roadmap.length) {
      return res.status(400).json({ error: 'roadmap must be a non-empty array' });
    }

    const createdRoadmaps = [];
    const createdTasks = [];
    const assigned = [];
    const unassignedRef = { count: 0 };

    for (const item of roadmap) {
      const horizon = item.horizon === 'D30' ? 'D30' : item.horizon === 'D60_90' ? 'D60_90' : 'D15';
      const rm = await prisma.roadmap.create({
        data: {
          visionId: vision.id,
          horizon,
          title: item.title,
          description: item.description,
        },
      });
      createdRoadmaps.push(rm);

      const created = [];
      for (const t of item.tasks || []) {
        const deadline = new Date(Date.now() + (t.effortHours || 4) * 3600 * 1000 * 1.5);
        const task = await prisma.task.create({
          data: {
            roadmapId: rm.id,
            productId: vision.products[0]?.productId || null,
            title: t.title,
            description: t.description,
            acceptanceCriteria: t.acceptanceCriteria || [],
            skillTags: t.skillTags || [],
            effortHours: t.effortHours || 4,
            priority: t.priority || 2,
            deadline,
            sourceVision: vision.id,
          },
        });
        created.push(task);
        createdTasks.push(task);
        await assignIfDiscussed(task, t.assignee, req.user.id, assigned, unassignedRef);
      }

      // Dependency wiring: explicit "dependsOn" indices first, then
      // sequential chaining so each task unlocks the next (self-healing).
      for (let i = 0; i < created.length; i++) {
        const deps = item.tasks[i]?.dependsOn; // array of indices into this roadmap's tasks
        const targets = Array.isArray(deps)
          ? deps.map((idx) => created[idx]).filter(Boolean)
          : i > 0 ? [created[i - 1]] : [];
        for (const dep of targets) {
          if (dep.id === created[i].id) continue;
          await prisma.taskDependency.create({
            data: { dependencyId: dep.id, dependentId: created[i].id },
          }).catch(() => {});
        }
      }
    }

    // Suggested tasks (ticked by admin) → unassigned pool or assigned if discussed
    for (const t of suggestedTasks) {
      const deadline = new Date(Date.now() + (t.effortHours || 4) * 3600 * 1000 * 1.5);
      const task = await prisma.task.create({
        data: {
          productId: vision.products[0]?.productId || null,
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria || [],
          skillTags: t.skillTags || [],
          effortHours: t.effortHours || 4,
          priority: t.priority || 2,
          deadline,
          autoGenerated: true,
          sourceVision: vision.id,
        },
      });
      createdTasks.push(task);
      await assignIfDiscussed(task, t.assignee, req.user.id, assigned, unassignedRef);
    }

    await prisma.vision.update({ where: { id: vision.id }, data: { status: 'LIVE' } });
    await logActivity(req.user.id, 'vision.approve', 'vision', vision.id, { roadmaps: createdRoadmaps.length, tasks: createdTasks.length, assigned: assigned.length });

    res.json({
      roadmaps: createdRoadmaps,
      tasks: createdTasks,
      assignments: assigned,
      unassignedCount: unassignedRef.count,
      totalTasks: createdTasks.length,
    });
  } catch (e) { next(e); }
});

/** Manually create a task on a vision/roadmap. */
router.post('/:id/tasks', auth, adminOnly, async (req, res, next) => {
  try {
    const { title, description, acceptanceCriteria, skillTags, effortHours, priority, deadline } = req.body;
    const vision = await prisma.vision.findUnique({ where: { id: req.params.id } });
    if (!vision) return res.status(404).json({ error: 'Vision not found' });

    const task = await prisma.task.create({
      data: {
        title,
        description,
        acceptanceCriteria: acceptanceCriteria || [],
        skillTags: skillTags || [],
        effortHours: effortHours || 4,
        priority: priority || 2,
        deadline: deadline ? new Date(deadline) : new Date(Date.now() + 48 * 3600 * 1000),
        sourceVision: vision.id,
      },
    });
    res.status(201).json(task);
  } catch (e) { next(e); }
});

export default router;
