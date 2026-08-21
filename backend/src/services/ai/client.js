import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logApiUsage } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';

const client = new OpenAI({
  apiKey: env.deepseekApiKey || 'sk-placeholder',
  baseURL: env.deepseekBaseUrl,
  timeout: 60_000,
  maxRetries: 0, // we handle retries ourselves with backoff
  // Node's native fetch (undici) is required: the SDK's bundled fetch
  // throws "Premature close" on DeepSeek's slow streaming responses.
  fetch: globalThis.fetch,
});

/** Retryable network/transient errors — a retry usually succeeds. */
function isTransientError(e) {
  if (e?.status) {
    return e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503 || e.status === 504;
  }
  const msg = String(e?.message || e?.code || '');
  return /premature close|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket|network|timeout|abort/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Per-1M-token input/output cost per model (USD). Fallback = Flash-tier. */
const COST_RATES = {
  'deepseek-v4-flash': { in: 0.00000014, out: 0.00000028 }, // $0.14 / $0.28 per 1M
  'deepseek-v4-pro': { in: 0.000000435, out: 0.00000087 }, // $0.435 / $0.87 per 1M
};

function estCostUsd(model, usage) {
  const rate = COST_RATES[model] || COST_RATES['deepseek-v4-flash'];
  return (usage.prompt_tokens || 0) * rate.in + (usage.completion_tokens || 0) * rate.out;
}

/** Pro is slower at deep reasoning — give it more room to finish. */
function modelTimeout(model) {
  return model === env.deepseekProModel ? 120_000 : 60_000;
}

/**
 * Answer passes can produce a full roadmap JSON (milestones + tasks +
 * acceptance criteria + suggested tasks), which easily exceeds the default
 * 2048-token budget and gets truncated mid-object → unparseable → fallback.
 * Give the answer pass a model-aware budget; structured passes (think/review)
 * keep their smaller explicit budgets.
 */
export function modelMaxTokens(model) {
  return model === env.deepseekProModel ? 8192 : 4096;
}

/** Intents that deserve the strongest reasoning model in auto mode. */
const COMPLEX_INTENTS = new Set(['PLAN', 'ONBOARD_CLIENT', 'ONBOARD_EMPLOYEE', 'TEAM_INTRO', 'REFINE']);

/**
 * Resolve which DeepSeek model to use for a given pass.
 * @param {'auto'|'deepseek-v4-pro'|'deepseek-v4-flash'} selection
 * @param {string} [intent] thinking intent — used to route in auto mode.
 */
export function resolveModel(selection, intent) {
  const sel = String(selection || '').toLowerCase();
  if (sel === 'deepseek-v4-pro') return env.deepseekProModel;
  if (sel === 'deepseek-v4-flash') return env.deepseekFlashModel;
  // auto: cheap structured passes stay on Flash; complex planning gets Pro.
  if (COMPLEX_INTENTS.has(String(intent || '').toUpperCase())) return env.deepseekProModel;
  return env.deepseekFlashModel;
}

/** Human label for the resolved model (used in the UI / persisted meta). */
export function modelLabel(model) {
  if (model === env.deepseekProModel) return 'V4 Pro';
  if (model === env.deepseekFlashModel) return 'V4 Flash';
  return model;
}

/**
 * Chat completion helper with usage logging + automatic retry with backoff.
 * When the API is down (or no key is configured), throws — callers decide
 * whether to fall back, so transient blips don't degrade quality.
 */
export async function chat(engine, messages, { temperature = 0.3, maxTokens = 2048, json = false, attempts = 3, model } = {}) {
  if (!env.deepseekApiKey) {
    logger.warn(`[AI] No DEEPSEEK_API_KEY — using fallback response for ${engine}`);
    return null;
  }

  const activeModel = model || env.deepseekModel;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const completion = await client.chat.completions.create(
        {
          model: activeModel,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          // DeepSeek V4 enables "thinking" by default, which consumes the
          // token budget on reasoning and can leave the JSON content empty.
          // Structured passes (think/answer/review) rely on explicit JSON, so
          // disable model-level thinking and let the pipeline do the reasoning.
          ...(json ? { thinking: { type: 'disabled' } } : {}),
        },
        { timeout: modelTimeout(activeModel) }
      );

      const usage = completion.usage || {};
      logApiUsage(engine, {
        model: activeModel,
        tokensIn: usage.prompt_tokens,
        tokensOut: usage.completion_tokens,
        estCostUsd: estCostUsd(activeModel, usage),
      }).catch(() => {});

      return completion.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      const status = e?.status;
      lastError = e;

      if (status === 402) {
        logger.warn(`[AI] ${engine} call skipped: DeepSeek account has insufficient balance — using fallback.`);
        throw e;
      }
      if (status === 401) {
        logger.warn(`[AI] ${engine} call skipped: invalid DEEPSEEK_API_KEY — using fallback.`);
        throw e;
      }

      if (attempt < attempts && isTransientError(e)) {
        const delay = Math.min(1500 * 2 ** (attempt - 1), 8000);
        logger.warn(`[AI] ${engine} attempt ${attempt} failed (${e?.message || e?.code}) — retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      logger.error(`[AI] ${engine} call failed after ${attempt} attempt(s):`, e?.message || e);
      throw e;
    }
  }
  throw lastError;
}

/** Parse a JSON string returned by the model, tolerant of code fences. */
export function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Chat completion with tool/function calling (OpenAI-compatible).
 * Runs the tool-calling loop: call model -> execute tools -> feed results
 * back -> repeat, until the model returns plain content or we hit caps.
 *
 * Returns { content, toolCalls, tools } where tools is an array of
 * { name, args, result } executed during the loop, or null if the
 * underlying call failed outright.
 */
export async function chatWithTools(
  engine,
  messages,
  tools,
  { temperature = 0.5, maxTokens = 2048, maxRounds = 3, maxCalls = 6, attempts = 2, model } = {}
) {
  if (!env.deepseekApiKey) {
    logger.warn(`[AI] No DEEPSEEK_API_KEY — using fallback response for ${engine}`);
    return null;
  }

  const activeModel = model || env.deepseekModel;
  const working = [...messages];
  const executed = []; // { name, args, result }
  let rounds = 0;
  let calls = 0;

  const logUsage = (usage) => {
    logApiUsage(engine, {
      model: activeModel,
      tokensIn: usage.prompt_tokens,
      tokensOut: usage.completion_tokens,
      estCostUsd: estCostUsd(activeModel, usage),
    }).catch(() => {});
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // eslint-disable-next-line no-constant-condition
      while (rounds < maxRounds) {
        const completion = await client.chat.completions.create(
          {
            model: activeModel,
            messages: working,
            temperature,
            max_tokens: maxTokens,
            tools: tools?.length ? tools : undefined,
            // The model drives the tool loop and final JSON answer explicitly,
            // so disable V4's default thinking to keep latency/cost bounded.
            thinking: { type: 'disabled' },
          },
          { timeout: modelTimeout(activeModel) }
        );

        const usage = completion.usage || {};
        logUsage(usage);

        const message = completion.choices?.[0]?.message;
        if (!message) return null;

        const toolCalls = message.tool_calls || [];
        if (!toolCalls.length) {
          return { content: message.content ?? null, toolCalls: executed };
        }

        if (calls + toolCalls.length > maxCalls) {
          // Force the model to finalize by truncating remaining tool calls.
          const take = Math.max(0, maxCalls - calls);
          const allowed = toolCalls.slice(0, take);
          rounds++;
          if (!allowed.length) {
            // Entire tool budget already consumed — no tool responses to attach.
            working.push({
              role: 'user',
              content: 'Tool call budget exhausted. Produce your final answer now using the information gathered.',
            });
            break;
          }
          working.push({ role: 'assistant', content: message.content || '', tool_calls: allowed });
          working.push({
            role: 'tool',
            tool_call_id: allowed[0].id,
            content: 'Tool call limit reached. Produce your final answer now using what you have.',
          });
          calls += take;
          continue;
        }

        // Execute each requested tool.
        const toolResults = [];
        for (const tc of toolCalls) {
          calls++;
          const name = tc.function?.name || '';
          let args = {};
          try {
            args = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            args = {};
          }
          const handler = tools.find((t) => t.function?.name === name);
          let result = { error: `Unknown tool: ${name}` };
          if (handler?.execute) {
            try {
              result = await handler.execute(args) ?? {};
            } catch (e) {
              result = { error: e.message };
            }
          }
          executed.push({ name, args, result });
          toolResults.push({ id: tc.id, result });
        }

        working.push({ role: 'assistant', content: message.content || '', tool_calls: toolCalls });
        for (const tr of toolResults) {
          working.push({ role: 'tool', tool_call_id: tr.id, content: JSON.stringify(tr.result).slice(0, 6000) });
        }
        rounds++;
        await new Promise((r) => setTimeout(r, 250));
      }

      // Max rounds reached without a final answer — ask the model to finalize.
      const completion = await client.chat.completions.create(
        {
          model: activeModel,
          messages: [
            ...working,
            { role: 'user', content: 'Tool call budget exhausted. Produce your final answer now using the information gathered.' },
          ],
          temperature,
          max_tokens: maxTokens,
          thinking: { type: 'disabled' },
        },
        { timeout: modelTimeout(activeModel) }
      );
      logUsage(completion.usage || {});
      const finalMsg = completion.choices?.[0]?.message;
      return { content: finalMsg?.content ?? null, toolCalls: executed };
    } catch (e) {
      const status = e?.status;
      if (status === 402) {
        logger.warn(`[AI] ${engine} call skipped: DeepSeek account has insufficient balance — using fallback.`);
        throw e;
      }
      if (status === 401) {
        logger.warn(`[AI] ${engine} call skipped: invalid DEEPSEEK_API_KEY — using fallback.`);
        throw e;
      }
      if (attempt < attempts && isTransientError(e)) {
        const delay = Math.min(1500 * 2 ** (attempt - 1), 8000);
        logger.warn(`[AI] ${engine} tool-call attempt ${attempt} failed (${e?.message || e?.code}) — retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      logger.error(`[AI] ${engine} tool-call loop failed after ${attempt} attempt(s):`, e?.message || e);
      throw e;
    }
  }
  return null;
}
