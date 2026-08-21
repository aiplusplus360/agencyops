import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { upload } from '../middleware/upload.js';
import { logActivity } from '../lib/utils.js';
import { indexProductDocument, extractTextFromFile } from '../services/ai/rag.js';
import fs from 'fs';

const router = Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      include: { _count: { select: { documents: true, tasks: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(products);
  } catch (e) { next(e); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const p = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { documents: true, tasks: { take: 20, orderBy: { createdAt: 'desc' } } },
    });
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  } catch (e) { next(e); }
});

router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, description, targetUsers, techStack, goals, fileRefs } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }
    const trimmed = String(name).trim();
    const existing = await prisma.product.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (existing) {
      return res.status(409).json({
        error: `A client named "${existing.name}" already exists in the portfolio.`,
        duplicateId: existing.id,
      });
    }
    const p = await prisma.product.create({
      data: { name: trimmed, description, targetUsers, techStack, goals, fileRefs: fileRefs || undefined },
    });
    await logActivity(req.user.id, 'product.create', 'product', p.id);
    res.status(201).json(p);
  } catch (e) { next(e); }
});

router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, description, targetUsers, techStack, goals, fileRefs, active } = req.body;
    const data = {};
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (targetUsers !== undefined) data.targetUsers = targetUsers;
    if (techStack !== undefined) data.techStack = techStack;
    if (goals !== undefined) data.goals = goals;
    if (fileRefs !== undefined) data.fileRefs = fileRefs;
    if (active !== undefined) data.active = active;
    const p = await prisma.product.update({ where: { id: req.params.id }, data });
    await logActivity(req.user.id, 'product.update', 'product', req.params.id);
    res.json(p);
  } catch (e) { next(e); }
});

router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'product.delete', 'product', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Resolve a product from an AI-proposed change (by id or fuzzy name match). */
async function resolveProduct(change) {
  if (change.productId) {
    const p = await prisma.product.findUnique({ where: { id: change.productId } });
    if (p) return p;
  }
  if (change.productMatch) {
    const q = String(change.productMatch).trim();
    const products = await prisma.product.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    return products[0] || null;
  }
  return null;
}

/**
 * Apply an array of AI-proposed product changes (edit / delete).
 * Each entry is applied independently; one failure never blocks the rest.
 */
router.post('/apply-changes', auth, adminOnly, async (req, res, next) => {
  try {
    const { changes = [] } = req.body;
    if (!Array.isArray(changes) || !changes.length) {
      return res.status(400).json({ error: 'changes must be a non-empty array' });
    }

    const applied = [];
    const errors = [];

    for (const change of changes) {
      const label = change?.productMatch || change?.productId || 'unknown product';
      try {
        const action = String(change?.action || '').toLowerCase();
        if (!['edit', 'delete'].includes(action)) {
          throw new Error(`Unknown action "${change?.action}"`);
        }

        const product = await resolveProduct(change);
        if (!product) throw new Error(`Could not find a product matching "${label}"`);

        if (action === 'delete') {
          await prisma.product.delete({ where: { id: product.id } });
          await logActivity(req.user.id, 'product.delete', 'product', product.id, { reason: change.reason, viaAI: true });
          applied.push({ action, productId: product.id, name: product.name });
        } else {
          const fields = change.fields || {};
          const data = {};
          if (fields.name) data.name = String(fields.name).trim().slice(0, 120);
          if (fields.description !== undefined) data.description = fields.description;
          if (fields.targetUsers !== undefined) data.targetUsers = fields.targetUsers;
          if (fields.techStack !== undefined) data.techStack = fields.techStack;
          if (fields.goals !== undefined) data.goals = fields.goals;
          if (fields.active !== undefined) data.active = !!fields.active;
          if (!Object.keys(data).length) throw new Error('No editable fields provided');
          await prisma.product.update({ where: { id: product.id }, data });
          await logActivity(req.user.id, 'product.update', 'product', product.id, { fields: data, reason: change.reason, viaAI: true });
          applied.push({ action, productId: product.id, name: data.name || product.name, fields: data });
        }
      } catch (e) {
        errors.push({ productMatch: label, action: change?.action, error: e.message });
      }
    }

    const anyApplied = applied.length > 0;
    if (anyApplied) {
      await logActivity(req.user.id, 'product.apply_changes', null, null, { applied: applied.length, errors: errors.length });
    }

    res.status(anyApplied ? 200 : 400).json({ applied, errors });
  } catch (e) { next(e); }
});

// Knowledge base document upload
router.post('/:id/documents', auth, adminOnly, upload.array('files', 5), async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const docs = [];
    for (const f of req.files || []) {
      const text = await extractTextFromFile(f.path, f.mimetype);
      const doc = await indexProductDocument(req.params.id, {
        fileRef: f.path,
        extractedText: text || `[file: ${f.originalname}]`,
      });
      docs.push(doc);
    }
    await logActivity(req.user.id, 'product.document_upload', 'product', req.params.id);
    res.status(201).json(docs);
  } catch (e) { next(e); }
});

export default router;
