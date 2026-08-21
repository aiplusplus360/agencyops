import prisma from './prisma.js';

/** Create an in-app notification for a user. */
export async function notify(userId, type, title, body = null) {
  if (!userId) return null;
  try {
    return await prisma.notification.create({
      data: { userId, type, title, body },
    });
  } catch (e) {
    console.error('notify failed', e.message);
    return null;
  }
}

/** Record a system/audit activity log entry. */
export async function logActivity(userId, action, entityType = null, entityId = null, meta = null) {
  try {
    return await prisma.activityLog.create({
      data: { userId, action, entityType, entityId, meta: meta ?? undefined },
    });
  } catch (e) {
    console.error('logActivity failed', e.message);
    return null;
  }
}

/** Append a timeline entry to a task's activity feed. */
export async function logTaskActivity(taskId, type, workerId = null, note = null) {
  try {
    return await prisma.taskActivity.create({
      data: { taskId, workerId, type, note },
    });
  } catch (e) {
    console.error('logTaskActivity failed', e.message);
    return null;
  }
}

/** Record an AI decision in the audit trail. */
export async function recordAiDecision(type, decision, { entityId = null, rationale = null, snapshot = null, createdBy = null } = {}) {
  try {
    return await prisma.aiDecision.create({
      data: {
        type,
        entityId,
        decision: decision ?? {},
        rationale,
        snapshot: snapshot ?? undefined,
        createdBy,
      },
    });
  } catch (e) {
    console.error('recordAiDecision failed', e.message);
    return null;
  }
}

/** Log an AI API usage entry for the cost monitor. */
export async function logApiUsage(engine, { model = null, tokensIn = 0, tokensOut = 0, estCostUsd = 0 } = {}) {
  try {
    return await prisma.apiUsageLog.create({
      data: { engine, model, tokensIn, tokensOut, estCostUsd },
    });
  } catch (e) {
    // non-fatal
  }
}

/** Get default settings with fallbacks. */
export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const defaults = {
    rubricWeights: { intent: 0.4, completeness: 0.4, deadline: 0.2 },
    qualityThreshold: 70,
    maxRevisionAttempts: 3,
    escalation: { remind: [24, 4, 1], overdueWindowHours: 48, autoReassignAfterHours: 72 },
    idleStartHours: 24,
    scaling: { enabled: true, minFactor: 0.5, maxFactor: 1.5, upThreshold: 85, downThreshold: 55 },
    autoRefill: { minQueue: 1, batchSize: 2 },
    digest: { dailyEnabled: true, dailyHour: 8, weeklyEnabled: true, weeklyDay: 1, weeklyHour: 8 },
    aiBudgetUsd: 0,
    businessHours: { start: 9, end: 18, timezone: 'UTC' },
    employeeManagement: { createEnabled: true, editEnabled: true },
    webResearchEnabled: true,
    modelSelection: 'auto', // auto | deepseek-v4-pro | deepseek-v4-flash
    watchtower: {
      enabled: true,
      scanMinutes: 1,
      minIntervalMinutes: 10,
      escalationHours: 3,
      minFindings: 1,
      emailTo: '',
    },
  };
  const merged = { ...defaults };
  for (const row of rows) {
    const cur = merged[row.key];
    const isObj = cur && typeof cur === 'object' && !Array.isArray(cur) &&
      row.value && typeof row.value === 'object' && !Array.isArray(row.value);
    merged[row.key] = isObj ? { ...cur, ...row.value } : row.value;
  }
  return merged;
}

export async function setSetting(key, value) {
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Read the employee-management policy (create/edit toggles).
 * Missing rows fall back to fully enabled so the system never locks out
 * silently if a setting is deleted.
 */
export async function getEmployeeManagementPolicy() {
  const s = await getSettings();
  return {
    createEnabled: s.employeeManagement?.createEnabled !== false,
    editEnabled: s.employeeManagement?.editEnabled !== false,
  };
}
