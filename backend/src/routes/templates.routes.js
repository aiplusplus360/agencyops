import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { logActivity } from '../lib/utils.js';
import { scheduleTemplate } from '../services/ai/templates.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const templates = await prisma.taskTemplate.findMany({
      include: { product: { select: { id: true, name: true } }, instances: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (e) { next(e); }
});

router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, title, description, acceptanceCriteria, skillTags, effortHours, cadence, productId } = req.body;
    if (!name || !title) return res.status(400).json({ error: 'name and title required' });
    const template = await prisma.taskTemplate.create({
      data: {
        name,
        title,
        description,
        acceptanceCriteria: acceptanceCriteria || [],
        skillTags: skillTags || [],
        effortHours: effortHours || 4,
        cadence: cadence || 'WEEKLY',
        productId: productId || undefined,
        createdBy: req.user.id,
      },
    });
    await scheduleTemplate(template);
    await logActivity(req.user.id, 'template.create', 'template', template.id);
    res.status(201).json(template);
  } catch (e) { next(e); }
});

router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, title, description, acceptanceCriteria, skillTags, effortHours, cadence, productId, active } = req.body;
    const data = {};
    if (name) data.name = name;
    if (title) data.title = title;
    if (description !== undefined) data.description = description;
    if (acceptanceCriteria) data.acceptanceCriteria = acceptanceCriteria;
    if (skillTags) data.skillTags = skillTags;
    if (effortHours) data.effortHours = effortHours;
    if (cadence) data.cadence = cadence;
    if (productId !== undefined) data.productId = productId;
    if (active !== undefined) data.active = active;
    const template = await prisma.taskTemplate.update({ where: { id: req.params.id }, data });
    await logActivity(req.user.id, 'template.update', 'template', req.params.id);
    res.json(template);
  } catch (e) { next(e); }
});

router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    await prisma.taskTemplate.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'template.delete', 'template', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
