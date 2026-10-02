import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { verifyPassword } from '../src/admin/password.js';
import { seedAdminUser } from '../src/seed/admin-user.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findGameModule } from '../src/game/registry.js';
import { SEED_CATEGORIES, seedCategories } from '../src/seed/categories.js';
import {
  PARTY_PACK_ID,
  SAMPLE_CLOSEST_NUMBER,
  SAMPLE_SORTING,
  SAMPLE_WHO_WOULD,
  seedPartyPack,
} from '../src/seed/party-pack.js';
import { seedQuizPack } from '../src/seed/quiz-pack.js';
import { DRAWING_PACK_ID, SAMPLE_WORDS, seedDrawingPack } from '../src/seed/drawing-pack.js';
import {
  MAP_PACK_ID,
  SAMPLE_BLUFF,
  SAMPLE_IMAGE_LOCATION,
  seedMapPack,
  TURKIYE_MEDIA_ID,
  WORLD_MEDIA_ID,
} from '../src/seed/map-pack.js';

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

  it('seeds the new games and the mixed pack idempotently, with valid content', async () => {
    await seedCategories(prisma);
    await seedQuizPack(prisma);
    await seedPartyPack(prisma);
    await seedPartyPack(prisma);

    const samples = {
      closestNumber: SAMPLE_CLOSEST_NUMBER,
      sorting: SAMPLE_SORTING,
      whoWould: SAMPLE_WHO_WOULD,
    };
    expect([SAMPLE_CLOSEST_NUMBER.length, SAMPLE_SORTING.length, SAMPLE_WHO_WOULD.length]).toEqual([
      8, 6, 10,
    ]);
    for (const [gameType, items] of Object.entries(samples)) {
      const rows = await prisma.contentItem.findMany({
        where: { id: { in: items.map((item) => item.id) } },
      });
      expect(rows).toHaveLength(items.length);
      for (const row of rows) {
        expect(row).toMatchObject({ gameType, status: 'PUBLISHED' });
        expect(findGameModule(gameType)?.contentSchema.safeParse(row.data).success).toBe(true);
      }
    }

    const pack = await prisma.gamePack.findUniqueOrThrow({
      where: { id: PARTY_PACK_ID },
      include: { rounds: { orderBy: { order: 'asc' } } },
    });
    expect(pack).toMatchObject({ name: 'Parti Karışık', status: 'PUBLISHED' });
    expect(pack.rounds.map((round) => [round.gameType, round.questionCount])).toEqual([
      ['quiz', 2],
      ['closestNumber', 2],
      ['sorting', 2],
      ['whoWould', 2],
    ]);
  });

  it('renders the maps and seeds the map and bluff pack idempotently', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'loudroom-maps-'));
    try {
      await seedCategories(prisma);
      await seedMapPack(prisma, { mediaDir });
      await seedMapPack(prisma, { mediaDir });

      const maps = await prisma.media.findMany({
        where: { id: { in: [TURKIYE_MEDIA_ID, WORLD_MEDIA_ID] } },
        orderBy: { width: 'asc' },
      });
      expect(maps).toHaveLength(2);
      for (const map of maps) {
        expect(map).toMatchObject({ type: 'IMAGE', mimeType: 'image/webp', width: 2000 });
        expect(map.height).toBeGreaterThan(700);
        expect(existsSync(join(mediaDir, map.storagePath))).toBe(true);
      }

      for (const [gameType, items] of [
        ['imageLocation', SAMPLE_IMAGE_LOCATION],
        ['bluff', SAMPLE_BLUFF],
      ] as const) {
        expect(items).toHaveLength(10);
        const rows = await prisma.contentItem.findMany({
          where: { id: { in: items.map((item) => item.id) } },
          include: { media: { select: { id: true } } },
        });
        expect(rows).toHaveLength(10);
        for (const row of rows) {
          expect(row).toMatchObject({ gameType, status: 'PUBLISHED' });
          expect(findGameModule(gameType)?.contentSchema.safeParse(row.data).success).toBe(true);
          if (gameType === 'imageLocation') expect(row.media).toHaveLength(1);
        }
      }

      const pack = await prisma.gamePack.findUniqueOrThrow({
        where: { id: MAP_PACK_ID },
        include: { rounds: { orderBy: { order: 'asc' } } },
      });
      expect(pack).toMatchObject({ name: 'Harita ve Blöf', status: 'PUBLISHED' });
      expect(pack.rounds.map((round) => [round.gameType, round.questionCount])).toEqual([
        ['imageLocation', 3],
        ['bluff', 3],
      ]);
    } finally {
      rmSync(mediaDir, { recursive: true, force: true });
    }
  });

  it('seeds the drawing words and the "Çiz Bil" pack idempotently', async () => {
    await seedDrawingPack(prisma);
    await seedDrawingPack(prisma);
    expect(SAMPLE_WORDS.length).toBeGreaterThanOrEqual(40);
    const rows = await prisma.contentItem.findMany({
      where: { id: { in: SAMPLE_WORDS.map((item) => item.id) } },
    });
    expect(rows).toHaveLength(SAMPLE_WORDS.length);
    for (const row of rows) {
      expect(row).toMatchObject({ gameType: 'drawing', status: 'PUBLISHED' });
      expect(findGameModule('drawing')?.contentSchema.safeParse(row.data).success).toBe(true);
    }
    const pack = await prisma.gamePack.findUniqueOrThrow({
      where: { id: DRAWING_PACK_ID },
      include: { rounds: true },
    });
    expect(pack).toMatchObject({ name: 'Çiz Bil', status: 'PUBLISHED' });
    expect(pack.rounds.map((round) => [round.gameType, round.questionCount])).toEqual([
      ['drawing', 6],
    ]);
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
