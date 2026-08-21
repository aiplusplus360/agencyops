import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { getSettings, setSetting, logActivity } from '../lib/utils.js';
import { sendTestEmail } from '../services/email.js';

const router = Router();

router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (e) { next(e); }
});

router.patch('/', auth, adminOnly, async (req, res, next) => {
  try {
    const allowedKeys = [
      'rubricWeights', 'qualityThreshold', 'maxRevisionAttempts', 'escalation',
      'idleStartHours', 'scaling', 'autoRefill', 'digest', 'businessHours', 'aiBudgetUsd',
      'employeeManagement', 'webResearchEnabled', 'modelSelection', 'watchtower',
    ];
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        await setSetting(key, req.body[key]);
      }
    }
    await logActivity(req.user.id, 'settings.update');
    res.json(await getSettings());
  } catch (e) { next(e); }
});

/** Review learning adjustments from admin overrides. */
router.get('/learning-adjustments', auth, adminOnly, async (req, res, next) => {
  try {
    const adjustments = await prisma.learningAdjustment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(adjustments.map((a) => ({
      id: a.id,
      adjustmentType: a.overrideType,
      description: a.note || (a.adjustment?.delta != null
        ? `Quality score changed ${a.adjustment.before} → ${a.adjustment.after} (${a.adjustment.delta >= 0 ? '+' : ''}${a.adjustment.delta})`
        : JSON.stringify(a.adjustment)),
      applied: a.applied,
      createdAt: a.createdAt,
    })));
  } catch (e) { next(e); }
});

/** Revert a learning adjustment (deletes it). */
router.delete('/learning-adjustments/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const existing = await prisma.learningAdjustment.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Learning adjustment not found' });
    await prisma.learningAdjustment.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'learning.revert', 'learningAdjustment', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/test-email', auth, adminOnly, async (req, res, next) => {
  try {
    const to = req.body.to || req.user.email;
    const result = await sendTestEmail(to);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
