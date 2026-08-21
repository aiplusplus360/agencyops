import { chat, chatWithTools, parseJson, modelMaxTokens } from './client.js';
import { searchWeb, fetchPage, webDelay } from './webResearch.js';
import { logger } from '../../lib/logger.js';

/**
 * REASONING ENGINE
 *
 * A Claude-Code-style "think, then answer, then review" pipeline:
 *
 *  1. THINK  — the model works the problem step-by-step (intent, evidence,
 *              gaps, risks, plan) WITHOUT producing the final reply yet.
 *  2. ANSWER — given the thinking trace, the model produces the final
 *              reply/draft/clientDraft/employeeDraft/recommendations.
 *  3. REVIEW — a cheap second pass sanity-checks the answer against the
 *              research dossier and the request; issues are surfaced and,
 *              if resolvable, applied.
 *
 * Every stage degrades gracefully to the caller's deterministic fallback.
 */

const THINK_SYSTEM = `You are the reasoning engine of AgencyOps AI-COO. The agency owner just said something to you. Before answering, work through the problem EXACTLY as a world-class operations executive would.

Think step by step and return ONLY valid JSON:
{
  "intent": "one of: PLAN | QUESTION | ONBOARD_CLIENT | ONBOARD_EMPLOYEE | TEAM_INTRO | REFINE | STATUS | OTHER",
  "understanding": "what the owner actually wants, in one sentence",
  "evidence": ["relevant facts from the RESEARCH DOSSIER that ground your answer"],
  "gaps": ["important information still missing, or empty array"],
  "risks": ["business risks to flag, or empty array"],
  "plan": "what your final reply will do (e.g. draft a roadmap, ask a question, recommend an action), in one sentence"
}

Rules:
- Ground every claim in the RESEARCH DOSSIER. Never invent employees, products, tasks, or numbers.
- If the dossier is empty or thin, say so in evidence and rely on the conversation history.
- Be genuinely analytical: connect the dots between team load, skills, deadlines, and the owner's request.
- Keep thinking concise but real — 2-6 evidence items, 0-3 gaps, 0-3 risks.`;

/**
 * Pass 1: think through the request. Returns the thinking object or null.
 */
export async function think(history, dossierText, opts = {}) {
  try {
    const content = await chat(
      'aiThink',
      [
        { role: 'system', content: THINK_SYSTEM },
        {
          role: 'user',
          content: `RESEARCH DOSSIER:\n${dossierText || '(empty — rely on the conversation)'}\n\nConversation so far:\n${history
            .slice(-8)
            .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
            .join('\n\n')}`,
        },
      ],
      { temperature: 0.3, json: true, maxTokens: 800, attempts: 2, model: opts.model }
    ).catch(() => null);
    const parsed = content ? parseJson(content) : null;
    if (!parsed?.understanding && !parsed?.intent) return null;
    return {
      intent: String(parsed.intent || 'OTHER').toUpperCase(),
      understanding: String(parsed.understanding || '').slice(0, 300),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map((e) => String(e).slice(0, 200)).slice(0, 6) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map((g) => String(g).slice(0, 200)).slice(0, 3) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map((r) => String(r).slice(0, 200)).slice(0, 3) : [],
      plan: String(parsed.plan || '').slice(0, 300),
    };
  } catch (e) {
    logger.warn('[AI] think pass failed:', e.message);
    return null;
  }
}

/**
 * Pass 2: produce the final answer, given the thinking trace + dossier.
 * The caller supplies the system prompt (SYSTEM_PROMPT) that defines the
 * JSON response shape.
 */
export async function answer(systemPrompt, history, dossierText, thinking, opts = {}) {
  const content = await chat(
    'aiChat',
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `RESEARCH DOSSIER (live evidence — ground your answer in it, never contradict it):\n${dossierText || '(empty)'}\n\nTHINKING TRACE (your own analysis — use it to answer, but do not repeat it verbatim):\n${JSON.stringify(thinking || {})}\n\nNow produce the final response.`,
      },
      ...history.slice(-12),
    ],
    {
      temperature: 0.5,
      json: true,
      maxTokens: modelMaxTokens(opts.model),
      attempts: 3,
      ...opts,
    }
  ).catch(() => null);
  return content ? parseJson(content) : null;
}

/**
 * The two web tools exposed to the model, mirroring Claude Code's
 * WebSearch / WebFetch pair. Provider work happens in webResearch.js.
 */
const webTools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for current information, market trends, platform changes, pricing, benchmarks, best practices or real examples that the owner may not know. Use this when the owner asks "what should I do", for recommendations, or when up-to-date external knowledge would make the advice sharper.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query, concise and specific (e.g. "best Instagram Reels strategy 2026")',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    execute: (args) => executeWebTool('web_search', args),
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Read the full content of a specific web page (usually one found via web_search) to extract details, statistics, pricing, or step-by-step guidance.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The http(s) URL of the page to read',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    execute: (args) => executeWebTool('web_fetch', args),
  },
];

