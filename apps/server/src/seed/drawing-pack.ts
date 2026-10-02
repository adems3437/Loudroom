import {
  DRAWING_GAME_TYPE,
  drawingContentSchema,
  type DrawingContent,
} from '@loudroom/game-drawing/server';
import type { ContentSelection } from '@loudroom/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const DRAWING_PACK_ID = '6c0e43d1-6b7a-4f2e-9a39-55d8c1a3b7e2';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface SeedWord {
  id: string;
  difficulty: Difficulty;
  content: DrawingContent;
}

const word = (
  id: string,
  difficulty: Difficulty,
  text: string,
  alternatives: string[] = [],
): SeedWord => ({
  id,
  difficulty,
  content: { word: text, ...(alternatives.length ? { alternatives } : {}) },
});

/** Words to draw: animals, food, things, jobs, sports and nature. */
export const SAMPLE_WORDS: SeedWord[] = [
  word('8cc2e24d-b6b3-409a-8f6e-6b52903fa45c', 'EASY', 'Kedi'),
  word('440d419d-c23d-4a63-8107-8a1bfa74a642', 'EASY', 'Balık'),
  word('8c5af044-51d8-4363-b605-dd4d13641869', 'EASY', 'Zürafa'),
  word('a814e3e2-61fe-4a6c-8e44-771c97f7b287', 'MEDIUM', 'Penguen'),
  word('97b479f5-f766-4402-a901-653e9aa22a08', 'MEDIUM', 'Kaplumbağa'),
  word('8fbea1ee-91e2-480b-92d3-34381757842d', 'EASY', 'Yılan'),
  word('b094aaa2-8324-43f9-b6b7-3b07b4325b0f', 'MEDIUM', 'Ahtapot'),
  word('153b100d-25d5-4a2d-a67e-483f6a697768', 'MEDIUM', 'Kelebek'),
  word('e4e4d350-5ccd-4e7b-83da-3e390fce5126', 'EASY', 'Elma'),
  word('7324b1c0-bc57-4cbd-8861-0770faac5021', 'EASY', 'Muz'),
  word('a5b06900-0715-405e-a7ac-9ec8bd0248bb', 'MEDIUM', 'Karpuz'),
  word('3479609a-0d11-4a44-a88e-8b0b30d35664', 'EASY', 'Dondurma'),
  word('91ac1da8-9bc9-424a-b1e4-091a7ab3c5e7', 'MEDIUM', 'Simit'),
  word('56db25e6-ab41-42c5-9dec-0767fff7d9f6', 'MEDIUM', 'Hamburger'),
  word('4464be11-ef1d-40cf-bc7e-351248dff8cd', 'HARD', 'Mantı'),
  word('a81e3fc8-38d9-4d0a-a69c-d0fd5f777f4d', 'MEDIUM', 'Pizza'),
  word('1d2af03d-8606-4276-acd2-0de351adb761', 'EASY', 'Ev'),
  word('9dee691c-5c2a-4d0a-81cc-d672bb1701ab', 'EASY', 'Araba', ['Otomobil']),
  word('45d46ac4-97fb-47a3-8d53-4e95dd59477a', 'MEDIUM', 'Bisiklet'),
  word('e65b5b9a-ddac-465d-8f61-95165cab0d24', 'EASY', 'Şemsiye'),
  word('65f18f9c-d263-4405-b9f0-dd4fafb96ff3', 'MEDIUM', 'Gözlük'),
  word('eca04f20-d809-43dc-a3dc-3ec615110ddb', 'MEDIUM', 'Buzdolabı', ['Buz dolabı']),
  word('2f9030dd-dd9a-4656-b158-2d50936a6c51', 'MEDIUM', 'Saat'),
  word('d2b25df2-cae6-47d5-9913-9c56a1163fc9', 'HARD', 'Merdiven'),
  word('cbacafed-9aac-460e-83c7-73382ceb2758', 'MEDIUM', 'Telefon', ['Cep telefonu']),
  word('8384d566-a776-400e-b869-e79095f24595', 'EASY', 'Top'),
  word('10cb498d-2975-4ad7-b225-1fdbf1fad4a6', 'MEDIUM', 'Gitar'),
  word('edee9206-590f-4809-8b88-53d146238c70', 'HARD', 'Mikroskop'),
  word('3cc80681-31d2-4111-af8a-a30f7943dc49', 'MEDIUM', 'Doktor', ['Hekim']),
  word('7e2542dc-7965-4cb7-8718-2ffa4fc60876', 'MEDIUM', 'İtfaiyeci'),
  word('54563062-1a7f-4c4b-993b-0168e4f88b62', 'HARD', 'Aşçı', ['Şef']),
  word('c37537a1-4b38-4479-bd75-75d2e08eb2b6', 'HARD', 'Astronot'),
  word('01acfff2-631a-4579-a5f5-d0512f8cf74c', 'MEDIUM', 'Pilot'),
  word('c387e0ff-b051-4a5f-bc11-508225e8dcbf', 'MEDIUM', 'Futbol'),
  word('97184891-32e9-42f6-8c41-b96465360621', 'MEDIUM', 'Basketbol'),
  word('e8e45552-5438-4048-b8a5-0bbe4f6d63bf', 'HARD', 'Kayak'),
  word('2d8e4fa1-85cd-4751-b116-7c55e6fb2635', 'MEDIUM', 'Yüzme'),
  word('b6d774b6-9ea0-46ea-8ad2-6d595d8a19cc', 'EASY', 'Güneş'),
  word('cf7ff3b6-8975-4efe-abb7-4a045727c8f6', 'MEDIUM', 'Gökkuşağı'),
  word('adc3b0c2-5a57-4ba0-89e0-512b46037382', 'MEDIUM', 'Kardan adam', ['Kardanadam']),
  word('9cf7a9d8-1219-420a-84e7-a2e11c1b4024', 'HARD', 'Yanardağ', ['Volkan']),
];

/** Sample words and the published "Çiz Bil" pack (6 random words). */
export async function seedDrawingPack(prisma: PrismaClient): Promise<void> {
  for (const item of SAMPLE_WORDS) {
    const fields = {
      gameType: DRAWING_GAME_TYPE,
      data: drawingContentSchema.parse(item.content) as object,
      categoryId: null,
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

  const pack = {
    name: 'Çiz Bil',
    description: 'Sırayla çiz, diğerleri telefonlarından tahmin etsin. En az 2 oyuncu.',
    status: 'PUBLISHED' as const,
    settings: {},
  };
  await prisma.gamePack.upsert({
    where: { id: DRAWING_PACK_ID },
    create: { id: DRAWING_PACK_ID, ...pack },
    update: pack,
  });
  const selection: ContentSelection = { mode: 'random' };
  const round = {
    gameType: DRAWING_GAME_TYPE,
    contentSelection: selection,
    questionCount: 6,
    timeLimitMs: null,
    scoreMultiplier: 1,
    showScoreboardAfter: true,
    settings: {},
  };
  await prisma.gamePackRound.upsert({
    where: { gamePackId_order: { gamePackId: DRAWING_PACK_ID, order: 1 } },
    create: { gamePackId: DRAWING_PACK_ID, order: 1, ...round },
    update: round,
  });
}
