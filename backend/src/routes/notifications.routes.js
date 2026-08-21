import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const unread = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unread });
  } catch (e) { next(e); }
});

router.patch('/:id/read', auth, async (req, res, next) => {
  try {
    const n = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json(n);
  } catch (e) { next(e); }
});

router.patch('/read-all', auth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
