/**
 * Production seed: only the categories (SPEC §15 Phase 9, G4). Sample content and the
 * development admin come from `pnpm db:seed` in development only. Idempotent; the `migrate`
 * service of compose.prod.yml runs it after the migrations.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedCategories } from '../seed/categories.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  await seedCategories(prisma);
  console.log('Categories seeded');
} finally {
  await prisma.$disconnect();
}
