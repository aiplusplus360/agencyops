import prisma from '../../lib/prisma.js';

/**
 * RESEARCH ENGINE
 *
 * Before the AI-COO answers, we gather targeted, live evidence about the
 * exact things the owner is talking about — mentioned products, mentioned
 * employees, relevant skills, recent activity, deadlines, past AI decisions
 * and long-term memory. The result is a "research dossier" that grounds the
 * reply so the AI never guesses, invents, or forgets.
 */

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if a word/phrase appears as a whole word in the haystack. */
function mentions(haystack, phrase) {
  const p = String(phrase).trim();
  if (!p || p.length < 2) return false;
  return new RegExp(`\\b${esc(p.toLowerCase())}\\b`).test(haystack.toLowerCase());
}

/** Match employee names (first name, last name, or full name) in the message. */
function findMentionedWorkers(text, workers) {
  const lower = ` ${text.toLowerCase()} `;
  return workers
    .filter((w) => {
      const name = w.user?.name || '';
      const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
      // Full name, first name, or any meaningful token appears as a word.
      return parts.some((part) => mentions(lower, part));
    })
    .slice(0, 5);
}

/** Match product names in the message (full name or distinctive token). */
function findMentionedProducts(text, products) {
  const lower = ` ${text.toLowerCase()} `;
  return products
    .filter((p) => {
      const name = p.name || '';
      const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
      return mentions(lower, name) || tokens.some((t) => mentions(lower, t));
    })
    .slice(0, 5);
}

/** Match known marketing skills mentioned in the message. */
function findMentionedSkills(text, skills) {
  const lower = text.toLowerCase();
  return skills.filter((s) => mentions(lower, s.name)).slice(0, 8);
}

/**
 * Build a compact but rich research dossier for the current chat turn.
 * Returns a formatted text block (for the prompt) plus structured data.
 */
