import prisma from '../../lib/prisma.js';
import { getSettings, recordAiDecision } from '../../lib/utils.js';
import { assignTask } from './matching.js';
import { chat, parseJson } from './client.js';
import { emitToAdmins } from '../realtime.js';

/**
 * Adaptive workload & complexity scaling.
 * Recomputes effective capacity and complexity direction per worker
 * based on recent velocity, quality trend, on-time rate, and revisions.
 */
export async function recomputeScaling(workerId) {
  const settings = await getSettings();
  const policy = settings.scaling;
  if (!policy.enabled) return null;

  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker || worker.scalingLocked) return worker;

  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000); // last 14 days

  const [completed, evaluations, overdue, revisions] = await Promise.all([
    prisma.task.count({
      where: {
        assignments: { some: { workerId, confirmedAt: { gte: since } } },
        status: 'COMPLETED',
      },
    }),
    prisma.evaluation.findMany({
      where: { submission: { workerId }, evaluatedAt: { gte: since } },
      orderBy: { evaluatedAt: 'asc' },
      select: { qualityScore: true, deadlineScore: true, verdict: true },
    }),
    prisma.evaluation.count({
      where: { submission: { workerId }, deadlineScore: { lt: 60 }, evaluatedAt: { gte: since } },
    }),
    prisma.revision.count({ where: { workerId, createdAt: { gte: since } } }),
  ]);

  const n = evaluations.length;
  const avgQuality = n ? evaluations.reduce((s, e) => s + e.qualityScore, 0) / n : null;
  const passRate = n ? evaluations.filter((e) => e.verdict === 'PASS').length / n : null;

  let factor = worker.scalingFactor || 1.0;
  let state = 'STEADY';

  if (avgQuality !== null && passRate !== null) {
    if (avgQuality >= policy.upThreshold && passRate >= 0.8) {
      factor = Math.min(policy.maxFactor, factor + 0.2);
      state = 'UP';
    } else if (avgQuality < policy.downThreshold || passRate < 0.5 || overdue >= 2) {
      factor = Math.max(policy.minFactor, factor - 0.2);
      state = 'DOWN';
    }
  }

  const effectiveCapacity = Math.max(1, Math.round(worker.baseCapacity * factor));

  // Only persist when something changed
  if (
    factor !== worker.scalingFactor ||
    effectiveCapacity !== worker.effectiveCapacity ||
    state !== worker.scalingState
  ) {
    await prisma.worker.update({
      where: { id: workerId },
      data: { scalingFactor: factor, effectiveCapacity, scalingState: state },
    });
    await recordAiDecision('CAPACITY_SCALING', {
      workerId,
      factor,
      effectiveCapacity,
      state,
      telemetry: { avgQuality, passRate, completed, overdue, revisions },
    }, {
      entityId: workerId,
      rationale: `${state === 'UP' ? 'Sustained high performance' : state === 'DOWN' ? 'Performance below thresholds' : 'Steady'} — avg quality ${avgQuality?.toFixed(0) ?? 'n/a'}, pass rate ${passRate?.toFixed(2) ?? 'n/a'}, ${overdue} late, ${revisions} revisions.`,
    });
  }

  return { workerId, scalingFactor: factor, effectiveCapacity, scalingState: state };
}

/** Recompute scaling for all workers. */
export async function recomputeAllScaling() {
  const workers = await prisma.worker.findMany();
  const results = [];
  for (const w of workers) {
    results.push(await recomputeScaling(w.id));
  }
  return results;
}

/**
 * Forecast a worker's projected load over the next N days from active deadlines.
 */
export async function forecastWorkerLoad(workerId, days = 7) {
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker) return null;

  const assignments = await prisma.assignment.findMany({
    where: { workerId, active: true, task: { status: { notIn: ['SUBMITTED', 'COMPLETED'] } } },
    include: { task: true },
  });

  const now = Date.now();
  const horizon = now + days * 24 * 3600 * 1000;
  const projected = assignments.filter((a) => a.task.deadline.getTime() <= horizon);

  const effCap = worker.effectiveCapacity || worker.baseCapacity || 3;
  const activeCount = assignments.length;
  const arriving = projected.length;

  const projectedLoad = Math.max(activeCount, arriving + Math.round(activeCount / 2));
  const overloadExpected = projectedLoad > effCap;

  if (overloadExpected) {
    await recordAiDecision('FORECAST', { workerId, projectedLoad, effCap, days }, {
      entityId: workerId,
      rationale: `Projected load ${projectedLoad} exceeds effective capacity ${effCap} within ${days} days.`,
    });
    const w = await prisma.worker.findUnique({
      where: { id: workerId },
      include: { user: { select: { name: true } } },
    });
    emitToAdmins('alert', {
      type: 'overload_forecast',
      workerId,
      workerName: w?.user?.name || workerId,
      projectedLoad,
      capacity: effCap,
    });
  }

  return {
    workerId,
    activeCount,
    projectedLoad,
    effectiveCapacity: effCap,
    overloadExpected,
    overloadByDays: overloadExpected ? Math.ceil((projectedLoad - effCap) / Math.max(1, arriving)) : 0,
  };
}

export async function forecastAllWorkers(days = 7) {
  const workers = await prisma.worker.findMany();
  const results = [];
  for (const w of workers) {
    results.push(await forecastWorkerLoad(w.id, days));
  }
  return results.filter(Boolean);
}
