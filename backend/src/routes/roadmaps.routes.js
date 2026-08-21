import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { visionId, horizon } = req.query;
    const where = {};
    if (visionId) where.visionId = visionId;
    if (horizon) where.horizon = horizon;

    const roadmaps = await prisma.roadmap.findMany({
      where,
      include: {
        tasks: {
          include: {
            assignments: { where: { active: true }, include: { worker: { include: { user: { select: { name: true } } } } } },
            dependents: { include: { dependent: { select: { id: true, title: true, status: true } } } },
          },
        },
        vision: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(roadmaps);
  } catch (e) { next(e); }
});

router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { title, description, horizon, startDate, endDate, status } = req.body;
    const data = {};
    if (title) data.title = title;
    if (description !== undefined) data.description = description;
    if (horizon) data.horizon = horizon;
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (status) data.status = status;
    const rm = await prisma.roadmap.update({ where: { id: req.params.id }, data });
    res.json(rm);
  } catch (e) { next(e); }
});

export default router;
