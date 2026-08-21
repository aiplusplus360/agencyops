import { chat, parseJson } from './client.js';
import { recordAiDecision } from '../../lib/utils.js';
import prisma from '../../lib/prisma.js';

const SYSTEM_PROMPT = `You are the AI-COO of a marketing agency operations engine. You convert the agency owner's raw brain-dump into a structured campaign roadmap.

Given an agency brain-dump (and optional client context), produce JSON with this exact shape:
{
  "visionStatement": "one-paragraph summary",
  "objectives": ["objective 1", "objective 2"],
  "roadmap": [
    {
      "title": "Milestone title",
      "horizon": "D15" | "D30" | "D60_90",
      "description": "short description",
      "tasks": [
        {
          "title": "granular marketing task title",
          "description": "what and why",
          "acceptanceCriteria": ["criterion 1"],
          "skillTags": ["Content Strategy", "Google Ads"],
          "effortHours": 4,
          "priority": 1 | 2 | 3
        }
      ]
    }
  ],
  "suggestedTasks": [
    {
      "title": "task the owner did NOT mention but the campaign clearly needs",
      "description": "why it matters",
      "acceptanceCriteria": ["criterion"],
      "skillTags": ["..."],
      "effortHours": 3,
      "priority": 2
    }
  ],
  "duplicateFlags": ["list of overlaps with existing work, or []"]
}

Rules:
- Generate GRANULAR, client-ready marketing tasks (not vague items): creative briefs, landing pages, ad sets, email flows, content calendars, social scripts, SEO audits, analytics/reporting deliverables. Use agency industry knowledge to fill in steps the owner didn't spell out.
- IMPORTANT — task titles must NEVER contain an employee's name (no "Name:" prefixes, no "task for X"). Titles describe only the WORK. Employee names belong in the "assignee" field only (and only when the owner named someone).
- horizon D15 = immediate quick wins / launch prep, D30 = launch & campaign milestones, D60_90 = scaling, retention and reporting.
- strict realistic effortHours per task.
- skillTags must be plain, common marketing skill names (e.g. Content Strategy, Copywriting, SEO, Google Ads, Meta Ads, PPC, Social Media, Email Marketing, Graphic Design, Branding, Figma, WordPress, Webflow, Landing Pages, Analytics, Video Editing, Market Research, Community Management).
- Return ONLY valid JSON.`;

async function getProductContext(productIds) {
  if (!productIds || !productIds.length) return '';
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { documents: true },
  });
  return products
    .map((p) => {
      let s = `- Client: ${p.name}\n  ${p.description || ''}\n  Platforms/Channels: ${p.techStack || 'n/a'}\n  Campaign Goals: ${p.goals || ''}`;
      const docText = p.documents
        .slice(0, 3)
        .map((d) => (d.extractedText ? d.extractedText.slice(0, 1500) : ''))
        .join('\n  ');
      if (docText) s += `\n  Docs excerpt: ${docText}`;
      return s;
    })
    .join('\n');
}

export async function ingestVision({ rawText, productIds = [], existingWork = '' }) {
  const productContext = await getProductContext(productIds);

  const userMsg = [
    productContext ? `PRODUCT CONTEXT:\n${productContext}\n` : '',
    `EXISTING WORK (check for duplicates):\n${existingWork || 'none'}\n`,
    `BRAIN-DUMP:\n${rawText}`,
  ].join('\n');

  const content = await chat('ingestion', [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ], { temperature: 0.4, json: true }).catch(() => null);

  if (!content) return buildFallbackIngestion(rawText);
  const parsed = parseJson(content);
  if (!parsed) return buildFallbackIngestion(rawText);

  await recordAiDecision('AUTO_GENERATE', parsed, {
    entityId: null,
    rationale: 'Ingested brain-dump into vision, objectives, roadmap and suggested tasks.',
    snapshot: { rawText },
  });
  return parsed;
}

