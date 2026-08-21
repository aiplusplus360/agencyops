import prisma from '../../lib/prisma.js';

/**
 * Deterministic intelligence layer. Produces sharp, data-grounded
 * recommendations that ALWAYS work — even when the LLM is unavailable —
 * because they're computed from the live database, not generated text.
 */
export async function computeRecommendations({ draft = null, productIds = [] } = {}) {
  const recs = [];

  const [workers, openTasks, dueSoon, settingsRows] = await Promise.all([
    prisma.worker.findMany({
      include: {
        user: { select: { name: true, email: true } },
        skills: { include: { skill: true } },
        assignments: { where: { active: true }, include: { task: { select: { id: true, title: true, deadline: true, priority: true } } } },
      },
    }),
    prisma.task.findMany({
      where: { assignments: { none: { active: true } }, status: { not: 'COMPLETED' } },
      select: { id: true, title: true, skillTags: true, priority: true, deadline: true, effortHours: true },
      orderBy: { priority: 'asc' },
      take: 20,
    }),
    prisma.task.findMany({
      where: { status: { notIn: ['COMPLETED', 'SUBMITTED'] } },
      select: { id: true, title: true, deadline: true, status: true },
      take: 20,
    }),
    prisma.setting.findMany(),
  ]);

  const settings = {};
  for (const row of settingsRows) settings[row.key] = row.value;

  // --- 1. Overload & idle alerts (bandwidth protection) ---
  for (const w of workers) {
    const active = w.assignments.length;
    const cap = w.effectiveCapacity || w.baseCapacity || 3;
    const utilization = cap > 0 ? Math.round((active / cap) * 100) : 0;
    if (active > cap) {
      recs.push({
        type: 'warning',
        icon: '⚡',
        title: `${w.user.name} is overloaded`,
        detail: `${active} active tasks vs capacity of ${cap} (${utilization}%). Reassign or delay something to avoid burnout.`,
      });
    } else if (active === 0 && cap >= 2) {
      recs.push({
        type: 'info',
        icon: '🆓',
        title: `${w.user.name} has a free queue`,
        detail: 'They have no active tasks. Feed them work from the open pool or a new campaign.',
      });
    }
  }

  // --- 2. Deadline risk (next 48h, not started) ---
  const soon = new Date(Date.now() + 48 * 3600 * 1000);
  const atRisk = dueSoon.filter((t) => t.status === 'PENDING' && t.deadline < soon);
  if (atRisk.length) {
    const examples = atRisk.slice(0, 3).map((t) => `"${t.title}" (${t.deadline.toISOString().slice(0, 10)})`).join(', ');
    recs.push({
      type: 'danger',
      icon: '⏰',
      title: `${atRisk.length} task(s) due within 48h haven't started`,
      detail: `${examples}${atRisk.length > 3 ? '…' : ''}. Nudge the assignees or re-prioritize.`,
    });
  }

  // --- 3. Skill gaps in the open pool ---
  const teamSkills = new Set(workers.flatMap((w) => w.skills.map((s) => s.skill.name)));
  const missing = new Set();
  for (const t of openTasks) for (const s of t.skillTags || []) if (!teamSkills.has(s)) missing.add(s);
  if (missing.size) {
    recs.push({
      type: 'warning',
      icon: '🧩',
      title: `Open work needs skills nobody has: ${[...missing].join(', ')}`,
      detail: 'These tasks can\'t be routed to the right person. Hire for this, train someone, or simplify the task.',
    });
  }

  // --- 4. Best-fit assignees for draft tasks (skill match + current load) ---
  if (draft) {
    const allTasks = [
      ...(draft.roadmap || []).flatMap((m) => m.tasks || []),
      ...(draft.suggestedTasks || []),
    ].filter((t) => !t.assignee);
    if (allTasks.length && workers.length) {
      const picks = allTasks.map((task) => {
        const tags = (task.skillTags || []).map((s) => String(s).toLowerCase());
        let best = null;
        let bestScore = -1;
        for (const w of workers) {
          const wSkills = w.skills.map((s) => s.skill.name.toLowerCase());
          const overlap = tags.filter((t) => wSkills.includes(t)).length;
          const loadPenalty = w.assignments.length / Math.max(1, w.effectiveCapacity || w.baseCapacity || 3);
          const score = overlap - loadPenalty * 1.5;
          if (score > bestScore) {
            bestScore = score;
            best = w;
          }
        }
        return { task: task.title, worker: best ? best.user.name : null, score: bestScore };
      });
      const good = picks.filter((p) => p.worker && p.score >= 0);
      if (good.length) {
        recs.push({
          type: 'assign',
          icon: '🎯',
          title: 'Best-fit assignees for unassigned draft tasks',
          detail: good.slice(0, 5).map((p) => `"${p.task}" → ${p.worker}`).join(' · '),
        });
      }
    }
  }

  // --- 5. Duplicate-ish planning nudge ---
  if (draft?.roadmap?.length) {
    const total = draft.roadmap.reduce((n, m) => n + (m.tasks?.length || 0), 0);
    const suggested = draft.suggestedTasks?.length || 0;
    if (total > 0) {
      recs.push({
        type: 'info',
        icon: '📊',
        title: `Draft plan has ${total} task(s) + ${suggested} suggested`,
        detail: productIds?.length
          ? 'Linked to a product, so tasks will inherit the product context and reference it in the registry.'
          : 'No product linked — link one so the AI can use the product memory (targeting, stack, goals).',
      });
    }
  }

  return recs;
}
