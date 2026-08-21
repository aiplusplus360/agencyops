import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { type, entityId, from, to, limit = 100 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (entityId) where.entityId = entityId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const decisions = await prisma.aiDecision.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      include: { creator: { select: { id: true, name: true } } },
    });
    res.json(decisions);
  } catch (e) { next(e); }
});

export default router;