export function buildFallbackIngestion(rawText) {
  const firstLine = rawText.split('\n')[0]?.trim() || 'Campaign requirements';
  return {
    visionStatement: `Plan and execute a marketing campaign based on: ${firstLine.slice(0, 200)}`,
    objectives: [
      'Deliver the campaign scope described in the brain-dump',
      'Keep every deliverable on-brand and client-ready through automated evaluation',
      'Hit strict campaign deadlines',
    ],
    roadmap: [
      {
        title: 'Strategy & Creative Prep',
        horizon: 'D15',
        description: 'Campaign brief, creative direction and foundational setup',
        tasks: [
          {
            title: 'Write the campaign creative brief',
            description: 'Document the campaign goal, audience, key messages and deliverables so every team member is aligned.',
            acceptanceCriteria: ['Brief approved by account lead', 'Audience + messaging locked'],
            skillTags: ['Content Strategy'],
            effortHours: 4,
            priority: 1,
          },
          {
            title: 'Produce the core creative assets',
            description: 'Create the visual identity and primary assets (hero visuals, ad creatives, social templates).',
            acceptanceCriteria: ['Hero visuals delivered', 'Ad creative set produced', 'On-brand styling'],
            skillTags: ['Graphic Design', 'Branding'],
            effortHours: 8,
            priority: 1,
          },
        ],
      },
      {
        title: 'Launch & Activation',
        horizon: 'D30',
        description: 'Paid media, content calendar and email flow',
        tasks: [
          {
            title: 'Set up and launch paid campaigns',
            description: 'Configure the Google/Meta campaigns with conversion tracking and launch to the target audience.',
            acceptanceCriteria: ['Campaigns live', 'Tracking verified', 'Budget pacing set'],
            skillTags: ['Google Ads', 'Meta Ads'],
            effortHours: 10,
            priority: 1,
          },
          {
            title: 'Publish the content calendar',
            description: 'Schedule the month of social posts, stories and reels aligned to the campaign theme.',
            acceptanceCriteria: ['20+ posts scheduled', 'Captions on-brand'],
            skillTags: ['Social Media', 'Content Strategy'],
            effortHours: 6,
            priority: 2,
          },
          {
            title: 'Build the campaign email flow',
            description: 'Sequence of 4–5 emails moving leads from announcement to conversion.',
            acceptanceCriteria: ['Flow live in ESP', 'Segments set', 'A/B subject lines ready'],
            skillTags: ['Email Marketing', 'Copywriting'],
            effortHours: 6,
            priority: 2,
          },
        ],
      },
      {
        title: 'Optimize & Report',
        horizon: 'D60_90',
        description: 'Scale winners, retention and client reporting',
        tasks: [
          {
            title: 'Optimize campaign performance',
            description: 'Review CPA/ROAS, pause underperformers and scale the winning tactics.',
            acceptanceCriteria: ['Optimization plan executed', 'ROAS tracked'],
            skillTags: ['PPC', 'Analytics'],
            effortHours: 8,
            priority: 2,
          },
          {
            title: 'Deliver the campaign report',
            description: 'Client-facing report covering KPIs, wins, learnings and next steps.',
            acceptanceCriteria: ['Report delivered', 'KPIs vs targets shown'],
            skillTags: ['Analytics'],
            effortHours: 5,
            priority: 3,
          },
        ],
      },
    ],
    suggestedTasks: [
      {
        title: 'Competitor audit for the campaign',
        description: 'Scan competitor offers, messaging and ad activity so the campaign can differentiate from day one.',
        acceptanceCriteria: ['Competitor teardown doc delivered'],
        skillTags: ['Market Research'],
        effortHours: 4,
        priority: 2,
      },
      {
        title: 'Conversion tracking QA before launch',
        description: 'Verify pixels, tags and GA4 events fire correctly before any paid budget goes live.',
        acceptanceCriteria: ['Tracking checklist signed off'],
        skillTags: ['Analytics'],
        effortHours: 3,
        priority: 1,
      },
    ],
    duplicateFlags: [],
  };
}
