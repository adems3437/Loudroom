import { QUIZ_GAME_TYPE, quizContentSchema, type QuizContent } from '@loudroom/game-quiz/server';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { ContentSelection } from '../game/pack-loader.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const SAMPLE_PACK_ID = '624505d8-a23a-433d-8e22-fa41ed3770c3';
const SAMPLE_PACK_ROUND_ORDER = 1;

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface SeedQuestion {
  id: string;
  category: string;
  difficulty: Difficulty;
  content: QuizContent;
}

const q = (
  id: string,
  category: string,
  difficulty: Difficulty,
  question: string,
  options: [string, string, string, string],
  correct: 'a' | 'b' | 'c' | 'd',
): SeedQuestion => ({
  id,
  category,
  difficulty,
  content: {
    question,
    options: options.map((text, index) => ({ id: 'abcd'[index] ?? 'a', text })),
    correctOptionId: correct,
  },
});

/** Ten Turkish general-knowledge questions (SPEC §15 Phase 3 sample pack). */
export const SAMPLE_QUESTIONS: SeedQuestion[] = [
  q(
    '527a7bbe-4957-489a-9d3a-7c41f4e01f42',
    'tarih',
    'EASY',
    'Türkiye Cumhuriyeti hangi yıl ilan edildi?',
    ['1919', '1920', '1923', '1938'],
    'c',
  ),
  q(
    '25a9f8ed-40fd-4549-973f-922fbcaf36bd',
    'bilim-teknoloji',
    'EASY',
    'Güneş Sistemi’nin en büyük gezegeni hangisidir?',
    ['Satürn', 'Jüpiter', 'Neptün', 'Dünya'],
    'b',
  ),
  q(
    '35e6a6ca-ad0c-456c-8b68-dca6b2e00bc8',
    'sanat-edebiyat',
    'EASY',
    'İstiklal Marşı’nın şairi kimdir?',
    ['Mehmet Akif Ersoy', 'Namık Kemal', 'Ziya Gökalp', 'Tevfik Fikret'],
    'a',
  ),
  q(
    'c67233e4-9875-416c-9f8d-0625ff0f84b9',
    'bilim-teknoloji',
    'EASY',
    'Su, deniz seviyesinde kaç °C’de kaynar?',
    ['90', '100', '110', '120'],
    'b',
  ),
  q(
    '45f81787-07e4-4ff3-8ef8-091c375734d8',
    'spor',
    'EASY',
    'Bir futbol takımı sahaya kaç oyuncuyla çıkar?',
    ['9', '10', '11', '12'],
    'c',
  ),
  q(
    '44ef4ca1-3ad0-40d1-97f6-c7ea4c0be8f6',
    'cografya',
    'MEDIUM',
    'Türkiye’nin en yüksek dağı hangisidir?',
    ['Erciyes', 'Ağrı Dağı', 'Uludağ', 'Süphan'],
    'b',
  ),
  q(
    '16b2c103-7402-4b58-8923-f024b8c8fe3b',
    'sanat-edebiyat',
    'EASY',
    'Mona Lisa tablosunu kim yaptı?',
    ['Michelangelo', 'Leonardo da Vinci', 'Rafael', 'Vincent van Gogh'],
    'b',
  ),
  q(
    '4ac9c52d-7301-408c-a072-98539ccf19b1',
    'bilim-teknoloji',
    'MEDIUM',
    'Kimyasal sembolü “Fe” olan element hangisidir?',
    ['Flor', 'Fosfor', 'Demir', 'Kurşun'],
    'c',
  ),
  q(
    '81e517a1-5ef7-4570-8f3d-4f1deca367a7',
    'cografya',
    'EASY',
    'Yüzölçümü en büyük kıta hangisidir?',
    ['Afrika', 'Asya', 'Avrupa', 'Antarktika'],
    'b',
  ),
  q(
    '14d24441-4bdc-4144-b7a8-9701b3ceec24',
    'genel-kultur',
    'EASY',
    'Ay’a ilk ayak basan insan kimdir?',
    ['Neil Armstrong', 'Yuri Gagarin', 'Buzz Aldrin', 'Michael Collins'],
    'a',
  ),
];

/** Sample quiz content and the "Genel Kültür" pack. Requires the categories to be seeded. */
export async function seedQuizPack(prisma: PrismaClient): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(categories.map((category) => [category.slug, category.id]));

  for (const question of SAMPLE_QUESTIONS) {
    const data = quizContentSchema.parse(question.content);
    const fields = {
      gameType: QUIZ_GAME_TYPE,
      data,
      categoryId: categoryId.get(question.category) ?? null,
      difficulty: question.difficulty,
      locale: 'tr',
      status: 'PUBLISHED' as const,
      baseScore: 1000,
      defaultTimeLimitMs: 20_000,
    };
    await prisma.contentItem.upsert({
      where: { id: question.id },
      create: { id: question.id, ...fields },
      update: fields,
    });
  }

  const selection: ContentSelection = {
    mode: 'fixed',
    contentIds: SAMPLE_QUESTIONS.map((question) => question.id),
  };
  const pack = {
    name: 'Genel Kültür Karışık',
    description: 'Tarihten bilime, spordan sanata 10 soruluk ısınma turu.',
    settings: {},
  };
  await prisma.gamePack.upsert({
    where: { id: SAMPLE_PACK_ID },
    create: { id: SAMPLE_PACK_ID, ...pack },
    update: pack,
  });
  const round = {
    gameType: QUIZ_GAME_TYPE,
    contentSelection: selection,
    questionCount: SAMPLE_QUESTIONS.length,
    timeLimitMs: 20_000,
    scoreMultiplier: 1,
    showScoreboardAfter: true,
    settings: {},
  };
  await prisma.gamePackRound.upsert({
    where: { gamePackId_order: { gamePackId: SAMPLE_PACK_ID, order: SAMPLE_PACK_ROUND_ORDER } },
    create: { gamePackId: SAMPLE_PACK_ID, order: SAMPLE_PACK_ROUND_ORDER, ...round },
    update: round,
  });
}
