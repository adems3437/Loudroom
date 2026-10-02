import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BLUFF_GAME_TYPE,
  bluffContentSchema,
  type BluffContent,
} from '@loudroom/game-bluff/server';
import {
  IMAGE_LOCATION_GAME_TYPE,
  imageLocationContentSchema,
  type ImageLocationContent,
} from '@loudroom/game-image-location/server';
import { mediaFileName } from '@loudroom/game-sdk';
import type { ContentSelection } from '@loudroom/shared';
import sharp from 'sharp';
import type { PrismaClient } from '../generated/prisma/client.js';
import { project, TURKIYE_MAP, WORLD_MAP, type SeedMap } from './maps/projection.js';

/** Fixed ids keep the seed idempotent: running it again updates instead of duplicating. */
export const MAP_PACK_ID = '3a25bd2f-7809-45bb-8b86-f5241ad04bde';
export const TURKIYE_MEDIA_ID = '8c332b8f-e419-4fde-b66e-18f0d63ee399';
export const WORLD_MEDIA_ID = 'eaa90be8-14a0-42b2-b970-8035185d2d92';

const MAPS: { id: string; map: SeedMap; altText: string }[] = [
  { id: TURKIYE_MEDIA_ID, map: TURKIYE_MAP, altText: 'Türkiye haritası (etiketsiz)' },
  { id: WORLD_MEDIA_ID, map: WORLD_MAP, altText: 'Dünya haritası (etiketsiz)' },
];

interface SeedItem<Content> {
  id: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  content: Content;
}

const place = (
  id: string,
  difficulty: SeedItem<unknown>['difficulty'],
  question: string,
  map: { id: string; map: SeedMap },
  [lat, lon]: [number, number],
  radius?: number,
): SeedItem<ImageLocationContent> => ({
  id,
  category: 'cografya',
  difficulty,
  content: {
    question,
    mediaId: map.id,
    target: project(map.map, lat, lon),
    ...(radius ? { radius } : {}),
  },
});

const turkiye = { id: TURKIYE_MEDIA_ID, map: TURKIYE_MAP };
const world = { id: WORLD_MEDIA_ID, map: WORLD_MAP };

/** Targets come from latitude/longitude through the maps' own projection. */
export const SAMPLE_IMAGE_LOCATION: SeedItem<ImageLocationContent>[] = [
  place(
    '36e61be2-6ff1-499b-8d6a-6d4b1428bf5e',
    'EASY',
    'Ankara nerede?',
    turkiye,
    [39.925, 32.837],
  ),
  place(
    '3572abbb-7956-49b8-b8fd-38d41ea35802',
    'EASY',
    'İstanbul’un tarihi yarımadası nerede?',
    turkiye,
    [41.008, 28.978],
  ),
  place('7fe568e9-3dd0-49c3-beae-91007b33f80d', 'EASY', 'İzmir nerede?', turkiye, [38.42, 27.14]),
  place(
    'dd5420f2-1c74-42a7-85fe-28a1d7c42425',
    'MEDIUM',
    'Trabzon nerede?',
    turkiye,
    [41.005, 39.72],
  ),
  place(
    'a38113a9-9ac2-40a7-a516-aee07e2841ea',
    'MEDIUM',
    'Kapadokya’daki Göreme nerede?',
    turkiye,
    [38.643, 34.829],
  ),
  place(
    '0104b79e-ce23-4dd9-8a8a-b1b6e5c0b281',
    'EASY',
    'Van Gölü nerede?',
    turkiye,
    [38.63, 42.88],
    0.035,
  ),
  place(
    'd0874081-d734-429f-a222-f04e99213f0e',
    'HARD',
    'Ağrı Dağı nerede?',
    turkiye,
    [39.702, 44.298],
  ),
  place(
    '67021095-0fd9-4777-8bb0-0b11e13ceb4d',
    'MEDIUM',
    'Tokyo nerede?',
    world,
    [35.68, 139.69],
    0.02,
  ),
  place(
    '333cdae8-0c01-4d12-b2d2-adaff9e72ba0',
    'MEDIUM',
    'Kahire nerede?',
    world,
    [30.04, 31.24],
    0.02,
  ),
  place(
    'b9866528-9060-4c87-9bfe-88fa7dc497af',
    'HARD',
    'Rio de Janeiro nerede?',
    world,
    [-22.91, -43.17],
    0.02,
  ),
];