/** Execute a web tool call. Fail-open: never throws. */
async function executeWebTool(name, args) {
  if (name === 'web_search') {
    const results = await searchWeb(args?.query).catch(() => []);
    return { query: args?.query || '', results };
  }
  if (name === 'web_fetch') {
    const page = await fetchPage(args?.url).catch(() => null);
    return { url: args?.url || '', page };
  }
  return { error: `Unknown tool: ${name}` };
}

/**
 * Pass 2b: answer WITH autonomous web research.
 * Runs the model's tool-calling loop (web_search / web_fetch), collects
 * queries + sources, and returns { parsed, webResearch }. Falls back to
 * the plain `answer()` when tools are disabled, no key, or the loop fails.
 */
export async function answerWithWebResearch(systemPrompt, history, dossierText, thinking, opts = {}) {
  const toolsEnabled = opts.webResearchEnabled !== false;
  if (!toolsEnabled) {
    const parsed = await answer(systemPrompt, history, dossierText, thinking, opts);
    return { parsed, webResearch: null };
  }

  try {
    const result = await chatWithTools(
      'aiChat',
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `RESEARCH DOSSIER (live evidence — ground your answer in it, never contradict it):\n${dossierText || '(empty)'}\n\nTHINKING TRACE (your own analysis — use it to answer, but do not repeat it verbatim):\n${JSON.stringify(thinking || {})}\n\nIf you need CURRENT information from the web (trends, pricing, platform changes, examples) to answer better, use the web_search and web_fetch tools. Otherwise answer directly. Then produce the final response.`,
        },
        ...history.slice(-12),
      ],
      webTools,
      {
        temperature: 0.5,
        maxTokens: modelMaxTokens(opts.model),
        maxRounds: 3,
        maxCalls: 6,
        attempts: 2,
        model: opts.model,
      }
    ).catch(() => null);

    if (!result) {
      const parsed = await answer(systemPrompt, history, dossierText, thinking, opts);
      return { parsed, webResearch: null };
    }

    const toolCalls = result.toolCalls || [];
    const queries = [];
    const sources = [];
    for (const tc of toolCalls) {
      if (tc.name === 'web_search') {
        const q = String(tc.args?.query || '');
        if (q) {
          queries.push(q);
          await webDelay().catch(() => {});
        }
      } else if (tc.name === 'web_fetch') {
        const u = String(tc.args?.url || '');
        const title = tc.result?.page?.title || u;
        if (u && !sources.some((s) => s.url === u)) sources.push({ title, url: u });
      }
    }

    const parsed = result.content ? parseJson(result.content) : null;
    if (!parsed) {
      logger.warn('[AI] web-research answer unparseable — raw tail:', JSON.stringify(result.content || '').slice(-800));
    }
    return {
      parsed,
      webResearch: queries.length || sources.length ? { queries, sources } : null,
    };
  } catch (e) {
    logger.warn('[AI] web research loop failed — falling back to plain answer:', e.message);
    const parsed = await answer(systemPrompt, history, dossierText, thinking, opts);
    return { parsed, webResearch: null };
  }
}

const REVIEW_SYSTEM = `You are the quality reviewer for AgencyOps AI-COO. A draft answer was produced. Check it against the RESEARCH DOSSIER and the owner's request for:
- Invented or wrong employees/products (must match the dossier or conversation)
- Contradictions with facts in the dossier
- Assignees who are overloaded, lack required skills, or don't exist
- Unreasonable effort/priority, or tasks that clearly duplicate existing ones
- Missing acceptance criteria or vague, unexecutable tasks

Return ONLY valid JSON:
{
  "issues": ["specific, actionable problems, or empty array"],
  "advice": "one sentence of advice to fix the main issue, or empty string"
}
Do NOT invent issues that aren't grounded in the provided material. If the answer is sound, return empty issues.`;

/**
 * Pass 3: cheap self-review of the produced answer.
 * Returns { issues: [], advice: '' } always (never throws).
 */
export async function reviewAnswer(userMessage, draft, dossierText, thinking, opts = {}) {
  try {
    const content = await chat(
      'aiReview',
      [
        { role: 'system', content: REVIEW_SYSTEM },
        {
          role: 'user',
          content: `OWNER REQUEST: ${String(userMessage).slice(0, 2000)}\n\nRESEARCH DOSSIER:\n${dossierText || '(empty)'}\n\nTHINKING:\n${JSON.stringify(thinking || {})}\n\nDRAFT ANSWER:\n${JSON.stringify(draft || null)}`,
        },
      ],
      { temperature: 0.2, json: true, maxTokens: 700, attempts: 2, model: opts.model }
    ).catch(() => null);
    const parsed = content ? parseJson(content) : null;
    return {
      issues: Array.isArray(parsed?.issues) ? parsed.issues.map((i) => String(i).slice(0, 300)).slice(0, 5) : [],
      advice: String(parsed?.advice || '').slice(0, 300),
    };
  } catch (e) {
    logger.warn('[AI] review pass failed:', e.message);
    return { issues: [], advice: '' };
  }
}
