import prisma from '../../lib/prisma.js';

/**
 * Build a compact, data-grounded snapshot of the agency's current
 * operational state so the AI-COO can reason from REAL numbers instead
 * of guessing. Include only enough for the model to give sharp advice.
 */
export async function buildOpsContext() {
  const [workers, openTasks, recentEvaluations, dueSoon, aiBudget] = await Promise.all([
    prisma.worker.findMany({
      include: {
        user: { select: { name: true, email: true, active: true } },
        skills: { include: { skill: true } },
        assignments: {
          where: { active: true },
          include: { task: { select: { id: true, title: true, status: true, deadline: true, priority: true } } },
        },
      },
    }),
    prisma.task.findMany({
      where: { assignments: { none: { active: true } }, status: { not: 'COMPLETED' } },
      select: { id: true, title: true, skillTags: true, priority: true, deadline: true, effortHours: true },
      orderBy: { priority: 'asc' },
      take: 20,
    }),
    prisma.evaluation.findMany({
      orderBy: { evaluatedAt: 'desc' },
      take: 200,
      select: {
        submission: { select: { workerId: true } },
        qualityScore: true,
        verdict: true,
      },
    }),
    prisma.task.findMany({
      where: { status: { notIn: ['COMPLETED', 'SUBMITTED'] } },
      select: { id: true, title: true, deadline: true, status: true, assignments: { where: { active: true }, include: { worker: { include: { user: { select: { name: true } } } } } } },
      take: 20,
    }),
    prisma.setting.findUnique({ where: { key: 'aiBudgetUsd' } }),
  ]);

  const perfMap = {};
  for (const ev of recentEvaluations) {
    const wid = ev.submission?.workerId;
    if (!wid) continue;
    perfMap[wid] = perfMap[wid] || { sum: 0, n: 0, passes: 0 };
    perfMap[wid].sum += ev.qualityScore;
    perfMap[wid].n += 1;
    if (ev.verdict === 'PASS') perfMap[wid].passes += 1;
  }

  const team = workers.map((w) => {
    const active = w.assignments.length;
    const perf = perfMap[w.workerId] || { sum: 0, n: 0, passes: 0 };
    return {
      name: w.user.name,
      skills: w.skills.map((s) => s.skill.name),
      tier: w.seniorityTier,
      activeTasks: active,
      capacity: w.effectiveCapacity,
      utilization: w.effectiveCapacity > 0 ? Math.round((active / w.effectiveCapacity) * 100) : 0,
      avgScore: perf.n ? Math.round((perf.sum / perf.n) * 10) / 10 : null,
      passRate: perf.n ? Math.round((perf.passes / perf.n) * 100) : null,
    };
  });

  const teamLine = team.length
    ? team.map((t) => `${t.name}: ${t.activeTasks}/${t.capacity} tasks (${t.utilization}%), skills=[${t.skills.join(', ') || 'none'}], avgQuality=${t.avgScore ?? 'n/a'}, passRate=${t.passRate ?? 'n/a'}%`).join('\n')
    : 'no employees yet';

  const openLine = openTasks.length
    ? openTasks.map((t) => `- [P${t.priority}] ${t.title} (needs: ${(t.skillTags || []).join(', ') || 'any'}, ${t.effortHours}h, due ${t.deadline.toISOString().slice(0, 10)})`).join('\n')
    : 'no open-pool tasks';

  const dueLine = dueSoon.length
    ? dueSoon.map((t) => `- ${t.title} [${t.status}] due ${t.deadline.toISOString().slice(0, 10)} — ${t.assignments[0]?.worker?.user?.name || 'unassigned'}`).join('\n')
    : 'no active deadlines';

  const skillCoverage = new Set();
  for (const t of openTasks) for (const s of t.skillTags || []) skillCoverage.add(s);
  const teamSkills = new Set(team.flatMap((t) => t.skills));
  const missingSkills = [...skillCoverage].filter((s) => !teamSkills.has(s));

  return {
    budgetUsd: aiBudget?.value ?? 0,
    text: `OPERATIONS SNAPSHOT (live data — use it to ground your advice):
TEAM LOAD & SKILLS:
${teamLine}

OPEN POOL (unassigned work needing routing):
${openLine}

DEADLINES IN FLIGHT:
${dueLine}

SKILL GAPS (open work with no skilled employee):
${missingSkills.length ? missingSkills.join(', ') : 'none'}`,
    team,
    openPool: openTasks,
    missingSkills,
  };
}
