import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json({ tasks: [], workers: [], products: [], visions: [] });

    const term = { contains: q, mode: 'insensitive' };

    const tasks = await prisma.task.findMany({
      where: { title: term },
      include: { assignments: { where: { active: true }, include: { worker: { include: { user: { select: { name: true } } } } } } },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    const workers = await prisma.worker.findMany({
      where: { user: { OR: [{ name: term }, { email: term }] } },
      include: { user: { select: { id: true, name: true, email: true } } },
      take: 20,
    });

    const products = await prisma.product.findMany({ where: { name: term }, take: 10 });

    const visions = await prisma.vision.findMany({ where: { rawText: { contains: q, mode: 'insensitive' } }, take: 10 });

    res.json({ tasks, workers, products, visions });
  } catch (e) { next(e); }
});

export default router;