const bluff = (
  id: string,
  category: string,
  question: string,
  answer: string,
  acceptedAnswers: string[],
  decoys: string[],
): SeedItem<BluffContent> => ({
  id,
  category,
  difficulty: 'MEDIUM',
  content: { question, answer, ...(acceptedAnswers.length ? { acceptedAnswers } : {}), decoys },
});

export const SAMPLE_BLUFF: SeedItem<BluffContent>[] = [
  bluff(
    '92fc80ec-c68f-46fa-a6d4-0c2f50bf5a29',
    'bilim-teknoloji',
    'Bir ahtapotun kaç kalbi vardır?',
    'Üç',
    ['3'],
    ['Bir', 'İki', 'Dört', 'Sekiz'],
  ),
  bluff(
    '3ed3fc67-146b-4a57-b08e-7f5fd50b0d15',
    'bilim-teknoloji',
    'Bal arıları dans ederek birbirlerine neyi anlatır?',
    'Yiyeceğin yerini',
    ['Besinin yerini', 'Çiçeklerin yerini', 'Nektarın yerini'],
    ['Kraliçenin yerini', 'Yağmurun geleceğini', 'Düşman geldiğini'],
  ),
  bluff(
    '996b7243-e3f1-4587-b678-5a0972d0167d',
    'bilim-teknoloji',
    'Geriye doğru uçabilen kuş hangisidir?',
    'Sinekkuşu',
    ['Sinek kuşu', 'Kolibri'],
    ['Serçe', 'Kartal', 'Martı'],
  ),
  bluff(
    '732983a8-0e0f-4f85-985f-626f3fc43459',
    'tarih',
    'Antik Mısır’da mumyalanan bedende bırakılan iç organ hangisiydi?',
    'Kalp',
    ['Yürek'],
    ['Beyin', 'Karaciğer', 'Mide'],
  ),
  bluff(
    '41eb9541-b2ac-489e-a36e-0cc77e5aa80a',
    'bilim-teknoloji',
    'Kediler hangi tadı alamaz?',
    'Tatlı',
    ['Şeker', 'Tatlı tat'],
    ['Ekşi', 'Tuzlu', 'Acı'],
  ),
  bluff(
    'a38ad927-7a1d-4282-8a76-b8bfa0d32bc2',
    'bilim-teknoloji',
    'Bir zürafanın boynunda kaç omur vardır?',
    'Yedi',
    ['7'],
    ['On iki', 'Yirmi', 'Otuz'],
  ),
  bluff(
    '608c4517-4440-467d-acb2-b6f96adb728f',
    'tarih',
    'İstanbul’un fethinde Osmanlı gemileri karadan yürütülerek nereye indirildi?',
    'Haliç',
    ['Halic'],
    ['Boğaziçi', 'Marmara', 'Karadeniz'],
  ),
  bluff(
    'c898b737-6fc0-42ee-97cc-9c5bf2dacfdc',
    'bilim-teknoloji',
    'Wombatların dışkısı hangi şekildedir?',
    'Küp',
    ['Kare', 'Küp şeklinde'],
    ['Yıldız', 'Üçgen', 'Halka'],
  ),
  bluff(
    '87491fd9-e376-437d-b137-9979838fcf44',
    'bilim-teknoloji',
    'Bir yıldırım, neyin yüzeyinden daha sıcaktır?',
    'Güneş',
    ['Güneşin yüzeyi'],
    ['Ay', 'Lav', 'Mars'],
  ),
  bluff(
    '15f63781-7b43-42ba-bc5d-d090866f703c',
    'bilim-teknoloji',
    'Bir denizanasının kaç beyni vardır?',
    'Hiç',
    ['0', 'Sıfır', 'Yok', 'Hiç yok'],
    ['Bir', 'İki', 'Dokuz'],
  ),
];

