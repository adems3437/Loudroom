import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCategories } from '../src/seed/categories.js';
import { seedQuizPack } from '../src/seed/quiz-pack.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  await seedCategories(prisma);
  await seedQuizPack(prisma);
  console.log('Seed complete');
} finally {
  await prisma.$disconnect();
}
