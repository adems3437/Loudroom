import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedAdminUser } from '../src/seed/admin-user.js';
import { seedCardPacks } from '../src/seed/card-packs.js';
import { seedCategories } from '../src/seed/categories.js';
import { seedDrawingPack } from '../src/seed/drawing-pack.js';
import { seedMapPack } from '../src/seed/map-pack.js';
import { seedPartyPack } from '../src/seed/party-pack.js';
import { seedReflexPack } from '../src/seed/reflex-pack.js';
import { seedQuizPack } from '../src/seed/quiz-pack.js';
import { seedTombalaSpyPacks } from '../src/seed/tombala-spy-packs.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  await seedCategories(prisma);
  await seedQuizPack(prisma);
  await seedPartyPack(prisma);
  await seedMapPack(prisma);
  await seedDrawingPack(prisma);
  await seedReflexPack(prisma);
  await seedTombalaSpyPacks(prisma);
  await seedCardPacks(prisma);
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (email && password) {
    const result = await seedAdminUser(prisma, { email, password });
    console.log(`Admin ${email}: ${result === 'created' ? 'created' : 'already exists'}`);
  }
  console.log('Seed complete');
} finally {
  await prisma.$disconnect();
}
