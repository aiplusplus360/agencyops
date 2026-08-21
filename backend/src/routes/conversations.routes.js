import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';

const router = Router();

/** List conversations for the admin (title, updated, message count, preview). */
router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { content: true } },
      },
    });
    res.json(
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        messageCount: c._count.messages,
        preview: c.messages[0]?.content?.slice(0, 80) || '',
      }))
    );
  } catch (e) { next(e); }
});

/** Create a new conversation. */
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim().slice(0, 120) || 'New conversation';
    const conversation = await prisma.conversation.create({
      data: { userId: req.user.id, title },
    });
    res.status(201).json(conversation);
  } catch (e) { next(e); }
});

/** Full message history for a conversation. */
router.get('/:id/messages', auth, adminOnly, async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ conversation, messages });
  } catch (e) { next(e); }
});

/** Rename a conversation. */
router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const existing = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });
    const title = String(req.body?.title || '').trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const conversation = await prisma.conversation.update({
      where: { id: existing.id },
      data: { title },
    });
    res.json(conversation);
  } catch (e) { next(e); }
});

/** Delete a conversation (and its messages). */
router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const existing = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });
    await prisma.conversation.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
