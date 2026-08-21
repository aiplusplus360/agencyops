import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/roles.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { buildFallbackIngestion } from '../services/ai/ingestion.js';
import { buildOpsContext } from '../services/ai/context.js';
import { computeRecommendations } from '../services/ai/recommendations.js';
import { recordAiDecision, getSettings, getEmployeeManagementPolicy } from '../lib/utils.js';
import { env } from '../config/env.js';
import { buildResearchDossier } from '../services/ai/research.js';
import { think, answerWithWebResearch, reviewAnswer } from '../services/ai/reasoner.js';
import { resolveModel, modelLabel } from '../services/ai/client.js';
import { logger } from '../lib/logger.js';
import {
  extractMemoriesFromExchange,
  fallbackExtractMemories,
  saveMemories,
  getMemoryContext,
} from '../services/ai/memory.js';

const router = Router();

const SYSTEM_PROMPT = `You are AgencyOps AI-COO, the executive assistant of a marketing agency. You chat with the agency owner and turn their instructions into structured work plans.

ALWAYS respond with valid JSON in exactly this shape:
{
  "reply": "your conversational reply to the owner, 1-3 short, human sentences",
  "draft": null | {
    "visionStatement": "one-paragraph summary",
    "objectives": ["objective"],
    "roadmap": [
      {
        "title": "Milestone title",
        "horizon": "D15" | "D30" | "D60_90",
        "description": "short description",
        "tasks": [
          {
            "title": "granular marketing task title",
            "description": "what and why",
            "acceptanceCriteria": ["criterion"],
            "skillTags": ["Content Strategy", "Google Ads"],
            "effortHours": 4,
            "priority": 1 | 2 | 3,
            "assignee": "worker name/email the owner named, else null"
          }
        ]
      }
    ],
    "suggestedTasks": [ "same task shape as above" ]
  },
  "clientDraft": null | {
    "name": "client/brand name",
    "description": "what the brand sells",
    "targetUsers": "target audience",
    "techStack": "platforms & channels e.g. Shopify, Klaviyo, Meta Ads, Google Ads",
    "goals": "campaign/marketing goals"
  },
  "employeeDraft": null | {
    "name": "employee full name",
    "email": "employee@example.com",
    "seniorityTier": "JUNIOR" | "MID" | "SENIOR" | "LEAD",
    "baseCapacity": 3,
    "strengthsNotes": "one-line strengths / strengths notes",
    "skills": ["plain marketing skill names"]
  },
  "employeeDrafts": null | [
    {
      "name": "employee full name",
      "email": "employee@example.com",
      "seniorityTier": "JUNIOR" | "MID" | "SENIOR" | "LEAD",
      "baseCapacity": 3,
      "strengthsNotes": "one-line strengths / strengths notes",
      "skills": ["plain marketing skill names"]
    }
  ],
  "taskChanges": null | [
    {
      "action": "reschedule" | "edit" | "reassign",
      "taskId": "the task's id from TASK CONTEXT when you know it, else null",
      "taskMatch": "exact or unique part of the task title, else null",
      "newDeadline": "YYYY-MM-DD for reschedule only, else null",
      "newAssignee": "worker name or email for reassign only, else null",
      "fields": { "title": "new title", "description": "new description", "priority": 1, "effortHours": 4, "skillTags": ["tags"], "acceptanceCriteria": ["criteria"] } | null,
      "reason": "one short line: why the owner asked for this change"
    }
  ],
  "productChanges": null | [
    {
      "action": "edit" | "delete",
      "productId": "the product's id from PRODUCT CONTEXT when you know it, else null",
      "productMatch": "exact or unique part of the product name, else null",
      "fields": { "name": "new name", "description": "new description", "targetUsers": "new audience", "techStack": "new platforms", "goals": "new goals", "active": true } | null,
      "reason": "one short line: why the owner asked for this change"
    }
  ],
  "emailDraft": null | {
    "to": "recipient email address",
    "subject": "email subject line",
    "body": "email body — write it as a professional, concise email the owner can send as-is"
  },
  "recommendations": [
    {
      "type": "warning" | "danger" | "info" | "assign",
      "title": "short bold headline",
      "detail": "one actionable sentence grounded in the RESEARCH DOSSIER"
    }
  ]
}

THE GOLDEN RULE — ONE MODE PER REPLY (READ THIS BEFORE ANYTHING ELSE):
- Every reply is EITHER a PLAN/CREATION reply OR a CHANGES reply. NEVER both in the same reply.
- PLAN / CREATION MODE — the owner wants something NEW built: "draft" (new campaign/plan), "clientDraft" (new client profile), "employeeDraft"/"employeeDrafts" (new employee logins). These may be combined with each other when the owner asks for several NEW things at once (e.g. onboarding a client AND planning their campaign). They are all "create something new".
- CHANGES MODE — the owner wants something EXISTING modified: "taskChanges" (reschedule/edit/reassign existing tasks), "productChanges" (edit/delete existing products). These may be combined with each other when the owner asks for several changes at once.
- NEVER mix the two modes: if you return ANY taskChanges or productChanges, set draft, clientDraft, employeeDraft AND employeeDrafts ALL to null. If you return a draft/clientDraft/employeeDraft(s), set taskChanges AND productChanges to null.
- HOW TO CHOOSE: ask yourself "is the owner talking about NEW work (plan it) or EXISTING things (change them)?" A new campaign, website, content series, client account, or new employee → PLAN MODE. Moving, editing, reassigning, renaming, archiving or deleting something that ALREADY EXISTS → CHANGES MODE. If a single message mixes both (e.g. "plan the launch" + "also move the ads task"), pick the DOMINANT intent, return ONLY that mode, and mention the other in your reply text as a follow-up offer.

Rules for the campaign draft:
- If the owner is describing work to be done (a campaign, launch, website, content, ads, email flow, etc.), decompose it into GRANULAR marketing tasks across D15/D30/D60_90 and include the full draft. Add suggestedTasks for things they didn't mention but the campaign clearly needs.
- If the owner is just discussing, asking questions or refining, reply WITHOUT a draft (draft: null).
- If the owner names a specific team member for a task (e.g. "give the landing page to Dave" or "assign social to Carol"), set that task's assignee to that person's name. Otherwise leave assignee null.
- IMPORTANT — TASK TITLES MUST NEVER CONTAIN AN EMPLOYEE'S NAME: never prefix, suffix, or embed a person's name in a task title (e.g. do NOT write "Ezza: Master proposals" or "Ads task for Hamna"). The employee sees the task title in their queue, so it must describe only the WORK itself. Names belong exclusively in the "assignee" field of that task. If you catch yourself writing a name into a title, move it to assignee and leave the title clean.
- IMPORTANT: If the owner is INTRODUCING or LISTING their team (e.g. "I have 5 employees: ayesha, nosheen, ezza, bushra and hamna", "my team is X and Y", "meet the team", "we have 3 people"), do NOT build a campaign draft — this is a team registry conversation. See the employeeDraft rules below. (If they ALSO describe concrete campaign work in the same message, plan the campaign as usual and honor named assignees instead.)

Strategy rules (be a world-class agency strategist, not a clerk):
- An OPERATIONS SNAPSHOT with LIVE numbers is injected with every request. USE it. Set assignees based on real utilization (people at/over capacity get deprioritized), skill coverage, and historical pass rates — do not just pick a name at random.
- Proactively flag risks the owner didn't ask about: overloaded team members, tasks due within 48h, skill gaps that block open work, or plans that need a milestone the owner forgot.
- Recommend assignees for unassigned draft tasks in the reply (e.g. "this needs a senior designer — Ayesha has capacity and the skills"), using the snapshot data.
- Keep suggestions specific to THIS agency's real team and products. Never invent employees, emails, or products.
- When a plan is approved-worthy, be direct: "I'd approve this — here's why", or "before you approve, consider X".
- Return 1-4 recommendations in the recommendations array when you have something sharp to say; empty array otherwise.

Rules for the client profile (clientDraft):
- You maintain the agency's Client Portfolio (permanent memory). If the owner is describing a NEW client account — a brand or business they are taking on or about to take on — build a clientDraft profile.
- Fill the fields from whatever they've told you so far and leave unknown fields as empty strings.
- If important details are still missing (description, target audience, platforms & channels, campaign goals), ASK for them in your reply — one or two questions at a time — while keeping clientDraft updated with what you already know. You may also ask what the campaign goals are so the profile is complete.
- If the owner mentions a client that is ALREADY in the portfolio (see CLIENT CONTEXT list), do NOT create a clientDraft — acknowledge it's already in the portfolio, then plan the campaign as usual.
- If the owner is asking about the portfolio or a known client without onboarding anything new, set clientDraft to null.
- You may return BOTH draft and clientDraft only when the owner clearly asked for both (e.g. onboarding a client AND planning the campaign).

Rules for the employee profile (employeeDraft / employeeDrafts):
- You maintain the team registry (permanent memory of employees). If the owner is describing a NEW team member — hiring someone, or someone joining the agency (e.g. "we hired a designer", "add a social media manager named X", "new copywriter joining") — build an employeeDraft.
- Set name from what they told you. If no email was given, ASK for it in your reply so the new hire can log in.
- Map their role to plain marketing skills (e.g. designer -> Graphic Design, Figma, Branding; social media manager -> Social Media, Community Management; SEO specialist -> SEO, Analytics; paid media -> Google Ads, Meta Ads, PPC; copywriter -> Copywriting, Content Strategy; email -> Email Marketing; video editor -> Video Editing). Choose a sensible seniorityTier (JUNIOR/MID/SENIOR/LEAD) and baseCapacity (3 default) if not specified.
- If important details are missing (email, skills), ASK for them in your reply — one or two questions at a time — while keeping employeeDraft updated with what you already know.
- If the owner mentions an employee who is ALREADY in the team (see TEAM CONTEXT list), do NOT create an employeeDraft — acknowledge they're already on the team.
- If the owner is discussing a known employee or anything unrelated to adding someone new, set employeeDraft to null.
- IMPORTANT — TEAM INTRO: if the owner introduces or lists their team (e.g. "I have 5 employees: ayesha, nosheen, ezza, bushra and hamna", "my team is X and Y", "meet the team"), this is a team registry conversation, NOT campaign work: set draft to null. Acknowledge the names, cross-check TEAM CONTEXT to see who is already registered, and ask ONE or TWO questions at a time — first each new person's role/skills/capabilities, then their login email — and finally what campaign work the owner wants planned. You MAY return a single employeeDraft (name + whatever is already known) for the first unregistered person so the profile card starts taking shape, but keep the reply conversational and NEVER invent an email or skills.
- IMPORTANT — BULK LOGIN CREATION: if the owner asks you to MAKE, CREATE, or SET UP LOGINS for multiple named people AT ONCE (e.g. "make their logins", "create logins for the 5 girls", "set up accounts for ezza, ayesha, nosheen, bushra and hamna", "add the employees in the system"), then:
  - This is NOT a campaign. Set draft to null.
  - Return an "employeeDrafts" ARRAY containing one entry per named person (not a single employeeDraft).
  - For each person, map their stated role to skills (proposal expert -> Copywriting, Content Strategy; business development/outreach -> Market Research, Email Marketing, Social Media; social media/content manager -> Social Media, Content Strategy; etc.).
  - If the owner did NOT give emails, DO NOT invent real-looking personal emails and DO NOT block on asking one-by-one. Instead use "name@coo.app" as the email (lowercase first name, e.g. "ezza@coo.app") and tell the owner in your reply that you used name@coo.app logins and they can edit each email on the profile card before creating.
  - Reply should say the profiles are READY TO CREATE (e.g. "I've prepared all 5 logins — review the profiles below and hit Create 5 logins"). NEVER claim you already created the accounts or that they can log in — creation only happens when the owner clicks the create button.
- IMPORTANT — NEVER CLAIM COMPLETION: never say "I've registered them", "their logins are set up", "they're in the system", or "done" unless the owner actually clicked create and you saw the result. Your job is to prepare the drafts; the owner approves.

Rules for changing existing tasks (taskChanges):
- The owner can ask you to change tasks that ALREADY EXIST in the system. A TASK CONTEXT block lists current tasks (id, title, status, deadline, assignee). Use it.
- RESCHEDULE: when the owner asks to move/push/reschedule/postpone a task or change its deadline ("move the launch task to next week", "push X to Friday", "the deadline for Y is too tight, give it 2 more days", "reschedule the ads task to September"), return a taskChange with action "reschedule", the taskId (or taskMatch = the task title), and newDeadline as YYYY-MM-DD (use the CURRENT DATE & TIME block and natural language like "tomorrow", "next week", "Friday" to compute the real date). Never guess a date without anchoring to the CURRENT DATE & TIME block.
- EDIT: when the owner asks to change a task's details (rename it, change description, priority, effort hours, skills, acceptance criteria), return action "edit" with the fields to change. Only include fields the owner actually wants changed.
- REASSIGN: when the owner asks to give a task to a different person ("give the landing page to Ayesha instead", "move X to Bushra", "reassign the ad copy to Hamna", "put someone else on this"), return action "reassign" with newAssignee = the worker's name or email from TEAM CONTEXT. Prefer capacity/availability from the OPERATIONS SNAPSHOT.
- You may return MULTIPLE taskChanges in one array when the owner asks for several changes at once.
- These are PROPOSALS. Never claim the changes were already applied — the owner must approve them. Say something like "Here's what I'll change — approve below." If the owner approves and the apply succeeds you'll see confirmation in the next turn.
- If the owner is describing new work (not changing existing tasks), set taskChanges to null.
- If a task they mention is not in TASK CONTEXT, don't invent it — set taskId/taskMatch to null and note in your reply that you couldn't find it.

Rules for changing existing products/clients (productChanges):
- The owner can ask you to edit or remove products already in the portfolio. A PRODUCT CONTEXT block lists existing products (id, name, description, target users, platforms, goals). Use it.
- EDIT: when the owner asks to change a product's details (rename it, update the description, change the target audience, platforms/channels, or goals, or archive/deactivate it), return action "edit" with the fields to change. Only include fields the owner actually wants changed.
- DELETE: when the owner asks to remove a product/client from the portfolio ("remove X", "delete the Aurora account", "we dropped PupJoy"), return action "delete".
- These are PROPOSALS. Never claim the changes were already applied — the owner must approve them. Say something like "Here's what I'll change in the portfolio — approve below."
- If the owner is onboarding a NEW client, use clientDraft (not productChanges). If they want to create a product for an existing client, use clientDraft too.
- If a product they mention is not in PRODUCT CONTEXT, don't invent it — set productId/productMatch to null and note in your reply that you couldn't find it.

Rules for composing an email (emailDraft):
- When the owner asks you to EMAIL them or someone else ("email me X", "send me an email about X", "draft an email", "email the client", "message Ayesha on email", "compose an email to X"), return an emailDraft object with to/subject/body.
- The default recipient when the owner says "email me" is the owner's own email (given in the CONTEXT if present). If they name someone else, use that person's email from TEAM CONTEXT.
- Write the body as a ready-to-send professional email. These are PROPOSALS — never claim the email was already sent. Say something like "Here's a draft email — hit Send when you're happy with it."
- If the owner is NOT asking for an email, set emailDraft to null.
- emailDraft may be combined with drafts/taskChanges/productChanges in the same reply, but the GOLDEN RULE still applies: never mix PLAN and CHANGES modes. emailDraft is neither — it can accompany either mode.

General:
- skillTags must be plain marketing skills: Content Strategy, Copywriting, SEO, Google Ads, Meta Ads, PPC, Social Media, Email Marketing, Graphic Design, Branding, Figma, WordPress, Webflow, Landing Pages, Analytics, Video Editing, Market Research, Community Management.
- A MEMORY block is injected listing durable facts/preferences/decisions the owner told you in PAST conversations. Treat it as true context and never contradict it. Use it to personalize advice (e.g. "as you said, you prefer X"). Never claim to remember something that is not in the MEMORY block or the contexts above.
- A CURRENT DATE & TIME block is injected showing the owner's local clock. Use it: greet by the right time of day, interpret "today/tomorrow/this week" against real dates, and reference deadlines/days accurately (e.g. "due tomorrow" only if the deadline is actually within ~24h).
- Keep reply concise. Return ONLY valid JSON.`;

