import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { QuizHostView } from '@loudroom/game-quiz/server';
import {
  ClientCommand,
  ServerEvent,
  type ApiError,
  type Category,
  type ContentItem,
  type MediaItem,
  type Pack,
  type PublicPack,
} from '@loudroom/shared';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  contentInput,
  jpegWithExif,
  loggedIn,
  packInput,
  quizData,
  uploadForm,
  type AdminClient,
} from './admin-support.js';
import { setTable, testPrisma } from './game-support.js';
import {
  nextEvent,
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

describe('admin content, media and packs', () => {
  let testApp: TestApp;
  let prisma: PrismaClient;
  let admin: AdminClient;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    prisma = testPrisma();
    testApp = await startTestApp({ env: { MEDIA_MAX_UPLOAD_BYTES: '200000' } });
  });

  afterAll(async () => {
    await testApp.app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetRedis();
    admin = await loggedIn(testApp.url, prisma, 'EDITOR');
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });

  async function upload(): Promise<MediaItem> {
    const response = await admin.request<MediaItem>('POST', '/api/admin/media', {
      form: uploadForm(await jpegWithExif(), 'fotoğraf.jpg', 'Kırmızı kare'),
    });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function createContent(data: unknown, overrides: Record<string, unknown> = {}) {
    const response = await admin.request<ContentItem>('POST', '/api/admin/content', {
      json: contentInput(data, overrides),
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body;
  }

  describe('media', () => {
    it('re-encodes uploads to WebP without metadata and serves them', async () => {
      const media = await upload();
      expect(media).toMatchObject({
        type: 'IMAGE',
        mimeType: 'image/webp',
        width: 40,
        height: 30,
        altText: 'Kırmızı kare',
        originalName: 'fotoğraf.jpg',
        usageCount: 0,
      });

      const file = await fetch(new URL(`/media/${media.id}.webp`, testApp.url));
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe('image/webp');
      expect(file.headers.get('cache-control')).toContain('immutable');
      const stored = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(stored).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(stored.toString('latin1')).not.toContain('secret-location');
      expect(existsSync(join(testApp.config.media.dir, `${media.id}.webp`))).toBe(true);
    });

    it('sniffs the real format and enforces the size limit', async () => {
      const fake = await admin.request<ApiError>('POST', '/api/admin/media', {
        form: uploadForm(Buffer.from('<svg onload="alert(1)"></svg>'), 'image.png'),
      });
      expect(fake.status).toBe(415);
      expect(fake.body.code).toBe('MEDIA_UNSUPPORTED');

      const big = await sharp({
        create: { width: 800, height: 800, channels: 3, background: '#123456' },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
      const tooLarge = await admin.request<ApiError>('POST', '/api/admin/media', {
        form: uploadForm(big, 'big.png'),
      });
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body.code).toBe('MEDIA_TOO_LARGE');

      const missing = await admin.request<ApiError>('POST', '/api/admin/media', {
        form: new FormData(),
      });
      expect(missing.body.code).toBe('VALIDATION_ERROR');
    });

    it('keeps media in use and deletes it once unused', async () => {
      const media = await upload();
      const content = await createContent(quizData('medya', media.id));
      expect(content.mediaIds).toEqual([media.id]);
      expect(
        (await admin.request<MediaItem>('GET', `/api/admin/media/${media.id}`)).body.usageCount,
      ).toBe(1);

      const blocked = await admin.request<ApiError>('DELETE', `/api/admin/media/${media.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('IN_USE');

      // Removing the image from the content frees the file.
      await admin.request('PUT', `/api/admin/content/${content.id}`, {
        json: contentInput(quizData('medya')),
      });
      expect((await admin.request('DELETE', `/api/admin/media/${media.id}`)).status).toBe(204);
      expect((await fetch(new URL(`/media/${media.id}.webp`, testApp.url))).status).toBe(404);
      expect(existsSync(join(testApp.config.media.dir, `${media.id}.webp`))).toBe(false);
    });
  });

  describe('content', () => {
    it('validates data with the game module and referenced media', async () => {
      const invalid = await admin.request<ApiError>('POST', '/api/admin/content', {
        json: contentInput({ ...quizData('x'), correctOptionId: 'z' }),
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('CONTENT_INVALID');
      expect(invalid.body.issues?.[0]?.path).toEqual(['data', 'correctOptionId']);

      const unknownGame = await admin.request<ApiError>('POST', '/api/admin/content', {
        json: contentInput(quizData('x'), { gameType: 'chess' }),
      });
      expect(unknownGame.body.issues?.[0]).toMatchObject({
        path: ['gameType'],
        code: 'UNKNOWN_GAME',
      });

      const ghostMedia = await admin.request<ApiError>('POST', '/api/admin/content', {
        json: contentInput(quizData('x', randomUUID())),
      });
      expect(ghostMedia.body.code).toBe('CONTENT_INVALID');
      expect(ghostMedia.body.issues?.[0]?.code).toBe('MEDIA_MISSING');

      const badCategory = await admin.request<ApiError>('POST', '/api/admin/content', {
        json: contentInput(quizData('x'), { categoryId: randomUUID() }),
      });
      expect(badCategory.body.issues?.[0]?.path).toEqual(['categoryId']);
    });

    it('creates, lists with filters and search, updates and deletes', async () => {
      const tag = randomUUID().slice(0, 8);
      const category = (
        await admin.request<Category>('POST', '/api/admin/categories', {
          json: { slug: `kat-${tag}`, name: `Kategori ${tag}`, description: null },
        })
      ).body;
      const content = await createContent(quizData(`arama-${tag}`), {
        categoryId: category.id,
        difficulty: 'HARD',
        tags: ['Uzay', 'uzay', 'bilim'],
        status: 'DRAFT',
      });
      expect(content.tags.sort()).toEqual(['bilim', 'uzay']);
      expect(content.createdBy).toBe('EDITOR');

      const found = await admin.request<{ items: ContentItem[]; total: number }>(
        'GET',
        `/api/admin/content?q=ARAMA-${tag}&difficulty=HARD&status=DRAFT`,
      );
      expect(found.body.items.map((item) => item.id)).toEqual([content.id]);
      const none = await admin.request<{ total: number }>(
        'GET',
        `/api/admin/content?q=arama-${tag}&status=PUBLISHED`,
      );
      expect(none.body.total).toBe(0);
      // LIKE wildcards are literal.
      const wildcard = await admin.request<{ items: ContentItem[] }>(
        'GET',
        `/api/admin/content?q=${encodeURIComponent('%_%')}&categoryId=${category.id}`,
      );
      expect(wildcard.body.items).toEqual([]);

      const updated = await admin.request<ContentItem>('PUT', `/api/admin/content/${content.id}`, {
        json: contentInput(
          { ...quizData(`arama-${tag}`), question: 'Güncel soru?' },
          { categoryId: category.id },
        ),
      });
      expect((updated.body.data as { question: string }).question).toBe('Güncel soru?');

      const changeGame = await admin.request<ApiError>('PUT', `/api/admin/content/${content.id}`, {
        json: contentInput(quizData('x'), { gameType: 'other' }),
      });
      expect(changeGame.status).toBe(400);

      const categories = await admin.request<Category[]>('GET', '/api/admin/categories');
      expect(categories.body.find((item) => item.id === category.id)?.contentCount).toBe(1);
      const categoryInUse = await admin.request<ApiError>(
        'DELETE',
        `/api/admin/categories/${category.id}`,
      );
      expect(categoryInUse.body.code).toBe('IN_USE');

      expect((await admin.request('DELETE', `/api/admin/content/${content.id}`)).status).toBe(204);
      expect((await admin.request('GET', `/api/admin/content/${content.id}`)).status).toBe(404);
      expect((await admin.request('DELETE', `/api/admin/categories/${category.id}`)).status).toBe(
        204,
      );
    });

    it('rejects duplicate category slugs', async () => {
      const slug = `tekrar-${randomUUID().slice(0, 6)}`;
      const json = { slug, name: 'Bir', description: null };
      expect((await admin.request('POST', '/api/admin/categories', { json })).status).toBe(201);
      const again = await admin.request<ApiError>('POST', '/api/admin/categories', { json });
      expect(again.body.code).toBe('SLUG_TAKEN');
      const badSlug = await admin.request<ApiError>('POST', '/api/admin/categories', {
        json: { ...json, slug: 'Büyük Harf' },
      });
      expect(badSlug.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('packs', () => {
    it('checks a pack on publish and lists only published packs for hosts', async () => {
      const published = await createContent(quizData('p1'));
      const draft = await createContent(quizData('p2'), { status: 'DRAFT' });

      const empty = await admin.request<ApiError>('POST', '/api/admin/packs', {
        json: packInput([published.id], { rounds: [] }),
      });
      expect(empty.body).toMatchObject({ code: 'PACK_INVALID', issues: [{ code: 'NO_ROUNDS' }] });

      const withDraft = await admin.request<ApiError>('POST', '/api/admin/packs', {
        json: packInput([published.id, draft.id, randomUUID()]),
      });
      expect(withDraft.body.issues?.map((issue) => [issue.code, issue.path.at(-1)])).toEqual([
        ['CONTENT_NOT_PUBLISHED', 1],
        ['CONTENT_MISSING', 2],
      ]);

      const tooMany = await admin.request<ApiError>('POST', '/api/admin/packs', {
        json: packInput([published.id], {
          rounds: [
            {
              gameType: 'quiz',
              contentSelection: { mode: 'random', categoryId: randomUUID() },
              questionCount: 3,
              timeLimitMs: null,
              scoreMultiplier: 1,
              showScoreboardAfter: true,
            },
          ],
        }),
      });
      expect(tooMany.body.issues?.[0]).toMatchObject({ code: 'NOT_ENOUGH_CONTENT', message: '0' });

      // A draft may be incomplete.
      const draftPack = await admin.request<Pack>('POST', '/api/admin/packs', {
        json: packInput([published.id, draft.id], { status: 'DRAFT' }),
      });
      expect(draftPack.status).toBe(201);

      const pack = await admin.request<Pack>('POST', '/api/admin/packs', {
        json: { ...packInput([published.id, published.id]), description: 'Açıklama' },
      });
      expect(pack.status).toBe(201);
      // A fixed list plays its items once each, so the count follows the list.
      expect(pack.body.rounds[0]).toMatchObject({
        order: 1,
        questionCount: 1,
        contentSelection: { mode: 'fixed', contentIds: [published.id] },
      });

      const hostList = await fetch(new URL('/api/packs', testApp.url));
      const packs = (await hostList.json()) as PublicPack[];
      expect(packs.find((item) => item.id === pack.body.id)).toEqual({
        id: pack.body.id,
        name: pack.body.name,
        description: 'Açıklama',
        questionCount: 1,
        gameTypes: ['quiz'],
        minPlayers: 1,
      });
      expect(packs.some((item) => item.id === draftPack.body.id)).toBe(false);

      // Content in a pack stays; content in a published pack stays published.
      const deleteUsed = await admin.request<ApiError>(
        'DELETE',
        `/api/admin/content/${published.id}`,
      );
      expect(deleteUsed.body.code).toBe('IN_USE');
      const unpublish = await admin.request<ApiError>('PUT', `/api/admin/content/${published.id}`, {
        json: contentInput(quizData('p1'), { status: 'DRAFT' }),
      });
      expect(unpublish.body.code).toBe('IN_USE');
      const deleteInDraftPack = await admin.request<ApiError>(
        'DELETE',
        `/api/admin/content/${draft.id}`,
      );
      expect(deleteInDraftPack.body.code).toBe('IN_USE');

      // Deleting the packs frees the content.
      expect((await admin.request('DELETE', `/api/admin/packs/${pack.body.id}`)).status).toBe(204);
      expect((await admin.request('DELETE', `/api/admin/packs/${draftPack.body.id}`)).status).toBe(
        204,
      );
      expect((await admin.request('DELETE', `/api/admin/content/${published.id}`)).status).toBe(
        204,
      );
    });

    it('starts games only from published packs, with images in the question view', async () => {
      const media = await upload();
      const content = await createContent(quizData('oyun', media.id));
      const draft = await admin.request<Pack>('POST', '/api/admin/packs', {
        json: packInput([content.id], { status: 'DRAFT' }),
      });

      const table = await setTable(testApp, 1, sockets);
      expect(
        await send(table.host, ClientCommand.GameStart, { packId: draft.body.id }),
      ).toMatchObject({ ok: false, code: 'PACK_NOT_FOUND' });

      await admin.request('PUT', `/api/admin/packs/${draft.body.id}`, {
        json: packInput([content.id], { name: draft.body.name }),
      });
      const playing = nextEvent(
        table.host,
        ServerEvent.GameState,
        (state) => state.status === 'PLAYING',
        8_000,
      );
      await sendOk(table.host, ClientCommand.GameStart, { packId: draft.body.id });
      const state = await playing;
      const view = state.round?.view as QuizHostView;
      expect(view.media).toEqual({ type: 'image', mediaId: media.id });
    });

    it('validates the new games’ content with their own schemas', async () => {
      const cases: [string, unknown, unknown][] = [
        [
          'closestNumber',
          { question: 'Kaç?', answer: 1234.5, unit: 'm', displayFormat: 'number' },
          { question: 'Hangi yıl?', answer: 1453.5, displayFormat: 'year' },
        ],
        [
          'sorting',
          {
            question: 'Sırala',
            items: [
              { id: 'a', text: 'Bir' },
              { id: 'b', text: 'İki' },
              { id: 'c', text: 'Üç' },
            ],
          },
          {
            question: 'Sırala',
            items: [
              { id: 'a', text: 'Bir' },
              { id: 'b', text: 'İki' },
            ],
          },
        ],
        ['whoWould', { question: 'Kim?', title: 'Unvan' }, { question: '' }],
      ];
      for (const [gameType, valid, invalid] of cases) {
        const created = await createContent(valid, { gameType });
        expect(created.data).toEqual(valid);
        const refused = await admin.request<ApiError>('POST', '/api/admin/content', {
          json: contentInput(invalid, { gameType }),
        });
        expect(refused.status).toBe(400);
        expect(refused.body.code).toBe('CONTENT_INVALID');
        expect(refused.body.issues?.[0]?.path[0]).toBe('data');
      }
    });

    it('checks and keeps per-round game settings; hosts see how many players a pack needs', async () => {
      const quiz = await createContent(quizData('ayar'));
      const who = await createContent({ question: 'Kim en çok güler?' }, { gameType: 'whoWould' });
      const round = (gameType: string, contentId: string, settings: unknown) => ({
        gameType,
        contentSelection: { mode: 'fixed', contentIds: [contentId] },
        questionCount: 1,
        timeLimitMs: null,
        scoreMultiplier: 1,
        showScoreboardAfter: true,
        settings,
      });

      const bad = await admin.request<ApiError>('POST', '/api/admin/packs', {
        json: packInput([quiz.id], {
          status: 'DRAFT',
          rounds: [
            round('quiz', quiz.id, { baseScore: -5 }),
            round('whoWould', who.id, { nope: 1 }),
          ],
        }),
      });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      expect(bad.body.issues?.map((issue) => issue.path)).toEqual([
        ['rounds', 0, 'settings', 'baseScore'],
        ['rounds', 1, 'settings'],
      ]);

      const pack = await admin.request<Pack>('POST', '/api/admin/packs', {
        json: packInput([quiz.id], {
          rounds: [
            round('quiz', quiz.id, { allowAnswerChange: true }),
            round('whoWould', who.id, { winnerPoints: 200, allowSelfVote: false }),
          ],
        }),
      });
      expect(pack.status, JSON.stringify(pack.body)).toBe(201);
      const stored = await admin.request<Pack>('GET', `/api/admin/packs/${pack.body.id}`);
      expect(stored.body.rounds.map((r) => r.settings)).toEqual([
        { allowAnswerChange: true },
        { winnerPoints: 200, allowSelfVote: false },
      ]);

      const packs = (await (
        await fetch(new URL('/api/packs', testApp.url))
      ).json()) as PublicPack[];
      expect(packs.find((item) => item.id === pack.body.id)).toMatchObject({
        gameTypes: ['quiz', 'whoWould'],
        minPlayers: 3,
      });
      expect((await admin.request('DELETE', `/api/admin/packs/${pack.body.id}`)).status).toBe(204);
    });
  });
});
