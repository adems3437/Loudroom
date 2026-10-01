import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { SEED_CATEGORIES, seedCategories } from '../src/seed/categories.js';

describe('seedCategories', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: inject('databaseUrl') }),
    });
    await prisma.category.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates the categories and is idempotent', async () => {
    await seedCategories(prisma);
    await seedCategories(prisma);

    const categories = await prisma.category.findMany({
      select: { slug: true, name: true },
      orderBy: { slug: 'asc' },
    });
    expect(categories).toEqual(
      [...SEED_CATEGORIES].sort((a, b) => a.slug.localeCompare(b.slug)).map((c) => ({ ...c })),
    );
  });
});
