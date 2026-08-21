import prisma from '../../lib/prisma.js';

/**
 * Estimation accuracy engine.
 * Compares AI effort estimates to actual completion time (assignment → confirmation)
 * and computes a per-worker accuracy metric.
 */
export async function recordEstimationAccuracy(workerId) {
  const assignments = await prisma.assignment.findMany({
    where: { workerId, confirmedAt: { not: null } },
    include: { task: true },
    orderBy: { confirmedAt: 'desc' },
    take: 50,
  });

  const samples = assignments
    .map((a) => {
      const start = a.startedAt || a.assignedAt;
      const actualHours = (a.confirmedAt.getTime() - start.getTime()) / 3600000;
      const est = a.task.effortHours || 1;
      const ratio = actualHours / est; // 1.0 = perfect
      return { taskId: a.taskId, est, actualHours: Math.round(actualHours), ratio };
    })
    .filter((s) => s.actualHours > 0);

  if (!samples.length) return { workerId, accuracy: null, samples: 0 };

  // accuracy = 100 - mean absolute percentage error
  const mape = samples.reduce((s, x) => s + Math.min(3, Math.abs(x.ratio - 1)), 0) / samples.length;
  const accuracy = Math.max(0, Math.round(100 - mape * 100));

  return { workerId, accuracy, samples: samples.length, samples };
}