/** Renders the committed map SVGs to WebP media files (fixed ids) and their Media rows. */
async function seedMaps(prisma: PrismaClient, mediaDir: string): Promise<void> {
  await mkdir(mediaDir, { recursive: true });
  for (const { id, map, altText } of MAPS) {
    const svg = await readFile(new URL(`./maps/${map.file}`, import.meta.url));
    const { data, info } = await sharp(svg).webp({ quality: 85 }).toBuffer({
      resolveWithObject: true,
    });
    const storagePath = mediaFileName(id);
    await writeFile(join(mediaDir, storagePath), data);
    const fields = {
      type: 'IMAGE' as const,
      storagePath,
      mimeType: 'image/webp',
      sizeBytes: data.length,
      width: info.width,
      height: info.height,
      altText,
      originalName: map.file,
    };
    await prisma.media.upsert({ where: { id }, create: { id, ...fields }, update: fields });
  }
}

async function upsertContent<Content>(
  prisma: PrismaClient,
  gameType: string,
  schema: { parse: (value: unknown) => Content },
  items: SeedItem<Content>[],
  mediaIds: (content: Content) => string[],
): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(categories.map((category) => [category.slug, category.id]));
  for (const item of items) {
    const data = schema.parse(item.content);
    const media = mediaIds(data).map((id) => ({ id }));
    const fields = {
      gameType,
      data: data as object,
      categoryId: categoryId.get(item.category) ?? null,
      difficulty: item.difficulty,
      locale: 'tr',
      status: 'PUBLISHED' as const,
      baseScore: 1000,
    };
    await prisma.contentItem.upsert({
      where: { id: item.id },
      create: { id: item.id, ...fields, media: { connect: media } },
      update: { ...fields, media: { set: media } },
    });
  }
}

/**
 * The maps (Natural Earth, public domain) with Image Location questions, Bluff questions and
 * the "Harita ve Blöf" pack. Requires the categories. Files go to `mediaDir` (MEDIA_DIR).
 */
export async function seedMapPack(
  prisma: PrismaClient,
  options: { mediaDir?: string } = {},
): Promise<void> {
  await seedMaps(prisma, resolve(options.mediaDir ?? process.env.MEDIA_DIR ?? 'data/media'));
  await upsertContent(
    prisma,
    IMAGE_LOCATION_GAME_TYPE,
    imageLocationContentSchema,
    SAMPLE_IMAGE_LOCATION,
    (content) => [content.mediaId],
  );
  await upsertContent(prisma, BLUFF_GAME_TYPE, bluffContentSchema, SAMPLE_BLUFF, () => []);

  const pack = {
    name: 'Harita ve Blöf',
    description: 'Haritada yer bul, sonra arkadaşlarını blöflerinle kandır. En az 2 oyuncu.',
    status: 'PUBLISHED' as const,
    settings: {},
  };
  await prisma.gamePack.upsert({
    where: { id: MAP_PACK_ID },
    create: { id: MAP_PACK_ID, ...pack },
    update: pack,
  });
  const selection: ContentSelection = { mode: 'random' };
  for (const [index, gameType] of [IMAGE_LOCATION_GAME_TYPE, BLUFF_GAME_TYPE].entries()) {
    const order = index + 1;
    const round = {
      gameType,
      contentSelection: selection,
      questionCount: 3,
      timeLimitMs: null,
      scoreMultiplier: 1,
      showScoreboardAfter: false,
      settings: {},
    };
    await prisma.gamePackRound.upsert({
      where: { gamePackId_order: { gamePackId: MAP_PACK_ID, order } },
      create: { gamePackId: MAP_PACK_ID, order, ...round },
      update: round,
    });
  }
}