export async function buildResearchDossier({ userId, text, history = [], productIds = [] }) {
  const [
    allWorkers,
    allProducts,
    allSkills,
    recentTasks,
    recentEvals,
    recentDecisions,
    deadlines,
    openPool,
  ] = await Promise.all([
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
    prisma.product.findMany({ orderBy: { name: 'asc' } }),
    prisma.skill.findMany({ orderBy: { name: 'asc' } }),
    prisma.task.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: {
        assignments: { where: { active: false }, include: { worker: { include: { user: { select: { name: true } } } } } },
      },
    }),
    prisma.evaluation.findMany({
      orderBy: { evaluatedAt: 'desc' },
      take: 12,
      include: {
        submission: {
          select: {
            workerId: true,
            worker: { include: { user: { select: { name: true } } } },
            task: { select: { title: true } },
          },
        },
      },
    }),
    prisma.aiDecision.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.task.findMany({
      where: { status: { notIn: ['COMPLETED', 'SUBMITTED'] } },
      orderBy: { deadline: 'asc' },
      take: 8,
      include: {
        assignments: { where: { active: true }, include: { worker: { include: { user: { select: { name: true } } } } } },
      },
    }),
    prisma.task.findMany({
      where: { assignments: { none: { active: true } }, status: { not: 'COMPLETED' } },
      orderBy: { priority: 'asc' },
      take: 10,
      select: { id: true, title: true, skillTags: true, priority: true, deadline: true, effortHours: true },
    }),
  ]);

  const mentionedWorkers = findMentionedWorkers(text, allWorkers);
  const mentionedProducts = findMentionedProducts(text, allProducts);
  const mentionedSkills = findMentionedSkills(text, allSkills);

  // Performance profile per mentioned worker.
  const workerDetail = mentionedWorkers.map((w) => {
    const evals = recentEvals.filter((e) => e.submission?.workerId === w.id);
    const scores = evals.map((e) => e.qualityScore);
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    const passes = evals.filter((e) => e.verdict === 'PASS').length;
    return {
      name: w.user.name,
      email: w.user.email,
      tier: w.seniorityTier,
      skills: w.skills.map((s) => s.skill.name),
      active: w.assignments.length,
      capacity: w.effectiveCapacity || w.baseCapacity,
      availability: w.availability,
      avgQuality: avg,
      passRate: evals.length ? Math.round((passes / evals.length) * 100) : null,
      recentVerdicts: evals.slice(0, 3).map((e) => `${e.verdict} (${Math.round(e.qualityScore)})`),
    };
  });

  // Product detail for mentioned products.
  const productDetail = mentionedProducts.map((p) => {
    const productTasks = recentTasks.filter((t) => t.productId === p.id);
    return {
      name: p.name,
      description: p.description || '',
      targetUsers: p.targetUsers || '',
      techStack: p.techStack || '',
      goals: p.goals || '',
      recentWork: productTasks.slice(0, 3).map((t) => t.title),
    };
  });

  // ---- Assemble the dossier text ----
  const lines = [];
  lines.push('RESEARCH DOSSIER — live evidence pulled for this request (use it, never contradict it):');

  if (mentionedWorkers.length) {
    lines.push('');
    lines.push('MENTIONED EMPLOYEES:');
    for (const d of workerDetail) {
      lines.push(
        `- ${d.name} (${d.tier}, ${d.active}/${d.capacity} active, ${d.availability}) skills=[${d.skills.join(', ') || 'none'}] avgQuality=${d.avgQuality ?? 'n/a'} passRate=${d.passRate ?? 'n/a'}% lastVerdicts=[${d.recentVerdicts.join(', ') || 'none'}]`
      );
    }
  }

  if (mentionedProducts.length) {
    lines.push('');
    lines.push('MENTIONED PRODUCTS:');
    for (const p of productDetail) {
      lines.push(`- ${p.name}: ${p.description || 'no description'} | target: ${p.targetUsers || 'n/a'} | stack: ${p.techStack || 'n/a'} | goals: ${p.goals || 'n/a'}${p.recentWork.length ? ` | recent work: ${p.recentWork.join('; ')}` : ''}`);
    }
  }

  if (mentionedSkills.length) {
    lines.push('');
    lines.push(`MENTIONED SKILLS: ${mentionedSkills.map((s) => s.name).join(', ')}`);
  }

  lines.push('');
  lines.push('TEAM LOAD (all):');
  lines.push(
    allWorkers.length
      ? allWorkers.map((w) => `${w.user.name}: ${w.assignments.length}/${w.effectiveCapacity || w.baseCapacity} active`).join(' | ')
      : 'no employees yet'
  );

  if (deadlines.length) {
    lines.push('');
    lines.push('DEADLINES IN FLIGHT (soonest first):');
    for (const t of deadlines) {
      const who = t.assignments[0]?.worker?.user?.name || 'unassigned';
      lines.push(`- ${t.title} [${t.status}] due ${t.deadline.toISOString().slice(0, 10)} (${who})`);
    }
  }

  if (openPool.length) {
    lines.push('');
    lines.push('OPEN POOL (unassigned work waiting):');
    for (const t of openPool) {
      lines.push(`- [P${t.priority}] ${t.title} (needs: ${(t.skillTags || []).join(', ') || 'any'}, ${t.effortHours}h, due ${t.deadline.toISOString().slice(0, 10)})`);
    }
  }

  if (recentEvals.length) {
    lines.push('');
    lines.push('RECENT EVALUATIONS:');
    for (const e of recentEvals.slice(0, 6)) {
      const who = e.submission?.worker?.user?.name || 'unknown';
      lines.push(`- ${e.submission?.task?.title || 'task'} → ${who}: ${e.verdict} (${Math.round(e.qualityScore)}/100)`);
    }
  }

  if (recentTasks.length) {
    lines.push('');
    lines.push('RECENTLY COMPLETED:');
    for (const t of recentTasks.slice(0, 5)) {
      const who = t.assignments?.[0]?.worker?.user?.name || 'unknown';
      lines.push(`- ${t.title} (by ${who})`);
    }
  }

  if (recentDecisions.length) {
    lines.push('');
    lines.push('RECENT AI DECISIONS:');
    for (const d of recentDecisions) {
      lines.push(`- ${d.type} @ ${d.createdAt.toISOString().slice(0, 10)}${d.rationale ? ` — ${d.rationale.slice(0, 120)}` : ''}`);
    }
  }

  return {
    text: lines.join('\n'),
    mentionedWorkers: workerDetail,
    mentionedProducts: productDetail,
    mentionedSkills: mentionedSkills.map((s) => s.name),
    teamLoad: allWorkers.map((w) => ({ name: w.user.name, active: w.assignments.length, capacity: w.effectiveCapacity || w.baseCapacity })),
    workerNames: allWorkers.map((w) => w.user.name),
    productNames: allProducts.map((p) => p.name),
  };
}
