import prisma from '../../lib/prisma.js';
import { recordAiDecision } from '../../lib/utils.js';

/**
 * Adaptive learning from admin overrides.
 * When an admin overrides a score or reassigns, we capture the deviation
 * and (when a pattern emerges) persist a learning adjustment that tunes
 * rubric weights or matching preferences.
 */
export async function captureOverride({ type, aiDecisionRef, adjustment, note = null, createdBy }) {
  return prisma.learningAdjustment.create({
    data: {
      aiDecisionRef,
      overrideType: type,
      adjustment,
      note,
      createdBy,
    },
  });
}

/** Called when an admin overrides an evaluation score. */
export async function learnFromScoreOverride({ submissionId, before, after, adminId }) {
  const delta = after - before;
  const adjustment = { submissionId, before, after, delta };

  await captureOverride({
    type: 'SCORE',
    aiDecisionRef: submissionId,
    adjustment,
    note: `Admin changed quality score from ${before} to ${after}.`,
    createdBy: adminId,
  });

  await recordAiDecision('LEARNING_ADJUSTMENT', adjustment, {
    entityId: submissionId,
    rationale: 'Recorded admin score override for learning.',
    createdBy: adminId,
  });

  // Detect pattern: consistent over-grading → nudge completeness weight up
  if (Math.abs(delta) >= 15) {
    const recent = await prisma.learningAdjustment.count({
      where: { overrideType: 'SCORE', createdAt: { gte: new Date(Date.now() - 14 * 864e5) } },
    });
    if (recent >= 3) {
      const settings = await prisma.setting.findUnique({ where: { key: 'rubricWeights' } });
      const weights = (settings?.value) || { intent: 0.4, completeness: 0.4, deadline: 0.2 };
      // shift 0.05 weight from the dimension toward completeness
      const newWeights = {
        intent: Math.max(0.1, weights.intent - 0.05),
        completeness: Math.min(0.8, weights.completeness + 0.05),
        deadline: weights.deadline,
      };
      await prisma.setting.upsert({
        where: { key: 'rubricWeights' },
        update: { value: newWeights },
        create: { key: 'rubricWeights', value: newWeights },
      });
      return { adjustedRubric: newWeights };
    }
  }
  return null;
}
