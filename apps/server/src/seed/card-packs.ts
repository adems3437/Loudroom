import {
  PISTI_GAME_TYPE,
  pistiContentSchema,
  type PistiContent,
} from '@loudroom/game-pisti/server';
import { UNO_GAME_TYPE, unoContentSchema, type UnoContent } from '@loudroom/game-uno/server';
import type { ContentSelection } from '@loudroom/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const UNO_PACK_ID = '033da6c4-2988-4ea2-949f-06fffb9a04c3';
export const PISTI_PACK_ID = '7bccbaaa-92bd-4474-8448-0c19c6bec2f1';

export const SAMPLE_UNO: { id: string; content: UnoContent } = {
  id: '82a2e26f-29b5-42f6-8917-2dedc712546e',
  content: { title: 'Klasik Renk Kartları' },
};
export const SAMPLE_PISTI: { id: string; content: PistiContent } = {
  id: '0ff21f83-19d1-471d-b27b-f862646de072',
  content: { title: 'Pişti' },
};

async function upsertContent(prisma: PrismaClient, gameType: string, id: string, data: object) {
  const fields = {
    gameType,
    data,
    categoryId: null,
    difficulty: 'MEDIUM' as const,
    locale: 'tr',
    status: 'PUBLISHED' as const,
    baseScore: 1000,
  };
  await prisma.contentItem.upsert({ where: { id }, create: { id, ...fields }, update: fields });
}

/** A published one-round pack playing the given content once, with the game's defaults. */
async function upsertPack(
  prisma: PrismaClient,
  id: string,
  pack: { name: string; description: string },
  gameType: string,
  contentId: string,
) {
  const fields = { ...pack, status: 'PUBLISHED' as const, settings: {} };
  await prisma.gamePack.upsert({ where: { id }, create: { id, ...fields }, update: fields });
  const selection: ContentSelection = { mode: 'fixed', contentIds: [contentId] };
  const round = {
    gameType,
    contentSelection: selection,
    questionCount: 1,
    timeLimitMs: null,
    scoreMultiplier: 1,
    showScoreboardAfter: false,
    settings: {},
  };
  await prisma.gamePackRound.upsert({
    where: { gamePackId_order: { gamePackId: id, order: 1 } },
    create: { gamePackId: id, order: 1, ...round },
    update: round,
  });
}

/** "Klasik Renk Kartları" and "Pişti" with their published packs. */
export async function seedCardPacks(prisma: PrismaClient): Promise<void> {
  await upsertContent(
    prisma,
    UNO_GAME_TYPE,
    SAMPLE_UNO.id,
    unoContentSchema.parse(SAMPLE_UNO.content),
  );
  await upsertContent(
    prisma,
    PISTI_GAME_TYPE,
    SAMPLE_PISTI.id,
    pistiContentSchema.parse(SAMPLE_PISTI.content),
  );
  await upsertPack(
    prisma,
    UNO_PACK_ID,
    {
      name: 'Renk Kartları',
      description: 'Elin telefonunda, yer ekranda. Son kartta "Son kart!" demeyi unutma!',
    },
    UNO_GAME_TYPE,
    SAMPLE_UNO.id,
  );
  await upsertPack(
    prisma,
    PISTI_PACK_ID,
    { name: 'Pişti', description: 'Klasik Pişti: 101 puana kadar; dört kişide eşli.' },
    PISTI_GAME_TYPE,
    SAMPLE_PISTI.id,
  );
}
