import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const skills = await prisma.skill.findMany({ orderBy: { name: 'asc' } });
    res.json(skills);
  } catch (e) { next(e); }
});

router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const skill = await prisma.skill.upsert({
      where: { name: name.trim() },
      update: {},
      create: { name: name.trim() },
    });
    res.status(201).json(skill);
  } catch (e) { next(e); }
});

export default router;
