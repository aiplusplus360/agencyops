import prisma from '../../lib/prisma.js';
import { chat, parseJson } from './client.js';
import { logger } from '../../lib/logger.js';

/**
 * Persistent long-term memory for the AI-COO.
 *
 * After every chat exchange the AI extracts durable knowledge (facts,
 * preferences, decisions, lessons) about the agency owner's business and
 * stores it as Memory rows. On every new chat request, the most relevant
 * memories are injected into the prompt so the AI "knows everything" the
 * owner has told it — across conversations, sessions and restarts.
 */

const EXTRACT_SYSTEM = `You are the long-term memory system of AgencyOps AI-COO. Given a conversation exchange between the agency owner and the AI-COO, extract only DURABLE knowledge the AI should remember forever:

- FACTS about the business, team, products, budget, processes
- PREFERENCES (how the owner likes to work, what they avoid, style choices)
- DECISIONS (approved directions, chosen platforms, commitments made)
- LESSONS (what worked or failed in the past)

Do NOT extract:
- One-off work requests or campaign briefs (those become tasks, not memory)
- Greetings, small talk, or transient messages
- Anything already fully visible in the product or team registries (unless it adds a new durable detail)

Return JSON exactly: {"memories":[{"type":"FACT|PREFERENCE|DECISION|LESSON","content":"one concise factual statement","category":"client|team|process|budget|preference|other"}]}
- Keep each content under 120 characters, written as a standalone statement the AI can reuse.
- Return at most 5 memories. If nothing worth remembering, return {"memories":[]}.`;

/** Ask the LLM to extract durable memories from one exchange. Best effort. */
export async function extractMemoriesFromExchange(userMsg, aiReply) {
  if (!userMsg || String(userMsg).trim().length < 12) return [];
  try {
    const content = await chat(
      'memoryExtract',
      [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `OWNER: ${String(userMsg).slice(0, 3000)}\n\nAI-COO: ${String(aiReply || '').slice(0, 2000)}` },
      ],
      { temperature: 0.2, json: true, maxTokens: 600, attempts: 2 }
    ).catch(() => null);
    if (!content) return [];
    const parsed = parseJson(content);
    const mems = Array.isArray(parsed?.memories) ? parsed.memories : [];
    return mems
      .filter((m) => m?.content && String(m.content).trim().length >= 8)
      .map((m) => ({
        type: ['FACT', 'PREFERENCE', 'DECISION', 'LESSON'].includes(String(m.type).toUpperCase())
          ? String(m.type).toUpperCase()
          : 'FACT',
        content: String(m.content).trim().slice(0, 300),
        category: String(m.category || 'other').trim().slice(0, 40) || 'other',
      }))
      .slice(0, 5);
  } catch (e) {
    return [];
  }
}

/** Deterministic fallback extraction for when the LLM is unavailable. */
export function fallbackExtractMemories(userMsg) {
  const clean = String(userMsg || '').replace(/\s+/g, ' ').trim();
  const mems = [];
  const prefPatterns = [
    /\b(?:we|i|the team|they)\s+(?:don't|do not|never|always|prefer|prefers|avoid|hate|love|insist)\b[^.!?\n]{8,140}/gi,
  ];
  for (const re of prefPatterns) {
    const m = clean.match(re);
    if (m) mems.push({ type: 'PREFERENCE', content: m[0].trim().slice(0, 300), category: 'preference' });
  }
  const budget = clean.match(/\bbudget\s+(?:is|of|around)\s+[^.!?\n]{2,70}/gi) || clean.match(/\b(?:monthly|daily)\s+spend\b[^.!?\n]{2,80}/gi);
  if (budget) mems.push({ type: 'FACT', content: budget[0].trim().slice(0, 300), category: 'budget' });
  // Team roster: "names are X, Y and Z" or "team is X, Y, Z"
  const roster =
    clean.match(/(?:names? (?:are|called)|team (?:is|members? are)|employees? (?:are|called))\s+([a-zA-Z][a-zA-Z ,'&-]{3,90})/i) ||
    clean.match(/(?:employees?|team|girls?):\s*([a-zA-Z][a-zA-Z ,'&-]{3,90})/i);
  if (roster) {
    const names = roster[1]
      .replace(/\.$/, '')
      .split(/,|\band\b/gi)
      .map((n) => n.trim().replace(/^[a-z]/, (c) => c.toUpperCase()))
      .filter(Boolean);
    if (names.length >= 2) {
      mems.push({ type: 'FACT', content: `Team members: ${names.slice(0, 8).join(', ')}`, category: 'team' });
    }
  }
  return mems.slice(0, 5);
}

/** Normalize a memory for near-duplicate detection. */
function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True when two memories are near-duplicates. */
function similar(a, b) {
  if (a === b) return true;
  const wa = a.split(' ').filter(Boolean);
  const wb = b.split(' ').filter(Boolean);
  if (wa.length < 6 || wb.length < 6) return false;
  const set = new Set(wa);
  const overlap = wb.filter((w) => set.has(w)).length;
  return overlap / Math.max(wa.length, wb.length) >= 0.6;
}

/** Save extracted memories, skipping near-duplicates. Returns count added. */
export async function saveMemories(userId, memories, source = 'chat') {
  if (!userId || !memories?.length) return 0;
  const existing = await prisma.memory.findMany({ where: { userId }, select: { content: true } });
  const existingNorm = new Set(existing.map((m) => normalize(m.content)));
  let added = 0;
  for (const mem of memories.slice(0, 5)) {
    const norm = normalize(mem.content);
    if ([...existingNorm].some((e) => similar(e, norm))) continue;
    try {
      await prisma.memory.create({
        data: {
          userId,
          type: mem.type || 'FACT',
          content: mem.content,
          category: mem.category || 'other',
          source: source || 'chat',
        },
      });
      existingNorm.add(norm);
      added++;
    } catch (e) {
      logger.warn('[AI] failed to save memory:', e.message);
    }
  }
  return added;
}

/** Build the memory block injected into the AI prompt, ranked by relevance. */
export async function getMemoryContext(userId, query = '') {
  const memories = await prisma.memory.findMany({
    where: { userId },
    orderBy: [{ important: 'desc' }, { updatedAt: 'desc' }],
    take: 60,
  });
  if (!memories.length) return { text: '', list: [] };

  const qWords = new Set(String(query).toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const scored = memories
    .map((m) => {
      const words = m.content.toLowerCase().split(/\W+/);
      const relevance = qWords.size ? words.filter((w) => qWords.has(w)).length : 0;
      return { m, relevance: relevance + (m.important ? 2 : 0) };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 25);

  const list = scored.map((s) => s.m);
  const text = list.map((m) => `- [${m.type}] ${m.content}${m.important ? ' (★ pinned)' : ''}`).join('\n');

  prisma.memory
    .updateMany({ where: { id: { in: list.map((m) => m.id) } }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    text: `MEMORY — durable knowledge the owner has told me (treat as true, do not contradict):\n${text}`,
    list,
  };
}
