import prisma from '../../lib/prisma.js';
import { logTaskActivity, notify, recordAiDecision } from '../../lib/utils.js';
import { suggestForTask, assignTask } from './matching.js';
import { emitToAdmins } from '../realtime.js';

/**
 * Handle a worker reporting they cannot do a task:
 * re-route to the next-best available worker; if none, flag to admin.
 */
export async function rerouteTask(taskId, currentWorkerId, { note = null } = {}) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  // Deactivate current assignment
  const current = await prisma.assignment.findFirst({
    where: { taskId, workerId: currentWorkerId, active: true },
  });
  if (current) {
    await prisma.assignment.update({ where: { id: current.id }, data: { active: false } });
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: 'PENDING' } });
  await logTaskActivity(taskId, 'status_change', currentWorkerId,
    `Worker reported unable to complete. Re-routing.${note ? ` Note: ${note}` : ''}`);

  const shortlist = await suggestForTask(task);
  const next = shortlist.find((s) => s.workerId !== currentWorkerId && !s.overloaded) || shortlist[0];

  await recordAiDecision('REASSIGN', { taskId, from: currentWorkerId, to: next?.workerId || null }, {
    entityId: taskId,
    rationale: 'Worker reported cannot-do; rerouted to next best match.',
  });

  if (next) {
    await assignTask(taskId, next.workerId, { assignedBy: 'AI', rationale: `Re-routed from blocked worker (score ${next.score}).` });
    await notify(currentWorkerId ? (await prisma.worker.findUnique({ where: { id: currentWorkerId } }))?.userId : null,
      'task_rerouted', 'Task reassigned', `"${task.title}" was reassigned to another teammate.`);
    emitToAdmins('team_update', { type: 'task_rerouted', taskId, title: task.title, toWorkerId: next.workerId });
    return { reassignedTo: next.workerId, score: next.score };
  }

  // No eligible worker — flag for admin
  await notify(null, 'reroute_failed', 'Task could not be re-routed', `${task.title} has no available worker.`);
  emitToAdmins('alert', { type: 'reroute_failed', taskId, title: task.title });
  return { reassignedTo: null };
}
