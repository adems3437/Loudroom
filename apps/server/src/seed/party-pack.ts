import {
  CLOSEST_NUMBER_GAME_TYPE,
  closestNumberContentSchema,
  type ClosestNumberContent,
} from '@loudroom/game-closest-number/server';
import { QUIZ_GAME_TYPE } from '@loudroom/game-quiz/server';
import {
  SORTING_GAME_TYPE,
  sortingContentSchema,
  type SortingContent,
} from '@loudroom/game-sorting/server';
import {
  WHO_WOULD_GAME_TYPE,
  whoWouldContentSchema,
  type WhoWouldContent,
} from '@loudroom/game-who-would/server';
import type { ContentSelection } from '@loudroom/shared';
import type { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const PARTY_PACK_ID = 'd5d1007e-82c0-41d3-87a8-373cc6163319';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface SeedItem<Content> {
  id: string;
  category: string | null;
  difficulty: Difficulty;
  content: Content;
}

const number = (
  id: string,
  category: string,
  difficulty: Difficulty,
  question: string,
  answer: number,
  unit?: string,
): SeedItem<ClosestNumberContent> => ({
  id,
  category,
  difficulty,
  content: { question, answer, displayFormat: 'number', ...(unit ? { unit } : {}) },
});

const year = (
  id: string,
  category: string,
  question: string,
  answer: number,
): SeedItem<ClosestNumberContent> => ({
  id,
  category,
  difficulty: 'MEDIUM',
  content: { question, answer, displayFormat: 'year' },
});

export const SAMPLE_CLOSEST_NUMBER: SeedItem<ClosestNumberContent>[] = [
  number(
    'd4c3217e-8303-4caa-afc4-0767f0bc9a7d',
    'cografya',
    'MEDIUM',
    'Everest Dağı kaç metre yüksekliğindedir?',
    8849,
    'm',
  ),
  number(
    'bbb3416f-7822-4dbe-aff7-21c621cee65b',
    'cografya',
    'HARD',
    'Türkiye’nin yüzölçümü kaç kilometrekaredir?',
    783_562,
    'km²',
  ),
  year('67f783d5-a793-4337-ae7d-84e9eca68150', 'tarih', 'İstanbul hangi yıl fethedildi?', 1453),
  year(
    '7ba5d355-505a-45a3-a92b-c6889d9f240e',
    'bilim-teknoloji',
    'İnsanlı ilk Ay inişi hangi yıl gerçekleşti?',
    1969,
  ),
  number(
    'e8beaf83-52ab-4c0d-aec8-b76eb3c8cf59',
    'genel-kultur',
    'EASY',
    'Artık yıl olmayan bir yılda kaç saat vardır?',
    8760,
    'saat',
  ),
  number(
    '2fe8f433-2f7e-42a9-bbc7-b374885cebb1',
    'bilim-teknoloji',
    'HARD',
    'Işık boşlukta bir saniyede kaç kilometre yol alır?',
    299_792,
    'km',
  ),
  number(
    'e9297725-9ff7-42e1-a628-a793f2d807a9',
    'bilim-teknoloji',
    'MEDIUM',
    'Yetişkin bir insanın iskeletinde kaç kemik vardır?',
    206,
    'kemik',
  ),
  number(
    '52ecd7fe-cc0e-49be-a1ed-23df8756cd4d',
    'cografya',
    'HARD',
    'Türkiye’nin en uzun nehri Kızılırmak kaç kilometredir?',
    1355,
    'km',
  ),
];

const sorting = (
  id: string,
  category: string,
  difficulty: Difficulty,
  question: string,
  items: string[],
  labels: [string, string],
): SeedItem<SortingContent> => ({
  id,
  category,
  difficulty,
  content: {
    question,
    items: items.map((text, index) => ({ id: `s${index + 1}`, text })),
    labels: { first: labels[0], last: labels[1] },
  },
});

/** Items are listed in their correct order. */
export const SAMPLE_SORTING: SeedItem<SortingContent>[] = [
  sorting(
    'f52be775-a47b-4009-99b2-67efbe952b62',
    'tarih',
    'MEDIUM',
    'Bu olayları eskiden yeniye sırala.',
    [
      'İstanbul’un fethi',
      'Amerika’nın keşfi',
      'Fransız İhtilali',
      'Cumhuriyet’in ilanı',
      'İnsanlı ilk Ay inişi',
    ],
    ['En eski', 'En yeni'],
  ),
  sorting(
    'c756f1ed-5714-463b-8fab-8e8ef63cfc6f',
    'bilim-teknoloji',
    'EASY',
    'Gezegenleri Güneş’e en yakından en uzağa sırala.',
    ['Merkür', 'Venüs', 'Dünya', 'Mars', 'Jüpiter', 'Satürn'],
    ['En yakın', 'En uzak'],
  ),
  sorting(
    '44ffbf28-6104-4426-a0fa-f58d0e5f9d7e',
    'cografya',
    'MEDIUM',
    'Bu illeri nüfusu en kalabalıktan en aza sırala.',
    ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya'],
    ['En kalabalık', 'En az'],
  ),
  sorting(
    'd5ee1cce-1d81-4ab8-a8c2-02b92e089bff',
    'cografya',
    'HARD',
    'Bu dağları en yüksekten en alçağa sırala.',
    ['Ağrı Dağı', 'Süphan Dağı', 'Erciyes Dağı', 'Uludağ'],
    ['En yüksek', 'En alçak'],
  ),
  sorting(
    'c2300198-1018-407c-b528-a3cf1895a633',
    'genel-kultur',
    'EASY',
    'Bu hayvanları ortalama ağırlığına göre en hafiften en ağıra sırala.',
    ['Fare', 'Kedi', 'Koyun', 'At', 'Fil'],
    ['En hafif', 'En ağır'],
  ),
  sorting(
    '1311c5c7-2969-4cbe-924a-17929fc1b557',
    'bilim-teknoloji',
    'MEDIUM',
    'Bu icatları eskiden yeniye sırala.',
    ['Matbaa', 'Buhar makinesi', 'Telefon', 'Uçak', 'Televizyon'],
    ['En eski', 'En yeni'],
  ),
];

const who = (id: string, question: string, title: string): SeedItem<WhoWouldContent> => ({
  id,
  category: null,
  difficulty: 'EASY',
  content: { question, title },
});

export const SAMPLE_WHO_WOULD: SeedItem<WhoWouldContent>[] = [
  who(
    'ac2d4d5a-cd88-4a89-87ce-68131cf91d78',
    'Kim buluşmalara en çok geç kalır?',
    'Geç Kalma Şampiyonu',
  ),
  who(
    '59e83ab8-1080-4dd8-bb21-868399bcdded',
    'Kim ıssız bir adada en uzun hayatta kalır?',
    'Hayatta Kalma Uzmanı',
  ),
  who(
    '7efda2b8-7ee9-46bd-8859-d6479e72121f',
    'Kim tatilde en çok fotoğraf çeker?',
    'Fotoğraf Tutkunu',
  ),
  who(
    'f74c5cdf-ad96-41d7-a562-f132717daae9',
    'Kim bir bilgi yarışmasını kazanır?',
    'Yarışma Canavarı',
  ),
  who(
    'd6e35cf9-51f7-4d43-8173-2e47f508b508',
    'Kim gece yarısı buzdolabını en çok yoklar?',
    'Gece Atıştırmacısı',
  ),
  who(
    '72e9b879-7bdc-4367-b191-66e73f677f49',
    'Kim en kolay kahkahaya boğulur?',
    'Kahkaha Makinesi',
  ),
  who(
    '80b96d3b-95fc-4e6d-a7a4-c7aaf6df6091',
    'Kim telefonunu en sık kaybeder?',
    'Kayıp Eşya Bürosu',
  ),
  who('9011e26b-d194-48a7-8cc0-0d9990e46b17', 'Kim en lezzetli yemeği yapar?', 'Mutfak Şefi'),
  who('07728124-45b5-480a-8da5-d1212b5968c7', 'Kim bir gün ünlü olur?', 'Geleceğin Yıldızı'),
  who(
    '6b04c8b7-8736-4e93-9d23-1a7d1c0f92b1',
    'Kim bir tartışmada asla pes etmez?',
    'Son Söz Ustası',
  ),
];

/** Rounds of the "Parti Karışık" pack: two of each game, drawn from published content. */
const PARTY_ROUNDS = [
  QUIZ_GAME_TYPE,
  CLOSEST_NUMBER_GAME_TYPE,
  SORTING_GAME_TYPE,
  WHO_WOULD_GAME_TYPE,
];
const QUESTIONS_PER_ROUND = 2;

async function upsertContent<Content>(
  prisma: PrismaClient,
  categoryId: Map<string, string>,
  gameType: string,
  schema: z.ZodType<Content>,
  items: SeedItem<Content>[],
): Promise<void> {
  for (const item of items) {
    const fields = {
      gameType,
      data: schema.parse(item.content) as object,
      categoryId: item.category ? (categoryId.get(item.category) ?? null) : null,
      difficulty: item.difficulty,
      locale: 'tr',
      status: 'PUBLISHED' as const,
      baseScore: 1000,
    };
    await prisma.contentItem.upsert({
      where: { id: item.id },
      create: { id: item.id, ...fields },
      update: fields,
    });
  }
}

/**
 * Sample content for Closest Number, Sorting and "Kim Yapar?", and the "Parti Karışık" pack
 * that plays all four games. Requires the categories and the quiz sample to be seeded.
 */
export async function seedPartyPack(prisma: PrismaClient): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(categories.map((category) => [category.slug, category.id]));
  await upsertContent(
    prisma,
    categoryId,
    CLOSEST_NUMBER_GAME_TYPE,
    closestNumberContentSchema,
    SAMPLE_CLOSEST_NUMBER,
  );
  await upsertContent(prisma, categoryId, SORTING_GAME_TYPE, sortingContentSchema, SAMPLE_SORTING);
  await upsertContent(
    prisma,
    categoryId,
    WHO_WOULD_GAME_TYPE,
    whoWouldContentSchema,
    SAMPLE_WHO_WOULD,
  );

  const pack = {
    name: 'Parti Karışık',
    description: 'Quiz, en yakın tahmin, sıralama ve Kim Yapar? bir arada. En az 3 oyuncu.',
    status: 'PUBLISHED' as const,
    settings: {},
  };
  await prisma.gamePack.upsert({
    where: { id: PARTY_PACK_ID },
    create: { id: PARTY_PACK_ID, ...pack },
    update: pack,
  });
  const selection: ContentSelection = { mode: 'random' };
  for (const [index, gameType] of PARTY_ROUNDS.entries()) {
    const order = index + 1;
    const round = {
      gameType,
      contentSelection: selection,
      questionCount: QUESTIONS_PER_ROUND,
      timeLimitMs: null,
      scoreMultiplier: 1,
      // The scoreboard comes after each game anyway (last question of a round).
      showScoreboardAfter: false,
      settings: {},
    };
    await prisma.gamePackRound.upsert({
      where: { gamePackId_order: { gamePackId: PARTY_PACK_ID, order } },
      create: { gamePackId: PARTY_PACK_ID, order, ...round },
      update: round,
    });
  }
}
