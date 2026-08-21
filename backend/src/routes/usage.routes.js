import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { getSettings, notify } from '../lib/utils.js';
import { emitToAdmins } from '../services/realtime.js';

const router = Router();

/** AI cost & usage rollups. */
router.get('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { engine, days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const where = { createdAt: { gte: since } };
    if (engine) where.engine = engine;

    const logs = await prisma.apiUsageLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });
    const totalCost = logs.reduce((s, l) => s + l.estCostUsd, 0);
    const totalTokens = logs.reduce((s, l) => s + l.tokensIn + l.tokensOut, 0);

    const byEngine = {};
    for (const l of logs) {
      if (!byEngine[l.engine]) byEngine[l.engine] = { calls: 0, cost: 0, tokens: 0 };
      byEngine[l.engine].calls++;
      byEngine[l.engine].cost += l.estCostUsd;
      byEngine[l.engine].tokens += l.tokensIn + l.tokensOut;
    }

    // Budget alert check
    const settings = await getSettings();
    const budget = Number(settings.aiBudgetUsd) || 0;
    let budgetAlert = null;
    if (budget > 0 && totalCost > budget) {
      budgetAlert = { budget, spent: Math.round(totalCost * 10000) / 10000, exceeded: totalCost - budget };
      await notify(null, 'ai_budget', 'AI budget exceeded',
        `AI spend $${Math.round(totalCost * 10000) / 10000} is over the $${budget} budget.`);
      emitToAdmins('alert', { type: 'ai_budget', ...budgetAlert });
    }

    res.json({
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalCalls: logs.length,
      totalTokens,
      budget: budget > 0 ? budget : null,
      budgetAlert,
      byEngine: Object.entries(byEngine).map(([name, v]) => ({
        engine: name, calls: v.calls, cost: Math.round(v.cost * 10000) / 10000, tokens: v.tokens,
      })),
      recent: logs.slice(0, 50),
    });
  } catch (e) { next(e); }
});

export default router;
