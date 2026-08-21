import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const digests = await prisma.digest.findMany({
      where: { adminId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    res.json(digests);
  } catch (e) { next(e); }
});

export default router;
