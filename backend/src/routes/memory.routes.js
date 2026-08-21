import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { logActivity } from '../lib/utils.js';

const router = Router();

const TYPES = ['FACT', 'PREFERENCE', 'DECISION', 'LESSON'];

function cleanMemoryInput(body) {
  return {
    type: TYPES.includes(body.type) ? body.type : 'FACT',
    content: String(body.content || '').trim(),
    category: String(body.category || 'other').trim().slice(0, 40) || 'other',
    important: !!body.important,
  };
}

/** List memories (optionally filtered by type/search). */
router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { type, q } = req.query;
    const where = { userId: req.user.id };
    if (type && TYPES.includes(String(type))) where.type = String(type);
    if (q && String(q).trim()) {
      where.OR = [
        { content: { contains: String(q).trim(), mode: 'insensitive' } },
        { category: { contains: String(q).trim(), mode: 'insensitive' } },
      ];
    }
    const memories = await prisma.memory.findMany({
      where,
      orderBy: [{ important: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    res.json(memories);
  } catch (e) { next(e); }
});

/** Add a memory manually. */
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { content, type, category, important } = cleanMemoryInput(req.body || {});
    if (!content) return res.status(400).json({ error: 'Memory content is required' });
    const memory = await prisma.memory.create({
      data: { userId: req.user.id, content, type, category, important, source: 'manual' },
    });
    await logActivity(req.user.id, 'memory.create', 'memory', memory.id);
    res.status(201).json(memory);
  } catch (e) { next(e); }
});

/** Update a memory (content/type/category/important). */
router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const existing = await prisma.memory.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    const { content, type, category, important } = req.body || {};
    const memory = await prisma.memory.update({
      where: { id: existing.id },
      data: {
        ...(content !== undefined ? { content: String(content).trim() } : {}),
        ...(type !== undefined ? { type: TYPES.includes(type) ? type : 'FACT' } : {}),
        ...(category !== undefined ? { category: String(category).trim().slice(0, 40) || 'other' } : {}),
        ...(important !== undefined ? { important: !!important } : {}),
      },
    });
    await logActivity(req.user.id, 'memory.update', 'memory', memory.id);
    res.json(memory);
  } catch (e) { next(e); }
});

/** Pin/unpin a memory. */
router.post('/:id/pin', auth, adminOnly, async (req, res, next) => {
  try {
    const existing = await prisma.memory.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    const memory = await prisma.memory.update({
      where: { id: existing.id },
      data: { important: !existing.important },
    });
    res.json(memory);
  } catch (e) { next(e); }
});

/** Delete a memory. */
router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const existing = await prisma.memory.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    await prisma.memory.delete({ where: { id: existing.id } });
    await logActivity(req.user.id, 'memory.delete', 'memory', existing.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
