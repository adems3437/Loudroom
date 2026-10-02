import {
  MEMORY_GAME_TYPE,
  memoryContentSchema,
  type MemoryContent,
} from '@loudroom/game-memory/server';
import {
  REACTION_GAME_TYPE,
  reactionContentSchema,
  type ReactionContent,
} from '@loudroom/game-reaction/server';
import type { ContentSelection } from '@loudroom/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const REFLEX_PACK_ID = '19cb8d29-eb29-4668-a947-2c8b4dda66c1';

export const SAMPLE_REACTION: { id: string; content: ReactionContent }[] = [
  { id: 'e9b2edaf-1ad4-4b86-82dd-487f16dd1b9c', content: { title: 'Klasik', variant: 'classic' } },
  {
    id: '9603ebda-5d4e-4b2c-86c0-54bca4e5de16',
    content: { title: 'Renk tuzağı', variant: 'goNoGo' },
  },
];

const set = (id: string, title: string, items: [string, string][]) => ({
  id,
  content: {
    title,
    items: items.map(([label, emoji], index) => ({ id: `i${index + 1}`, label, emoji })),
  } satisfies MemoryContent,
});

/** Emoji sets: the device's own font draws them, so no image files are needed. */
export const SAMPLE_MEMORY: { id: string; content: MemoryContent }[] = [
  set('3ec2ff80-43b0-471b-aaba-0580ab952272', 'Meyveler', [
    ['Elma', '🍎'],
    ['Armut', '🍐'],
    ['Muz', '🍌'],
    ['Kiraz', '🍒'],
    ['Üzüm', '🍇'],
    ['Karpuz', '🍉'],
    ['Çilek', '🍓'],
    ['Limon', '🍋'],
    ['Şeftali', '🍑'],
    ['Ananas', '🍍'],
    ['Portakal', '🍊'],
    ['Kivi', '🥝'],
  ]),
  set('6d1feb1e-bcd3-461e-aafd-d4cbd32a66b4', 'Hayvanlar', [
    ['Kedi', '🐱'],
    ['Köpek', '🐶'],
    ['Tavşan', '🐰'],
    ['Ayı', '🐻'],
    ['Panda', '🐼'],
    ['Aslan', '🦁'],
    ['Kaplan', '🐯'],
    ['İnek', '🐮'],
    ['Domuz', '🐷'],
    ['Kurbağa', '🐸'],
    ['Maymun', '🐵'],
    ['Tavuk', '🐔'],
    ['Penguen', '🐧'],
    ['Baykuş', '🦉'],
  ]),
  set('171beec7-b93d-4ae0-8985-27686abadc10', 'Eşyalar', [
    ['Saat', '⏰'],
    ['Şemsiye', '☂️'],
    ['Anahtar', '🔑'],
    ['Makas', '✂️'],
    ['Kalem', '✏️'],
    ['Kitap', '📕'],
    ['Lamba', '💡'],
    ['Telefon', '📱'],
    ['Gözlük', '👓'],
    ['Çanta', '🎒'],
    ['Şapka', '🎩'],
    ['Top', '⚽'],
    ['Hediye', '🎁'],
  ]),
  set('25262a40-9b8d-485c-92ce-1f96abdb6555', 'Taşıtlar', [
    ['Araba', '🚗'],
    ['Otobüs', '🚌'],
    ['Taksi', '🚕'],
    ['Kamyon', '🚚'],
    ['Bisiklet', '🚲'],
    ['Motosiklet', '🏍️'],
    ['Tren', '🚆'],
    ['Uçak', '✈️'],
    ['Helikopter', '🚁'],
    ['Gemi', '🚢'],
    ['Roket', '🚀'],
    ['Traktör', '🚜'],
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

/** Reaction challenges, Memory sets and the published "Refleks ve Hafıza" pack. */
export async function seedReflexPack(prisma: PrismaClient): Promise<void> {
  for (const item of SAMPLE_REACTION) {
    await upsert(prisma, REACTION_GAME_TYPE, item.id, reactionContentSchema.parse(item.content));
  }
  for (const item of SAMPLE_MEMORY) {
    await upsert(prisma, MEMORY_GAME_TYPE, item.id, memoryContentSchema.parse(item.content));
  }

  const pack = {
    name: 'Refleks ve Hafıza',
    description: 'Telefonunda hedef çıkınca bas, sonra ekrandakileri ezberle.',
    status: 'PUBLISHED' as const,
    settings: {},
  };
  await prisma.gamePack.upsert({
    where: { id: REFLEX_PACK_ID },
    create: { id: REFLEX_PACK_ID, ...pack },
    update: pack,
  });
  const selection: ContentSelection = { mode: 'random' };
  for (const [index, [gameType, count]] of (
    [
      [REACTION_GAME_TYPE, 2],
      [MEMORY_GAME_TYPE, 3],
    ] as const
  ).entries()) {
    const order = index + 1;
    const round = {
      gameType,
      contentSelection: selection,
      questionCount: count,
      timeLimitMs: null,
      scoreMultiplier: 1,
      showScoreboardAfter: false,
      settings: {},
    };
    await prisma.gamePackRound.upsert({
      where: { gamePackId_order: { gamePackId: REFLEX_PACK_ID, order } },
      create: { gamePackId: REFLEX_PACK_ID, order, ...round },
      update: round,
    });
  }
}
