// One-time maintenance script: reset the database to a truly empty state.
// Keeps ONLY:
//   - the admin user (admin@coo.app / admin123)
//   - the skills registry (the AI-COO's fixed skill vocabulary)
// Deletes everything else: workers, products, visions, roadmaps, tasks,
// assignments, submissions, evaluations, sessions, logs, digests, settings, etc.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Children before parents so foreign keys never block.
  const tables = [
    'emailLog',        'apiUsageLog',      'learningAdjustment', 'aiDecision',
    'digest',          'revision',         'taskDependency',     'taskActivity',
    'taskNote',        'briefFeedback',    'appeal',             'evaluation',
    'submission',      'assignment',       'availabilityLog',    'workerSkill',
    'recurringInstance','taskTemplate',    'productDocument',    'visionProduct',
    'task',            'roadmap',          'vision',             'worker',
    'product',         'session',          'notification',       'activityLog',
    'setting',         'conversationMessage', 'conversation',     'memory',
  ];

  for (const table of tables) {
    await prisma[table].deleteMany();
    console.log(`  cleared ${table}`);
  }

  // Remove every user except the agency owner.
  const deleted = await prisma.user.deleteMany({
    where: { email: { not: 'admin@coo.app' } },
  });
  console.log(`  removed ${deleted.count} non-admin user(s)`);

  const admin = await prisma.user.findUnique({ where: { email: 'admin@coo.app' } });
  if (!admin) {
    throw new Error('Admin account missing — run prisma/seed.js first.');
  }

  console.log('\nReset complete. Remaining:');
  console.log(`  users   : ${await prisma.user.count()} (admin only)`);
  console.log(`  workers : ${await prisma.worker.count()}`);
  console.log(`  skills  : ${await prisma.skill.count()} (registry kept)`);
  console.log(`  products: ${await prisma.product.count()}`);
  console.log(`  visions : ${await prisma.vision.count()}`);
  console.log(`  tasks   : ${await prisma.task.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