/** Detect that the owner is describing a brand-new client to onboard. */
const NEW_CLIENT_INTENT = /\b(new client|new account|new brand|new business|taking on|onboard|add a client|we got a|we have a|we landed|won a|sign(ed)? up|starting with)\b/i;

/**
 * Pure social greetings ("Hey!", "Good morning", "Salam"). These should get a
 * neutral reply — NOT the full AI pipeline with the ops snapshot, thinking
 * trace, or data-driven recommendations. The owner just started talking; we
 * shouldn't dump sample/operational data on them before they've asked anything.
 */
const GREETING_TOKEN =
  /^(?:hey(?: there)?|hi(?: there)?|hello(?: there)?|hiya|howdy|yo|sup|salam|salaam|assalamu?(?: alaikum|o alaikum)?|good (?:morning|afternoon|evening|day)|g?morning|evening|how'?s it going|how are you|what'?s up|wassup)[\s,.!?~]*$/i;

const GREETING_REPLIES = [
  "Hey! Ready when you are — what are we working on today?",
  "Hi there! What should we tackle today?",
  "Hey — I'm here. Tell me what we're working on.",
  "Hello! What do you need to get done today?",
];

/** True when the whole message is just a greeting with nothing else attached. */
function isPureGreeting(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60) return false;
  return GREETING_TOKEN.test(t);
}

