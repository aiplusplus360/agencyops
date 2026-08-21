import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const MARKETING_SKILLS = [
  'Content Strategy',
  'Copywriting',
  'SEO',
  'Google Ads',
  'Meta Ads',
  'PPC',
  'Social Media',
  'Email Marketing',
  'Graphic Design',
  'Branding',
  'Figma',
  'WordPress',
  'Webflow',
  'Landing Pages',
  'Analytics',
  'Video Editing',
  'Market Research',
  'Community Management',
];

async function main() {
  console.log('Seeding marketing agency database...');

  const adminPw = await bcrypt.hash('admin123', 10);
  const workerPw = await bcrypt.hash('worker123', 10);
  const adminUsername = process.env.ADMIN_USERNAME || null;
  const adminPasswordHash = process.env.ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
    : adminPw;
  const adminPinHash = process.env.ADMIN_PIN ? await bcrypt.hash(process.env.ADMIN_PIN, 10) : null;

  // Admin — agency owner (login via the secret admin portal + 6-digit PIN)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@coo.app' },
    update: { name: 'Agency Owner', username: adminUsername, passwordHash: adminPasswordHash, pinHash: adminPinHash },
    create: {
      name: 'Agency Owner',
      email: 'admin@coo.app',
      username: adminUsername,
      passwordHash: adminPasswordHash,
      pinHash: adminPinHash,
      role: 'ADMIN',
    },
  });

  // Skills registry
  const skills = {};
  for (const name of MARKETING_SKILLS) {
    skills[name] = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Workers — agency specialists
  const workers = [
    {
      name: 'Alice Chen',
      email: 'alice@coo.app',
      tier: 'SENIOR',
      cap: 4,
      skillz: ['Content Strategy', 'Copywriting', 'SEO', 'Branding'],
    },
    {
      name: 'Bob Malik',
      email: 'bob@coo.app',
      tier: 'SENIOR',
      cap: 4,
      skillz: ['Google Ads', 'Meta Ads', 'PPC', 'Analytics'],
    },
    {
      name: 'Carol Smith',
      email: 'carol@coo.app',
      tier: 'MID',
      cap: 3,
      skillz: ['Social Media', 'Community Management', 'Copywriting', 'Graphic Design'],
    },
    {
      name: 'Dave Kim',
      email: 'dave@coo.app',
      tier: 'JUNIOR',
      cap: 2,
      skillz: ['WordPress', 'Webflow', 'Landing Pages', 'Analytics'],
    },
    {
      name: 'Elena Rodriguez',
      email: 'elena@coo.app',
      tier: 'MID',
      cap: 3,
      skillz: ['Graphic Design', 'Branding', 'Figma', 'Video Editing'],
    },
  ];

  for (const w of workers) {
    const user = await prisma.user.upsert({
      where: { email: w.email },
      update: {},
      create: { name: w.name, email: w.email, passwordHash: workerPw, role: 'WORKER' },
    });
    const existingWorker = await prisma.worker.findUnique({ where: { userId: user.id } });
    if (!existingWorker) {
      await prisma.worker.create({
        data: {
          userId: user.id,
          seniorityTier: w.tier,
          baseCapacity: w.cap,
          effectiveCapacity: w.cap,
          skills: {
            create: w.skillz.map((s) => ({ skillId: skills[s].id, proficiency: 4 })),
          },
        },
      });
    }
  }

  // Client accounts — the agency's "products" (permanent memory for the AI)
  const clients = [
    {
      name: 'Aurora Skincare',
      description: 'Premium DTC skincare brand launching a new Vitamin-C serum line.',
      targetUsers: 'Health-conscious women 25–45, primarily on Instagram & TikTok',
      techStack: 'Shopify, Klaviyo, Google Ads, Meta Ads',
      goals: 'Grow DTC revenue, build social community, hit 500 pre-orders for the serum launch.',
    },
    {
      name: 'GreenLeaf Organics',
      description: 'Organic meal-kit delivery service expanding into two new cities.',
      targetUsers: 'Busy families & fitness-focused urbanites 28–50',
      techStack: 'Meta Ads, Klaviyo, WordPress, GA4',
      goals: 'Boost brand awareness, grow subscription base 30%, run seasonal summer campaign.',
    },
    {
      name: 'Vertex Fitness',
      description: 'Boutique gym chain with 3 studios looking to fill classes and memberships.',
      targetUsers: 'Urban professionals 22–45 near studio locations',
      techStack: 'Google Local Ads, Instagram, Email, Mindbody',
      goals: 'Drive membership leads, dominate local SEO, reduce churn with retention campaigns.',
    },
  ];
  const productIds = {};
  for (const c of clients) {
    const existing = await prisma.product.findFirst({ where: { name: c.name } });
    const product =
      existing ||
      (await prisma.product.create({
        data: {
          name: c.name,
          description: c.description,
          targetUsers: c.targetUsers,
          techStack: c.techStack,
          goals: c.goals,
        },
      }));
    productIds[c.name] = product.id;
  }

  // Recurring task templates — agency cadence
  const templates = [
    {
      name: 'Weekly Client Status Report',
      title: 'Weekly client status report',
      description: 'Summarize campaign performance, deliverables shipped, and next-week priorities for the client.',
      acceptanceCriteria: ['Report sent to client', 'KPIs vs targets included', 'Next steps agreed'],
      skillTags: ['Analytics'],
      effortHours: 2,
      cadence: 'WEEKLY',
    },
    {
      name: 'Monthly SEO Performance Audit',
      title: 'Monthly SEO performance audit',
      description: 'Audit rankings, technical health, and content gaps; propose next month priorities.',
      acceptanceCriteria: ['Keyword movement report', 'Technical issues fixed or logged', 'Content gap list produced'],
      skillTags: ['SEO'],
      effortHours: 4,
      cadence: 'MONTHLY',
    },
    {
      name: 'Monthly Paid Media Recap',
      title: 'Monthly paid media recap',
      description: 'Compile spend, CPA, ROAS and creative performance across Google & Meta; recommend budget shifts.',
      acceptanceCriteria: ['Spend vs ROAS table', 'Winning/losing creatives identified', 'Next-month budget split recommended'],
      skillTags: ['Google Ads', 'Meta Ads', 'Analytics'],
      effortHours: 3,
      cadence: 'MONTHLY',
    },
    {
      name: 'Social Content Calendar — Next Month',
      title: 'Social content calendar for next month',
      description: 'Plan posts, stories and reels aligned to the monthly campaign theme; schedule in the platform.',
      acceptanceCriteria: ['20+ posts scheduled', 'On-brand visual direction', 'Campaign hashtags & hooks included'],
      skillTags: ['Social Media', 'Content Strategy'],
      effortHours: 5,
      cadence: 'MONTHLY',
    },
  ];
  for (const t of templates) {
    const existing = await prisma.taskTemplate.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.taskTemplate.create({
        data: {
          name: t.name,
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          skillTags: t.skillTags,
          effortHours: t.effortHours,
          cadence: t.cadence,
          active: true,
        },
      });
    }
  }

  // Demo vision — a live campaign brain-dump so the system starts agency-ready
  const auroraId = productIds['Aurora Skincare'];
  const existingVision = await prisma.vision.findFirst({
    where: { rawText: { contains: 'Aurora Skincare serum launch' } },
  });
  if (!existingVision && auroraId) {
    const vision = await prisma.vision.create({
      data: {
        adminId: admin.id,
        rawText:
          'Aurora Skincare serum launch: build the landing page, set up the pre-order email flow, launch the Instagram/TikTok teaser campaign, brief the creative team on the new serum identity, and make sure Google Ads capture search demand before launch day.',
        status: 'LIVE',
        products: { create: [{ productId: auroraId }] },
      },
    });

    const horizons = [
      {
        horizon: 'D15',
        title: 'Pre-Launch Sprint',
        description: 'Creative identity, landing page and teaser setup',
        tasks: [
          {
            title: 'Brand the new serum line (name, palette, key visuals)',
            description: 'Deliver the creative identity for the Vitamin-C serum line so every asset is on-brand.',
            acceptanceCriteria: ['Moodboard approved', 'Color palette & typography set', '3 key visual concepts delivered'],
            skillTags: ['Branding', 'Graphic Design'],
            effortHours: 8,
            priority: 1,
          },
          {
            title: 'Build the pre-order landing page',
            description: 'Stand up a high-converting landing page with waitlist capture and pre-order CTA.',
            acceptanceCriteria: ['Mobile-optimized page live', 'Waitlist form wired to Klaviyo', 'Analytics tracking installed'],
            skillTags: ['Webflow', 'Landing Pages', 'Analytics'],
            effortHours: 10,
            priority: 1,
          },
          {
            title: 'Script and produce teaser reels for social',
            description: 'Three 15-second teaser reels teasing the serum launch for Instagram & TikTok.',
            acceptanceCriteria: ['3 reels delivered', 'On-brand hooks', 'Captions with launch CTA'],
            skillTags: ['Video Editing', 'Copywriting'],
            effortHours: 6,
            priority: 2,
          },
        ],
      },
      {
        horizon: 'D30',
        title: 'Launch Campaign',
        description: 'Paid media, email flow and community activation',
        tasks: [
          {
            title: 'Launch Google & Meta pre-order campaigns',
            description: 'Set up and launch paid campaigns targeting search demand and lookalike audiences.',
            acceptanceCriteria: ['Campaigns live in Google Ads & Meta Ads', 'Conversion tracking verified', 'Daily budget pacing set'],
            skillTags: ['Google Ads', 'Meta Ads', 'Analytics'],
            effortHours: 12,
            priority: 1,
          },
          {
            title: 'Build the pre-order email sequence',
            description: 'Five-email flow: announce, educate on benefits, social proof, urgency, last call.',
            acceptanceCriteria: ['Flow live in Klaviyo', 'Subject lines A/B ready', 'Segments by lead source'],
            skillTags: ['Email Marketing', 'Copywriting'],
            effortHours: 8,
            priority: 1,
          },
          {
            title: 'Run the community launch event',
            description: 'Host an Instagram live + TikTok takeover with an influencer to drive pre-orders.',
            acceptanceCriteria: ['Influencer brief sent', 'Event scheduled & promoted', 'Pre-order tracker updated'],
            skillTags: ['Community Management', 'Social Media'],
            effortHours: 6,
            priority: 2,
          },
        ],
      },
      {
        horizon: 'D60_90',
        title: 'Growth & Retention',
        description: 'Scale winners, retention program and reporting',
        tasks: [
          {
            title: 'Scale winning ad sets and cut losers',
            description: 'Analyze CPA/ROAS per creative and scale the winners to the full budget.',
            acceptanceCriteria: ['Scale plan approved', 'Losing creatives paused', 'ROAS target documented'],
            skillTags: ['PPC', 'Analytics'],
            effortHours: 6,
            priority: 2,
          },
          {
            title: 'Build the post-purchase retention flow',
            description: 'Email + SMS flow for replenishment and referral incentives after first purchase.',
            acceptanceCriteria: ['Flow live', 'Referral incentive configured', 'Replenishment schedule set'],
            skillTags: ['Email Marketing'],
            effortHours: 8,
            priority: 2,
          },
          {
            title: 'Launch performance report for the client',
            description: 'Full launch retrospective: revenue, CPA, ROAS, community growth and next-quarter plan.',
            acceptanceCriteria: ['Report delivered to client', 'All KPIs vs targets shown', 'Next-quarter plan included'],
            skillTags: ['Analytics', 'Content Strategy'],
            effortHours: 5,
            priority: 3,
          },
        ],
      },
    ];

    for (const h of horizons) {
      const rm = await prisma.roadmap.create({
        data: { visionId: vision.id, horizon: h.horizon, title: h.title, description: h.description },
      });
      const created = [];
      for (const t of h.tasks) {
        const deadline = new Date(Date.now() + t.effortHours * 3600 * 1000 * 2.5);
        const task = await prisma.task.create({
          data: {
            roadmapId: rm.id,
            productId: auroraId,
            title: t.title,
            description: t.description,
            acceptanceCriteria: t.acceptanceCriteria,
            skillTags: t.skillTags,
            effortHours: t.effortHours,
            priority: t.priority,
            deadline,
            sourceVision: vision.id,
          },
        });
        created.push(task);
      }
      for (let i = 0; i < created.length; i++) {
        if (i > 0) {
          await prisma.taskDependency
            .create({ data: { dependencyId: created[i - 1].id, dependentId: created[i].id } })
            .catch(() => {});
        }
      }
    }
  }

  console.log('Seed complete.');
  console.log(`Admin:  ${adminUsername || 'admin@coo.app'} / secured via backend/.env + PIN (Admin Portal at /90ui66p)`);
  console.log('Workers: alice@coo.app, bob@coo.app, carol@coo.app, dave@coo.app, elena@coo.app (all / worker123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
