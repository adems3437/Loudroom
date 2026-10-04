import { SPY_GAME_TYPE, spyContentSchema, type SpyContent } from '@loudroom/game-spy/server';
import {
  TOMBALA_GAME_TYPE,
  tombalaContentSchema,
  type TombalaContent,
} from '@loudroom/game-tombala/server';
import type { ContentSelection } from '@loudroom/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const TOMBALA_PACK_ID = '0062b11a-97d7-477b-a292-b92da1d0b854';
export const SPY_PACK_ID = '5beb4421-c8f7-49b5-b07e-b73b1bc3e676';

export const SAMPLE_TOMBALA: { id: string; content: TombalaContent }[] = [
  { id: '04a89167-6755-4a54-81fd-d6f1573e5c71', content: { title: 'Klasik Tombala' } },
];

const set = (id: string, title: string, places: [string, string][]) => ({
  id,
  content: {
    title,
    locations: places.map(([name, emoji], index) => ({ id: `l${index + 1}`, name, emoji })),
  } satisfies SpyContent,
});

/** Places with emoji: the device's own font draws them, so no image files are needed. */
export const SAMPLE_SPY: { id: string; content: SpyContent }[] = [
  set('ca078f6d-2193-416a-bc28-c5d5ca95fde1', 'Şehir', [
    ['Hastane', '🏥'],
    ['Okul', '🏫'],
    ['Restoran', '🍽️'],
    ['Sinema', '🎬'],
    ['Market', '🛒'],
    ['Banka', '🏦'],
    ['Kütüphane', '📚'],
    ['Spor salonu', '🏋️'],
    ['Kafe', '☕'],
    ['Otobüs terminali', '🚌'],
    ['Polis karakolu', '🚓'],
    ['Berber', '💈'],
    ['Eczane', '💊'],
    ['Pazar yeri', '🧺'],
  ]),
  set('e5709486-3697-432b-a8ee-417ea8cd24ef', 'Tatil', [
    ['Plaj', '🏖️'],
    ['Otel', '🏨'],
    ['Kamp alanı', '⛺'],
    ['Gemi', '🚢'],
    ['Lunapark', '🎡'],
    ['Müze', '🏛️'],
    ['Kayak merkezi', '⛷️'],
    ['Tren', '🚆'],
    ['Havalimanı', '✈️'],
    ['Su parkı', '🌊'],
    ['Hayvanat bahçesi', '🦁'],
    ['Kapalıçarşı', '🛍️'],
    ['Termal otel', '♨️'],
  ]),
  set('59bca165-e5e0-4358-b9e1-8e4c5839e991', 'İş ve okul', [
    ['Ofis', '🏢'],
    ['Fabrika', '🏭'],
    ['Laboratuvar', '🧪'],
    ['Televizyon stüdyosu', '🎥'],
    ['Mahkeme', '⚖️'],
    ['Üniversite', '🎓'],
    ['Anaokulu', '🧸'],
    ['Şantiye', '🚧'],
    ['Çiftlik', '🚜'],
    ['İtfaiye', '🚒'],
    ['Gazete bürosu', '📰'],
    ['Uzay istasyonu', '🚀'],
  ]),
];

async function upsert(prisma: PrismaClient, gameType: string, id: string, data: object) {
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

async function upsertPack(
  prisma: PrismaClient,
  id: string,
  pack: { name: string; description: string },
  gameType: string,
  questionCount: number,
) {
  const fields = { ...pack, status: 'PUBLISHED' as const, settings: {} };
  await prisma.gamePack.upsert({ where: { id }, create: { id, ...fields }, update: fields });
  const selection: ContentSelection = { mode: 'random' };
  const round = {
    gameType,
    contentSelection: selection,
    questionCount,
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

/** "Klasik Tombala", three place sets and the published "Tombala Gecesi" and "Casus Kim?" packs. */
export async function seedTombalaSpyPacks(prisma: PrismaClient): Promise<void> {
  for (const item of SAMPLE_TOMBALA) {
    await upsert(prisma, TOMBALA_GAME_TYPE, item.id, tombalaContentSchema.parse(item.content));
  }
  for (const item of SAMPLE_SPY) {
    await upsert(prisma, SPY_GAME_TYPE, item.id, spyContentSchema.parse(item.content));
  }
  await upsertPack(
    prisma,
    TOMBALA_PACK_ID,
    {
      name: 'Tombala Gecesi',
      description: 'Kartın telefonunda, sayılar ekranda. Çinko de, tombala yap!',
    },
    TOMBALA_GAME_TYPE,
    1,
  );
  await upsertPack(
    prisma,
    SPY_PACK_ID,
    {
      name: 'Casus Kim?',
      description: 'Herkes mekânı biliyor, biri hariç. Sorularla casusu bul!',
    },
    SPY_GAME_TYPE,
    3,
  );
}