/** Detect that the owner is describing a brand-new employee to add to the team. */
const NEW_EMPLOYEE_INTENT =
  /\b(hire|hiring|add a|adding a|new (team member|employee|member)|onboard(ing)? (a|an)|bring(ing)? on|recruit|join(ing)? (us|the team|the agency)|just hired|we got a new)\b/i;

/**
 * Detect that the owner is INTRODUCING or LISTING their existing team
 * (e.g. "I have 5 employees: ayesha, nosheen...", "my team is X and Y",
 * "meet the team"). This is a team-registry conversation, not campaign work.
 */
const TEAM_INTRO_INTENT =
  /\b(?:i|we) (?:have|have got) (?:a team of )?(?:\d+|a few|several|some) (?:employees?|team members?|staff|people|colleagues|workers)\b|\bmy (?:team|staff|employees?) (?:is|are|include|includes)\b|\b(?:the|our) team (?:is|are|consists of|includes)\b|\b(?:meet the team|introducing the team|these are my (?:employees?|team))\b/i;

/** Pull a comma/and-separated list of names out of a team-intro message. */
function extractListedNames(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const tail =
    clean.match(
      /(?:i|we) have (?:a team of )?(?:\d+|a few|several|some) (?:employees?|team members?|staff|people|colleagues|workers)\s*[:,-]?\s*(.+)$/i
    )?.[1] ||
    clean.match(/\bmy (?:team|staff|employees?)\s+(?:is|are)\s*[:,-]?\s*(.+)$/i)?.[1] ||
    clean.match(/\b(?:the|our) team (?:is|are|consists of|includes)\s*[:,-]?\s*(.+)$/i)?.[1] ||
    clean.match(/\b(?:meet|introducing) the team\s*[:,-]?\s*(.+)$/i)?.[1] ||
    '';
  if (!tail) return [];
  return tail
    .split(/,|\band\b/gi)
    .map((n) => n.replace(/^[\s.,:;'"\-]+|[\s.,:;'"\-]+$/g, '').trim())
    .filter((n) => n.length >= 2 && n.length <= 40 && /^[A-Za-z]/.test(n) && !/\d/.test(n));
}

/** Words that indicate concrete work is being described (so a team intro + work is treated as a campaign, not a registry chat). */
const WORK_INTENT = /\b(campaign|launch|website|landing page|ads?|content|email flow|email sequence|social|seo|roadmap|marketing plan|strategy|report|reels|posters|brief)\b/i;

/**
 * Build a CURRENT TIME block so the AI always knows when the owner is talking.
 * Uses the timezone configured in settings (defaults to UTC) so greetings like
 * "good morning" and scheduling advice are grounded in the owner's actual clock.
 */
function buildTimeContext(timezone = 'UTC') {
  const now = new Date();
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });
    const parts = dtf.formatToParts(now);
    const tzLabel = parts.find((p) => p.type === 'timeZoneName')?.value || timezone;
    const timeStr = parts.map((p) => p.value).join('');
    return `CURRENT DATE & TIME (the owner's local clock — use it to interpret greetings, scheduling and "today/tomorrow"):\n- It is ${timeStr} for the owner right now.\n- Today is ${new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(now)}.`;
  } catch {
    return `CURRENT DATE & TIME:\n- ${now.toISOString()} UTC`;
  }
}

/** Resolve the owner's configured timezone, falling back to a sensible default. */
async function getOwnerTimezone() {
  const settings = await getSettings().catch(() => null);
  return settings?.businessHours?.timezone || env.businessHoursTimezone || 'UTC';
}

/** Conversational fallback when the owner lists/introduces their team. */
function buildFallbackTeamIntro(text, existingTeamNames = []) {
  const names = extractListedNames(text);
  const existing = new Set(existingTeamNames.map((n) => String(n).toLowerCase()));
  const fresh = names.filter((n) => !existing.has(n.toLowerCase()));
  const known = names.filter((n) => existing.has(n.toLowerCase()));

  let reply;
  if (!names.length) {
    reply =
      "Got it — you're setting up the team registry. Who's on your team? List the names and I'll check who's already registered, then we'll add the rest one by one.";
  } else if (!fresh.length) {
    reply = `Right — ${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} already on the team. Tell me what work you'd like to plan and who should handle it.`;
  } else {
    const first = fresh[0];
    const knownPart = known.length
      ? ` (${known.join(', ')} ${known.length > 1 ? 'are' : 'is'} already registered)`
      : '';
    reply = `Got it — I see ${names.length} team member${names.length > 1 ? 's' : ''}${knownPart}. **${first}** isn't registered yet. What's ${first}'s role and main skills (e.g. "graphic designer, strong in Figma")? And what email should I set up for their login? We'll go through the rest one by one, then you can tell me what campaign work you want to plan.`;
  }
  return { reply, draft: null, clientDraft: null, employeeDraft: null };
}

/** True when the message reads like a follow-up giving details about an employee. */
function looksLikeEmployeeDetail(text) {
  if (NEW_EMPLOYEE_INTENT.test(text)) return true;
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
  const hasRole =
    /designer|copywriter|content|social|community|seo|analytics|paid|ads|ppc|email|video|editor|web|wordpress|webflow|developer|brand|marketing|writer|specialist|manager/i.test(
      text
    );
  const hasName = /(?:^|[\s,])([A-Z]?[a-z]+)(?:\s+[A-Z][a-z]+)?\s+(?:is|does|handles|specializes|works|joins|email|at)\b/.test(text);
  return (hasEmail || hasRole) && hasName;
}

/**
 * Combine LLM-generated recommendations with deterministic data-driven ones.
 * LLM recs first (they're richer), then data recs, de-duplicated by headline.
 */
