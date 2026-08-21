import prisma from '../../lib/prisma.js';
import { chat, parseJson } from './client.js';

/**
 * Duplicate detection engine.
 * Before a brain-dump is decomposed, cross-reference its intent against
 * existing tasks/roadmaps and flag probable overlaps.
 */
export async function detectDuplicates(rawText) {
  const existing = await prisma.task.findMany({
    where: { status: { not: 'COMPLETED' } },
    select: { id: true, title: true, description: true },
    take: 200,
  });
  if (!existing.length) return [];

  const corpus = existing
    .map((t) => `- [${t.id}] ${t.title}: ${(t.description || '').slice(0, 120)}`)
    .join('\n');

  const content = await chat('duplicates', [
    {
      role: 'system',
      content:
        'You detect task duplication. Given a new brain-dump and the existing task list, return JSON { "flags": [{ "taskId": "...", "reason": "why it overlaps" }] }. Return [] if no overlap.',
    },
    { role: 'user', content: `BRAIN-DUMP:\n${rawText}\n\nEXISTING TASKS:\n${corpus}` },
  ], { temperature: 0.1, json: true }).catch(() => null);

  if (content) {
    const parsed = parseJson(content);
    if (parsed?.flags) return parsed.flags;
  }
  return [];
}
