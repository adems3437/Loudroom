import {
  AMIRAL_GAME_TYPE,
  amiralContentSchema,
  type AmiralContent,
} from '@loudroom/game-amiral-batti/server';
import {
  KIZMA_GAME_TYPE,
  kizmaContentSchema,
  type KizmaContent,
} from '@loudroom/game-kizma-birader/server';
import type { ContentSelection } from '@loudroom/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const KIZMA_PACK_ID = '209ca1ae-3ee5-4cb2-8845-f16438409652';
export const AMIRAL_TEAMS_PACK_ID = 'cbee90cb-644e-496d-bf1c-6ddb4d2649bd';
export const AMIRAL_TOURNAMENT_PACK_ID = '329dd27f-d48c-4f3a-a287-2f0bca347e27';

export const SAMPLE_KIZMA: { id: string; content: KizmaContent } = {
  id: 'd33eb2a4-7e33-429e-ace1-f7f32d74b80b',
  content: { title: 'Kızma Birader' },
};
export const SAMPLE_AMIRAL: { id: string; content: AmiralContent } = {
  id: 'c0f6a339-3e9c-45c2-92f4-f418138edf80',
  content: { title: 'Amiral Battı' },
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

/** A published one-round pack playing the given content once with the given settings. */
async function upsertPack(
  prisma: PrismaClient,
  id: string,
  pack: { name: string; description: string },
  gameType: string,
  contentId: string,
  settings: Record<string, unknown>,
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
    settings: settings as object,
  };
  await prisma.gamePackRound.upsert({
    where: { gamePackId_order: { gamePackId: id, order: 1 } },
    create: { gamePackId: id, order: 1, ...round },
    update: round,
  });
}

/** Kızma Birader and Amiral Battı (teams, tournament) with their published packs. */
export async function seedBoardPacks(prisma: PrismaClient): Promise<void> {
  await upsertContent(
    prisma,
    KIZMA_GAME_TYPE,
    SAMPLE_KIZMA.id,
    kizmaContentSchema.parse(SAMPLE_KIZMA.content),
  );
  await upsertContent(
    prisma,
    AMIRAL_GAME_TYPE,
    SAMPLE_AMIRAL.id,
    amiralContentSchema.parse(SAMPLE_AMIRAL.content),
  );
  await upsertPack(
    prisma,
    KIZMA_PACK_ID,
    { name: 'Kızma Birader', description: 'Zarını telefonundan at, piyonunu seç. Yenince kızma!' },
    KIZMA_GAME_TYPE,
    SAMPLE_KIZMA.id,
    {},
  );
  await upsertPack(
    prisma,
    AMIRAL_TEAMS_PACK_ID,
    {
      name: 'Amiral Battı: Takımlar',
      description: 'İki takım, iki filo. Kaptan dizer, herkes sırayla atar.',
    },
    AMIRAL_GAME_TYPE,
    SAMPLE_AMIRAL.id,
    { mode: 'teams' },
  );
  await upsertPack(
    prisma,
    AMIRAL_TOURNAMENT_PACK_ID,
    {
      name: 'Amiral Battı Turnuvası',
      description: 'Bire bir düellolar aynı anda; kazanan bir üst tura, sonunda tek şampiyon.',
    },
    AMIRAL_GAME_TYPE,
    SAMPLE_AMIRAL.id,
    { mode: 'tournament', fleet: 'small' },
  );
}