function mergeRecommendations(llmRecs = [], dataRecs = []) {
  const seen = new Set();
  const out = [];
  for (const r of [...llmRecs, ...dataRecs]) {
    const key = (r.title || '').toLowerCase().slice(0, 60);
    if (!r?.title || seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: ['warning', 'danger', 'info', 'assign'].includes(r.type) ? r.type : 'info',
      title: String(r.title).slice(0, 120),
      detail: r.detail ? String(r.detail).slice(0, 300) : '',
    });
  }
  return out.slice(0, 6);
}

/** Role → default skill mapping used by the fallback extractor. */
const ROLE_SKILL_MAP = {
  designer: ['Graphic Design', 'Figma', 'Branding'],
  copywriter: ['Copywriting', 'Content Strategy'],
  content: ['Content Strategy', 'Copywriting'],
  social: ['Social Media', 'Community Management'],
  community: ['Community Management', 'Social Media'],
  seo: ['SEO', 'Analytics'],
  analytics: ['Analytics'],
  'paid media': ['Google Ads', 'Meta Ads', 'PPC'],
  ads: ['Google Ads', 'Meta Ads', 'PPC'],
  ppc: ['Google Ads', 'Meta Ads', 'PPC'],
  email: ['Email Marketing'],
  video: ['Video Editing'],
  editor: ['Video Editing'],
  web: ['WordPress', 'Webflow', 'Landing Pages'],
  developer: ['WordPress', 'Webflow', 'Landing Pages'],
  wordpress: ['WordPress'],
  webflow: ['Webflow'],
  brand: ['Branding'],
  market: ['Market Research'],
  manager: [],
};

function skillsForRole(text) {
  const lower = text.toLowerCase();
  for (const [role, skills] of Object.entries(ROLE_SKILL_MAP)) {
    if (lower.includes(role)) return [...skills];
  }
  return [];
}

function randomPassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildFallbackEmployeeDraft(text) {
  const clean = text.replace(/\s+/g, ' ').trim();

  const nameMatch =
    clean.match(/(?:called|named)\s+["']?([A-Za-z][a-zA-Z.' -]{1,50})["']?/i) ||
    clean.match(/\b([A-Za-z][a-zA-Z']{1,30})\s+(?:is|does|handles|works on|specializes in|joins)\b/i) ||
    clean.match(/\b([A-Z][a-zA-Z' ]{1,60})\b(?:,|\.|$|\s+as\s+)/);
  const name = (nameMatch?.[1]?.trim() || 'New team member').replace(/^[a-z]/, (c) => c.toUpperCase());

  const emailMatch = clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

  const seniority = /lead\b/i.test(clean) ? 'LEAD'
    : /senior\b/i.test(clean) ? 'SENIOR'
    : /junior\b|intern\b|fresher\b/i.test(clean) ? 'JUNIOR' : 'MID';

  const capacityMatch = clean.match(/(\d+)\s*(?:tasks?\s*(?:at|concurrently|at once|simultaneously)|parallel tasks?|capacity)/i);
  const baseCapacity = capacityMatch ? Math.min(10, Math.max(1, Number(capacityMatch[1]))) : 3;

  const skills = skillsForRole(clean);

  const filled = {
    name,
    email: emailMatch?.[1] || '',
    seniorityTier: seniority,
    baseCapacity,
    strengthsNotes: skills.length ? `Specialist in ${skills.join(', ')}.` : '',
    skills,
  };

  const needsEmail = !filled.email;
  const reply = needsEmail
    ? `Got it — I've started a profile for **${name}**. What email should I set up for their login? I'll fill in the skills from their role and you can adjust before adding.`
    : `Got it — I've started a profile for **${name}**. Review the details below, adjust their skills or capacity, and hit **Add employee** when it looks right. I'll create their login and they'll appear in the team.`;

  return { employeeDraft: filled, reply };
}

/** Explicit "make/create/set up their logins" wording — an action request, not campaign work. */
const LOGIN_CREATE_INTENT =
  /\b(?:make|create|set\s*up|register|add|generate)\s+(?:their|the|his|her|my|new|these|them|all|each)?\s*(?:employees?|workers?|staff|team)?\s*(?:logins?|accounts?|ids?)\b/i;

/** Extract a list of person names from "make their logins for A, B and C" style text. */
function extractLoginNames(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const alias = { aisha: 'ayesha', basra: 'bushra', hamnah: 'hamna' };
  const known = ['ezza', 'ayesha', 'nosheen', 'bushra', 'hamna', 'fiona', 'dave', 'carol', 'bob', 'alice', 'elena'];
  const found = [];
  const lower = clean.toLowerCase();
  for (const name of known) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) found.push(name);
  }
  const canonical = found.map((n) => alias[n] || n);
  // Fallback: also try capitalized words before "and" / comma when no known names matched.
  if (!canonical.length) {
    const m = clean.match(/(?:logins?|accounts?|ids?)\s*(?:for|of)\s+([A-Za-z][A-Za-z ,'-]{3,60})/i);
    if (m) {
      const raw = m[1];
      canonical.push(...raw.split(/,|\band\b/gi).map((s) => s.trim().replace(/^[\s.,;:'"]+|[\s.,;:'"]+$/g, '')).filter((s) => s.length >= 2 && /^[A-Za-z]/.test(s)).map((s) => alias[s.toLowerCase()] || s));
    }
  }
  return [...new Set(canonical.map((n) => n.trim().replace(/^[a-z]/, (c) => c.toUpperCase())))];
}

/** Bulk login creation fallback — builds one profile per named person using name@coo.app emails. */
function buildFallbackEmployeeDrafts(text, teamNames = []) {
  const names = extractLoginNames(text);
  const existing = new Set(teamNames.map((n) => String(n).toLowerCase()));
  const fresh = names.filter((n) => !existing.has(n.toLowerCase()));
  if (!fresh.length) {
    const known = names.filter((n) => existing.has(n.toLowerCase()));
    return {
      employeeDrafts: null,
      employeeDraft: null,
      reply: known.length
        ? `${known.join(', ')} ${known.length > 1 ? 'are' : 'is'} already on the team with logins. Tell me what work to plan for them.`
        : "I can set up logins for your team — tell me who to add (first names are enough) and I'll prepare their profiles.",
    };
  }
  const drafts = fresh.map((n) => {
    const lower = n.toLowerCase();
    const skills = skillsForRole(lower);
    return {
      name: n,
      email: `${lower}@coo.app`,
      seniorityTier: /lead|senior/i.test(lower) ? 'SENIOR' : /junior|intern/i.test(lower) ? 'JUNIOR' : 'MID',
      baseCapacity: 3,
      strengthsNotes: skills.length ? `Specialist in ${skills.join(', ')}.` : '',
      skills,
    };
  });
  const reply = `I've prepared ${drafts.length} login profile${drafts.length > 1 ? 's' : ''} for you to review — **${drafts.map((d) => d.name).join(', ')}**. I used **name@coo.app** emails as placeholders (edit them on each card before creating). Review the profiles below and hit **Create ${drafts.length} logins** — each person gets their login and password.`;
  return { employeeDrafts: drafts, employeeDraft: null, reply };
}

function extractClientName(text) {
  const patterns = [
    /(?:called|named)\s+["']?([A-Z][A-Za-z0-9&.' -]{1,60})["']?/i,
    /(?:a new client|new brand|new business)[^.]*?\b([A-Z][A-Za-z0-9&.' -]{1,60})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim().split(/\s{2,}/)[0];
  }
  return null;
}

function buildFallbackClientDraft(text) {
  if (!NEW_CLIENT_INTENT.test(text)) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  const name = extractClientName(clean) || 'New client';

  const extract = (patterns, maxLen = 80) => {
    for (const re of patterns) {
      const m = clean.match(re);
      if (!m) continue;
      const raw = (m[1] ?? m[0] ?? '').trim().replace(/[.,;]$/, '').trim();
      if (raw) return raw.split(/\s{2,}/)[0].slice(0, maxLen);
    }
    return '';
  };

  const description = extract([
    /(?:organic|premium|affordable|direct-to-consumer|dtc|subscription|online|boutique|eco-friendly|plant-based|natural|handmade|luxury|budget|local|sustainable|fresh|gourmet)[^,.;]{2,90}/i,
    /(?:is|are)\s+a\s+([A-Za-z0-9][^,.;]{4,80})/i,
  ]).replace(/\s+(?:called|named)\s+[A-Z][A-Za-z0-9&.' -]+/i, '');

  const targetUsers = extract([
    /(?:target(?:ing)?|audience|aimed at|for)\s+(?:is\s+|are\s+|being\s+)?([A-Za-z][^,.;]{2,80})/i,
    /(?:millennial|gen\s*z|baby\s*boomer|women|men|parents|students|professionals|businesses|small\s*business|enterprise|families|seniors|teens|kids|pet\s*owners|fitness|health)[^,.;]{0,60}/i,
  ]);

  const techStack = extract([
    /(?:sell(?:s)?\s+on|sells?\s+through|use(?:s)?\s+|via|through)\s+([A-Za-z][A-Za-z0-9 &.-]{1,50})/i,
    /\b(shopify|klaviyo|wordpress|webflow|woocommerce|amazon|etsy|stripe|mailchimp|activecampaign|google\s*ads|meta\s*ads|facebook\s*ads|instagram|tiktok|linkedin|youtube)\b/i,
  ]).split(/\s+(?:and|to|so|then)\b/i)[0];

  const goals = extract([
    /(?:goal(?:s)?\s+(?:is|are|to)\s+|want(?:s)?\s+to\s+|looking\s+to\s+|aim(?:s)?\s+to\s+|trying\s+to\s+|hop(?:e|ing)\s+to\s+)([^,.;]{3,90})/i,
    /(?:grow|increase|boost|drive|launch|scale|build|raise|generate|improve|double|expand)\s+[^,.;]{3,80}/i,
  ]);

  const filled = { name, description, targetUsers, techStack, goals };
  const hasDetails = Object.values(filled).some((v) => v);

  const reply = hasDetails
    ? `Got it — I've started a profile for **${name}**. Review the details below; fill anything I missed (like platforms & channels or campaign goals) and hit **Add to portfolio** when it looks right.`
    : `Got it — I'll start a new client profile. Tell me a bit more so the portfolio entry is complete: what do they sell, who's the target audience, which platforms & channels do they use, and what are the campaign goals?`;

  return { clientDraft: filled, reply };
}

/**
 * Fallback detector for "reschedule / edit / reassign an existing task"
 * when the LLM is unreachable. Uses the live task rows injected for context.
 */
function buildFallbackTaskChanges(text, taskRows = []) {
  if (!text || !taskRows.length) return null;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const changes = [];

  // Which workers are mentioned as a reassignment target?
  const workers = taskRows.map((t) => t.assignments?.[0]?.worker?.user?.name).filter(Boolean);
  const teamNames = [...new Set(workers)];

  const reassignRe = new RegExp(
    `(?:give|assign|reassign|move|shift|transfer|hand)\\s+(?:it|the task|this|that)?\\s*["']?([^"']{3,80}?)["']?\\s+(?:to|over to)\\s+([A-Z][a-zA-Z]+)`,
    'i'
  );
  const reassignMatch = clean.match(reassignRe);
  if (reassignMatch) {
    const targetName = reassignMatch[2];
    if (teamNames.some((n) => String(n).toLowerCase() === targetName.toLowerCase())) {
      changes.push({
        action: 'reassign',
        taskId: null,
        taskMatch: reassignMatch[1].trim().replace(/^(?:the|my|our)\s+/i, ''),
        newDeadline: null,
        newAssignee: targetName,
        fields: null,
        reason: 'Owner asked to reassign this task.',
      });
    }
  }

  const reschedRe = /(?:reschedule|postpone|push(?: back)?|move|shift|change\s+the\s+deadline|give\s+(?:it|this|that)\s+more\s+time)\s+["']?([^"';,.!]{3,80})["']?\s+(?:to|by|until)\s+(.+)/i;
  const reschedMatch = clean.match(reschedRe);
  if (reschedMatch) {
    const raw = reschedMatch[2].trim();
    // Map natural language to YYYY-MM-DD via the current date.
    const target = parseRelativeDate(raw);
    if (target) {
      changes.push({
        action: 'reschedule',
        taskId: null,
        taskMatch: reschedMatch[1].trim().replace(/^(?:the|my|our)\s+/i, ''),
        newDeadline: target,
        newAssignee: null,
        fields: null,
        reason: 'Owner asked to reschedule this task.',
      });
    }
  }

  return changes.length ? changes : null;
}

/** Convert "tomorrow", "friday", "next week", or YYYY-MM-DD into a date string. */
function parseRelativeDate(raw) {
  const text = String(raw || '').trim().toLowerCase();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return null;
  }
  const now = new Date();
  const days = { today: 0, tomorrow: 1, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
  const nextWeek = text.match(/next\s+week/i);
  if (nextWeek) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  for (const [key, offset] of Object.entries(days)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) {
      const target = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return target.toISOString().slice(0, 10);
    }
  }
  const n = text.match(/^(\d{1,2})\s+days?$/i);
  if (n) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(n[1]));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Fallback detector for "edit/delete an existing product" when the LLM is
 * unreachable. Uses the live product rows injected for context.
 */
function buildFallbackProductChanges(text, products = []) {
  if (!text || !products.length) return null;
  const clean = String(text).replace(/\s+/g, ' ').trim();

  const deleteRe =
    /(?:delete|remove|drop|kill|archive|deactivate|take\s*down|stop\s*(?:working\s*on|with))\s+(?:the\s+)?["']?([^"';,.!]{2,60})["']?\s*(?:account|client|product|brand)?\b/i;
  const del = clean.match(deleteRe);
  if (del) {
    const q = del[1].trim().replace(/^(?:the|my|our)\s+/i, '');
    const match = products.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (match) {
      return [
        {
          action: 'delete',
          productId: match.id,
          productMatch: match.name,
          fields: null,
          reason: 'Owner asked to remove this product.',
        },
      ];
    }
  }

  // Rename: "rename X to Y" / "change X's name to Y"
  const renameRe = /rename\s+["']?([^"']{2,60})["']?\s+(?:to|as)\s+["']?([^"']{2,60})["']?/i;
  const rename = clean.match(renameRe);
  if (rename) {
    const q = rename[1].trim().replace(/^(?:the|my|our)\s+/i, '');
    const match = products.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (match) {
      return [
        {
          action: 'edit',
          productId: match.id,
          productMatch: match.name,
          fields: { name: rename[2].trim() },
          reason: 'Owner asked to rename this product.',
        },
      ];
    }
  }

  // Edit details: "update X's description/goals/audience..."
  const editRe = /(?:edit|update|change|modify)\s+(?:the\s+)?["']?([^"';,.!]{2,60})["']?\s+(?:description|target|audience|platforms|goals|name|details|profile)/i;
  const edit = clean.match(editRe);
  if (edit) {
    const q = edit[1].trim().replace(/^(?:the|my|our)\s+/i, '');
    const match = products.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (match) {
      return [
        {
          action: 'edit',
          productId: match.id,
          productMatch: match.name,
          fields: {},
          reason: 'Owner asked to edit this product.',
        },
      ];
    }
  }

  return null;
}

const EMAIL_INTENT = /\b(?:email|e-?mail|send\s+(?:me|them|him|her|us)\s+(?:an?\s+)?(?:email|message|mail)|compose|draft\s+(?:an?\s+)?email)\b/i;

/** Detect who the email should go to when the LLM is unreachable. */
function buildFallbackEmailDraft(text, teamNames = [], ownerEmail = '') {
  if (!EMAIL_INTENT.test(text)) return null;
  const clean = String(text || '').replace(/\s+/g, ' ').trim();

  // Named recipient among the team?
  let to = '';
  const nameMatch = clean.match(/(?:email|send|message|mail|compose|draft)\s+[^,.]*?(?:to|for)\s+([A-Z][a-zA-Z' -]{1,40})/i);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    to = teamNames.find((n) => n.toLowerCase().startsWith(name.toLowerCase())) || '';
  }
  if (!to) to = ownerEmail;

  // Subject: everything after "about" or a quoted topic.
  let subject = 'Update';
  const about = clean.match(/(?:about|regarding|re:)\s+["']?([^"',.;]{2,60})["']?/i);
  if (about) subject = about[1].trim().replace(/^the\s+/i, '');

  const body = `Hi,\n\nFollowing up on: ${subject}.\n\n${subject ? 'Here’s the update you asked for.' : 'Here’s the information you asked for.'}\n\nLet me know if you need anything else.\n\nBest,\nAgencyOps`;

  return { to, subject, body };
}

function fallbackReply(lastUserMessage, teamNames = [], taskRows = [], products = [], ownerEmail = '') {
  const taskChanges = buildFallbackTaskChanges(lastUserMessage, taskRows);
  if (taskChanges?.length) {
    return {
      reply:
        "I've noted the changes you asked for. They're proposals — review them below and hit **Apply changes** to make them stick.",
      draft: null,
      clientDraft: null,
      employeeDraft: null,
      employeeDrafts: null,
      taskChanges,
    };
  }
  const productChanges = buildFallbackProductChanges(lastUserMessage, products);
  if (productChanges?.length) {
    return {
      reply:
        "I've prepared those portfolio changes for you — review them below and hit **Apply changes** to make them stick.",
      draft: null,
      clientDraft: null,
      employeeDraft: null,
      employeeDrafts: null,
      productChanges,
    };
  }
  const emailDraft = buildFallbackEmailDraft(lastUserMessage, teamNames, ownerEmail);
  if (emailDraft) {
    return {
      reply: "I've drafted that email for you — review it below and hit **Send email** when you're happy with it.",
      draft: null,
      clientDraft: null,
      employeeDraft: null,
      employeeDrafts: null,
      emailDraft,
    };
  }
  if (LOGIN_CREATE_INTENT.test(lastUserMessage)) {
    return buildFallbackEmployeeDrafts(lastUserMessage, teamNames);
  }
  if (TEAM_INTRO_INTENT.test(lastUserMessage) && !WORK_INTENT.test(lastUserMessage)) {
    return buildFallbackTeamIntro(lastUserMessage, teamNames);
  }
  if (NEW_CLIENT_INTENT.test(lastUserMessage)) {
    return buildFallbackClientDraft(lastUserMessage);
  }
  if (NEW_EMPLOYEE_INTENT.test(lastUserMessage) || looksLikeEmployeeDetail(lastUserMessage)) {
    return buildFallbackEmployeeDraft(lastUserMessage);
  }
  if (lastUserMessage && lastUserMessage.trim().length >= 40) {
    const draft = buildFallbackIngestion(lastUserMessage);
    return {
      reply:
        "Here's a draft plan for that. I've broken it into a 15-day prep sprint, the main campaign, and the scale/report phase — plus a few suggested tasks you didn't mention. Review it below and hit Approve when you're ready, or tell me what to change.",
      draft,
      clientDraft: null,
      employeeDraft: null,
      employeeDrafts: null,
    };
  }
  return {
    reply:
      "I'm here to help you plan and run campaigns. Describe the work you want done — a launch, ads, content, a website, an email flow — and I'll break it into tasks and suggest who should do them. You can also tell me about a new client or a new team member and I'll add them.",
    draft: null,
    clientDraft: null,
    employeeDraft: null,
    employeeDrafts: null,
  };
}

/**
 * Heuristic fallback: when the owner names a team member (e.g. "give the
 * landing page to Dave"), match those names to tasks by skill overlap so
 * the draft still assigns the right people even without the LLM.
 */
async function applyDiscussedAssignees(draft, text) {
  if (!draft || !text) return draft;
  const workers = await prisma.worker.findMany({
    include: { skills: { include: { skill: true } }, user: true },
  });
  const lower = text.toLowerCase();
  const mentioned = workers.filter((w) =>
    w.user.name.toLowerCase().split(/\s+/).some((part) => part.length >= 3 && lower.includes(part))
  );
  if (!mentioned.length) return draft;

  const bestFit = (task) => {
    const tags = (task.skillTags || []).map((t) => String(t).toLowerCase());
    let best = null;
    let bestScore = 0;
    for (const w of mentioned) {
      const workerSkills = w.skills.map((s) => s.skill.name.toLowerCase());
      const overlap = tags.filter((t) => workerSkills.includes(t)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        best = w;
      }
    }
    return bestScore > 0 ? best : null;
  };

  for (const item of draft.roadmap || []) {
    for (const task of item.tasks || []) {
      if (!task.assignee) {
        const w = bestFit(task);
        if (w) task.assignee = w.user.name;
      }
    }
  }
  for (const task of draft.suggestedTasks || []) {
    if (!task.assignee) {
      const w = bestFit(task);
      if (w) task.assignee = w.user.name;
    }
  }
  return draft;
}

/**
 * Chat with the AI-COO. Takes a conversation history and returns a
 * conversational reply plus (optionally) a draft roadmap to approve.
 */
/**
 * Core AI chat pipeline — shared by the HTTP route and the email bridge.
 * Validates input, runs the full research → think → answer → review pipeline,
 * persists the conversation, and returns the AI result object.
 */
export async function processAiMessage({ userId, messages = [], productIds = [], conversationId, model }) {
  if (!Array.isArray(messages) || !messages.length) {
    throw Object.assign(new Error('messages must be a non-empty array'), { status: 400 });
  }

  // Strip draft payloads before sending history to the model.
  const history = messages
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  const lastUserMessage = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const firstUserMessage = history.find((m) => m.role === 'user')?.content || '';

    // ===== NEUTRAL GREETINGS =====
    // Pure small talk gets a neutral reply without running the heavy pipeline:
    // no research, no thinking trace, no ops snapshot, no recommendations.
    if (isPureGreeting(lastUserMessage)) {
      const reply = GREETING_REPLIES[Math.floor(Math.random() * GREETING_REPLIES.length)];
      const result = {
        reply,
        draft: null,
        clientDraft: null,
        employeeDraft: null,
        employeeDrafts: null,
        taskChanges: null,
        productChanges: null,
        emailDraft: null,
        recommendations: [],
        fallback: false,
        fallbackReason: null,
        thinking: null,
        research: null,
        webResearch: null,
        review: null,
        modelUsed: null,
        modelLabel: null,
        modelSelection: model || env.modelSelection || 'auto',
      };
      const persisted = await persistConversation(userId, {
        conversationId,
        titleSeed: firstUserMessage,
        userContent: lastUserMessage,
        assistantContent: reply,
        draft: null,
        meta: { greeting: true },
      }).catch(() => null);
      if (persisted?.conversationId) result.conversationId = persisted.conversationId;
      result.conversationTitle = persisted?.conversationTitle || null;
      return result;
    }

    // ===== RESEARCH =====
    // Gather live evidence about exactly what the owner is talking about:
    // mentioned employees, products, skills, deadlines, open pool, recent
    // evaluations, past AI decisions, and long-term memory.
    const stage = (name) => logger.info(`[ai-chat] ${name}`);
    stage(`request arrived (${history.length} messages, last=${lastUserMessage.slice(0, 60)}…)`);
    const [memoryCtx, research] = await Promise.all([
      getMemoryContext(userId, lastUserMessage).catch(() => ({ text: '', list: [] })),
      buildResearchDossier({ userId, text: lastUserMessage, history, productIds }).catch(() => ({
        text: '',
        workerNames: [],
        productNames: [],
      })),
    ]);
    stage('research dossier + memory done');

    // The owner's local clock — injected so the AI always knows what time it
    // is for the person it's talking to (greetings, "today/tomorrow", deadlines).
    const timeCtx = buildTimeContext(await getOwnerTimezone());

    const dossierText = [
      timeCtx,
      research.text || 'RESEARCH DOSSIER: (empty)',
      memoryCtx.text || 'MEMORY: no long-term memories yet',
    ].join('\n\n');

    let productContext = '';
    if (productIds?.length) {
      const products = await prisma.product.findMany({ where: { id: { in: productIds } }, take: 3 });
      productContext = products
        .map((p) => `- Client: ${p.name}\n  ${p.description || ''}\n  Goals: ${p.goals || ''}`)
        .join('\n');
    }

    // Portfolio memory: tell the AI which clients already exist so it never
    // tries to re-create one, and can confirm it's already onboarded.
    const existingClients = await prisma.product.findMany({
      select: { id: true, name: true, description: true, targetUsers: true, techStack: true, goals: true, active: true },
      orderBy: { name: 'asc' },
    });
    const clientList = existingClients.map((p) => p.name).join(', ');
    const productContextList = existingClients.length
      ? existingClients
          .map((p) => `- id=${p.id} | "${p.name}" | active=${p.active} | target=${p.targetUsers || '—'} | platforms=${p.techStack || '—'} | goals=${p.goals || '—'}`)
          .join('\n')
      : '(no products in the portfolio yet)';

    // Team memory: same for employees.
    const team = await prisma.worker.findMany({
      include: { user: { select: { name: true, email: true } } },
    });
    const teamList = team.map((w) => `${w.user.name} (${w.user.email})`).join(', ');
    const teamNames = team.map((w) => w.user.name);

    // Live task memory: the AI needs to see existing tasks so it can propose
    // rescheduling / editing / reassigning them on the owner's request.
    const taskRows = await prisma.task.findMany({
      where: { status: { in: ['PENDING', 'WORKING_ON_IT', 'IN_REVISION'] } },
      include: {
        assignments: { where: { active: true }, include: { worker: { include: { user: { select: { name: true, email: true } } } } } },
      },
      orderBy: [{ priority: 'asc' }, { deadline: 'asc' }],
      take: 60,
    });
    const taskContext = taskRows.length
      ? taskRows
          .map((t) => {
            const a = t.assignments[0]?.worker?.user;
            return `- id=${t.id} | "${t.title}" | status=${t.status} | deadline=${t.deadline ? t.deadline.toISOString().slice(0, 10) : 'none'} | assignee=${a ? a.name : 'unassigned'}`;
          })
          .join('\n')
      : '(no active tasks in the system yet)';

    // Live operational snapshot + data-driven recommendations (always available).
    const ops = await buildOpsContext().catch(() => null);

    // ===== THINK =====
    const settings = await getSettings().catch(() => null);
    const modelSelection = model || settings?.modelSelection || env.modelSelection || 'auto';
    const thinkModel = resolveModel(modelSelection);
    stage(`think pass (model=${thinkModel})…`);
    const thinking = await think(history, dossierText, { model: thinkModel }).catch(() => null);
    stage(`think pass done (intent=${thinking?.intent || 'unknown'})`);

    const answerPrompt = `CLIENT CONTEXT (use it when relevant):\nExisting portfolio clients: ${clientList || 'none yet'}\n${
      productContext ? `\nCurrently linked client:\n${productContext}` : ''
    }\n\nPRODUCT CONTEXT (existing products you may be asked to edit or delete):\n${productContextList}\n\nTEAM CONTEXT:\nExisting employees: ${teamList || 'none yet'}\n\nOWNER CONTEXT:\nThe agency owner's email address is ${env.ownerEmail || 'not configured'} — use it as the default "to" when the owner asks you to email THEM (e.g. "email me X").\n\nTASK CONTEXT (existing tasks you may be asked to change):\n${taskContext}\n\n${ops?.text || 'OPERATIONS SNAPSHOT: unavailable'}\n\n${dossierText}`;

    // ===== EMPLOYEE MANAGEMENT POLICY =====
    // When the owner disables employee creation/editing in Settings, the AI
    // must not propose new logins or claim it can edit profiles.
    const empPolicy = await getEmployeeManagementPolicy().catch(() => ({ createEnabled: true, editEnabled: true }));
    if (!empPolicy.createEnabled) {
      answerPrompt += `\n\nIMPORTANT — EMPLOYEE CREATION IS DISABLED: The agency owner has turned OFF employee creation in Settings. Never return employeeDraft or employeeDrafts. If they ask to add employees, make logins, or onboard new team members, reply that employee creation is currently turned off in Settings → Employee Management, and that they can enable it there.`;
    }
    if (!empPolicy.editEnabled) {
      answerPrompt += `\n\nIMPORTANT — EMPLOYEE EDITING IS DISABLED: The agency owner has turned OFF employee editing in Settings. If they ask to change an employee's details, reply that editing is currently turned off in Settings → Employee Management.`;
    }

    // ===== ANSWER (with optional autonomous web research) =====
    const webResearchEnabled =
      settings?.webResearchEnabled !== false && env.webResearchEnabled !== false;

    // Auto mode routes the heavy pass by the thinking intent: planning /
    // onboarding gets V4 Pro, simple Q&A stays on V4 Flash.
    const answerModel = resolveModel(modelSelection, thinking?.intent);
    stage(`answer pass (model=${answerModel}, webResearch=${webResearchEnabled})…`);
    const { parsed, webResearch } = await answerWithWebResearch(
      SYSTEM_PROMPT,
      history,
      answerPrompt,
      thinking,
      { webResearchEnabled, model: answerModel }
    ).catch(() => ({ parsed: null, webResearch: null }));
    stage(`answer pass done (parsed=${!!parsed}${parsed?.draft ? ', draft' : ''}${parsed?.employeeDraft ? ', employeeDraft' : ''}${parsed?.clientDraft ? ', clientDraft' : ''}${webResearch ? `, ${webResearch.queries?.length || 0} searches / ${webResearch.sources?.length || 0} sources` : ''})`);

    // Build a WEB RESEARCH FINDINGS block so the review pass (and anything
    // downstream) sees the same external facts the model used.
    let webFindingsText = '';
    if (webResearch?.queries?.length || webResearch?.sources?.length) {
      const lines = ['WEB RESEARCH FINDINGS (current external evidence gathered live):'];
      if (webResearch.queries?.length) {
        lines.push('Queries run:', ...webResearch.queries.map((q) => `- ${q}`));
      }
      if (webResearch.sources?.length) {
        lines.push('Sources:', ...webResearch.sources.map((s) => `- ${s.title} — ${s.url}`));
      }
      lines.push(
        'Claims about current trends, platform changes, pricing, benchmarks or examples were gathered from the pages above.',
        'Do NOT flag such claims as invented solely because they are not in the internal RESEARCH DOSSIER.'
      );
      webFindingsText = lines.join('\n');
    }

    const finish = async ({ fb, parsed = null, thinking = null, review = null }) => {
      const draft = parsed?.draft ?? fb?.draft ?? null;
      const withAssignees = await applyDiscussedAssignees(draft, lastUserMessage);
      const llmRecs = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
      const dataRecs = await computeRecommendations({ draft: withAssignees, productIds }).catch(() => []);
      const merged = mergeRecommendations(llmRecs, dataRecs);

      // Review issues become recommendations so the owner sees the self-check.
      if (review?.issues?.length) {
        for (const issue of review.issues.slice(0, 3)) {
          merged.push({ type: 'warning', title: 'Self-review flagged', detail: issue });
        }
      }

      // Prefer the bulk drafts array when the owner asked for several logins.
      // Both are suppressed entirely when employee creation is disabled.
      const employeeDrafts =
        empPolicy.createEnabled &&
        ((parsed?.employeeDrafts && parsed.employeeDrafts.length) || (fb?.employeeDrafts && fb.employeeDrafts.length))
          ? (parsed?.employeeDrafts && parsed.employeeDrafts.length ? parsed.employeeDrafts : fb.employeeDrafts)
          : null;

      // THE GOLDEN RULE — one mode per reply. PLAN/CREATION outputs (draft,
      // clientDraft, employeeDraft(s)) and CHANGES outputs (taskChanges,
      // productChanges) are mutually exclusive. If the AI mixed both, the
      // concrete change proposals win and the plan/creation artifacts are dropped.
      let taskChanges = parsed?.taskChanges?.length ? parsed.taskChanges : fb?.taskChanges?.length ? fb.taskChanges : null;
      let productChanges = parsed?.productChanges?.length ? parsed.productChanges : fb?.productChanges?.length ? fb.productChanges : null;
      let finalDraft = withAssignees;
      let finalClientDraft = parsed?.clientDraft ?? fb?.clientDraft ?? null;
      let finalEmployeeDraft = empPolicy.createEnabled ? (parsed?.employeeDraft ?? fb?.employeeDraft ?? null) : null;
      let finalEmployeeDrafts = employeeDrafts;

      const hasChanges = !!(taskChanges?.length) || !!(productChanges?.length);
      const hasPlan = !!finalDraft || !!finalClientDraft || !!finalEmployeeDraft || !!finalEmployeeDrafts;
      if (hasChanges && hasPlan) {
        finalDraft = null;
        finalClientDraft = null;
        finalEmployeeDraft = null;
        finalEmployeeDrafts = null;
      }

      return {
        reply: parsed?.reply ?? fb?.reply ?? '',
        draft: finalDraft,
        clientDraft: finalClientDraft,
        employeeDraft: finalEmployeeDraft,
        employeeDrafts: finalEmployeeDrafts,
        taskChanges,
        productChanges,
        emailDraft: parsed?.emailDraft ?? fb?.emailDraft ?? null,
        recommendations: merged.slice(0, 8),
        fallback: !parsed,
        fallbackReason: parsed ? null : 'ai_unreachable_or_unparsable',
        thinking: thinking || null,
        research: research.text ? { mentions: { employees: research.mentionedWorkers?.length || 0, products: research.mentionedProducts?.length || 0 }, summary: null } : null,
        webResearch: webResearch?.queries?.length || webResearch?.sources?.length ? webResearch : null,
        review: review?.issues?.length ? { issues: review.issues, advice: review.advice || null } : null,
        modelUsed: answerModel,
        modelLabel: modelLabel(answerModel),
        modelSelection,
      };
    };

    if (!parsed || typeof parsed.reply !== 'string') {
      let fb = fallbackReply(lastUserMessage, teamNames, taskRows, existingClients, env.ownerEmail);
      if (!empPolicy.createEnabled && (fb.employeeDraft || (fb.employeeDrafts && fb.employeeDrafts.length))) {
        fb = {
          reply:
            "Employee creation is currently turned off in Settings → Employee Management. I can set up their logins as soon as you flip that toggle on.",
          draft: null,
          clientDraft: null,
          employeeDraft: null,
          employeeDrafts: null,
          emailDraft: null,
        };
      }
      const result = await finish({ fb, thinking });
      // Persist fallback exchanges too, so the thread is never lost and the
      // frontend always gets back a conversationId to continue the thread.
      const persisted = await persistConversation(userId, {
        conversationId,
        titleSeed: firstUserMessage,
        userContent: lastUserMessage,
        assistantContent: result.reply,
        draft: result.draft,
        meta: {
          thinking: result.thinking,
          recommendations: result.recommendations,
          review: result.review,
          webResearch: result.webResearch,
          taskChanges: result.taskChanges,
          productChanges: result.productChanges,
          emailDraft: result.emailDraft,
          modelUsed: result.modelUsed,
          modelLabel: result.modelLabel,
        },
      }).catch(() => null);
      if (persisted?.conversationId) result.conversationId = persisted.conversationId;
      result.conversationTitle = persisted?.conversationTitle || null;
      return result;
    }

    // ===== REVIEW =====
    stage('review pass…');
    const review = await reviewAnswer(
      lastUserMessage,
      parsed,
      webFindingsText ? `${dossierText}\n\n${webFindingsText}` : dossierText,
      thinking,
      { model: resolveModel(modelSelection) }
    ).catch(() => ({ issues: [], advice: '' }));
    stage(`review pass done (${review.issues?.length || 0} issues)`);

    await recordAiDecision(
      'AUTO_GENERATE',
      { hasDraft: !!parsed.draft, hasClientDraft: !!parsed.clientDraft, hasEmployeeDraft: !!parsed.employeeDraft, hasTaskChanges: !!(parsed.taskChanges?.length), hasProductChanges: !!(parsed.productChanges?.length), thinking: !!thinking },
      {
        entityId: null,
        rationale: 'AI chat conversation produced a reply (and possibly a draft plan / client profile / employee profile / task changes).',
      }
    ).catch(() => {});

    const result = await finish({ parsed, thinking, review });

    // Persist the exchange into the conversation thread (fast, awaited so the
    // client gets the conversationId to continue the thread).
    const persisted = await persistConversation(userId, {
      conversationId,
      titleSeed: firstUserMessage,
      userContent: lastUserMessage,
      assistantContent: result.reply,
      draft: result.draft,
      meta: {
        thinking: result.thinking,
        recommendations: result.recommendations,
        review: result.review,
        webResearch: result.webResearch,
        taskChanges: result.taskChanges,
        productChanges: result.productChanges,
        emailDraft: result.emailDraft,
        modelUsed: result.modelUsed,
        modelLabel: result.modelLabel,
      },
    }).catch(() => null);
    if (persisted?.conversationId) result.conversationId = persisted.conversationId;
    result.conversationTitle = persisted?.conversationTitle || null;

    // Extract durable memories from this exchange — best effort, non-blocking.
    persistMemories(userId, lastUserMessage, result.reply)
      .then((n) => { result.memoriesSaved = n; })
      .catch(() => {});

    stage(`response sent (fallback=${result.fallback})`);
    return result;
}

router.post('/', auth, adminOnly, aiLimiter, async (req, res, next) => {
  try {
    const { messages = [], productIds = [], conversationId, model } = req.body;
    const result = await processAiMessage({ userId: req.user.id, messages, productIds, conversationId, model });
    res.json(result);
  } catch (e) {
    logger.error(`[ai-chat] route error:`, e?.stack || e);
    next(e);
  }
});

/** Save the exchange into a conversation thread (creating one if needed). */
async function persistConversation(userId, { conversationId, titleSeed, userContent, assistantContent, draft, meta }) {
  let conversation = null;
  if (conversationId) {
    conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  }
  if (!conversation) {
    const title = (titleSeed || 'New conversation').replace(/\s+/g, ' ').trim().slice(0, 60) || 'New conversation';
    conversation = await prisma.conversation.create({ data: { userId, title } });
  }

  await prisma.conversationMessage.createMany({
    data: [
      { conversationId: conversation.id, role: 'user', content: userContent },
      {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
        draft: draft || undefined,
        meta: meta || undefined,
      },
    ],
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  return { conversationId: conversation.id, conversationTitle: conversation.title };
}

/** Extract and store durable memories from one exchange. Returns count saved. */
async function persistMemories(userId, userContent, assistantContent) {
  const extracted =
    (await extractMemoriesFromExchange(userContent, assistantContent).catch(() => [])) ||
    fallbackExtractMemories(userContent);
  return saveMemories(userId, extracted, 'chat').catch(() => 0);
}

export default router;
