import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { verifyPassword } from '../src/admin/password.js';
import { seedAdminUser } from '../src/seed/admin-user.js';
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

  it('creates the development admin once and never overwrites its password', async () => {
    const email = 'Seed-Admin@Test.Local';
    await prisma.user.deleteMany({ where: { email: email.toLowerCase() } });
    expect(await seedAdminUser(prisma, { email, password: 'first password' })).toBe('created');
    expect(await seedAdminUser(prisma, { email, password: 'second password' })).toBe('exists');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
    expect(user.role).toBe('ADMIN');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(user.passwordHash, 'first password')).toBe(true);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
