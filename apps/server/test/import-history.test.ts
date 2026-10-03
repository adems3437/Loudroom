import { randomUUID } from 'node:crypto';
import type {
  AdminStats,
  ApiError,
  ContentItem,
  ContentStat,
  ImportPreview,
  SessionDetail,
  SessionSummary,
} from '@loudroom/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readSheet } from 'read-excel-file/node';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { RetentionService } from '../src/history/retention.service.js';
import { contentInput, loggedIn, quizData, uploadForm, type AdminClient } from './admin-support.js';
import { testPrisma } from './game-support.js';
import { resetRedis, startTestApp, type TestApp } from './support.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function csv(lines: string[]): FormData {
  return uploadForm(Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'), 'sorular.csv');
}

describe('content import, session history and statistics', () => {
  let testApp: TestApp;
  let prisma: PrismaClient;
  let editor: AdminClient & { userId: string };

  beforeAll(async () => {
    prisma = testPrisma();
    testApp = await startTestApp();
    await prisma.category.upsert({
      where: { slug: 'genel-kultur' },
      update: {},
      create: { slug: 'genel-kultur', name: 'Genel Kültür' },
    });
  });

  afterAll(async () => {
    await testApp.app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetRedis();
    editor = await loggedIn(testApp.url, prisma, 'EDITOR');
  });

  describe('import', () => {
    it('offers CSV and XLSX templates whose example row imports', async () => {
      const template = await editor.request<string>(
        'GET',
        '/api/admin/import/quiz/template?format=csv',
      );
      expect(template.status).toBe(200);
      expect(template.headers.get('content-disposition')).toContain('loudroom-quiz.csv');
      const [header, example] = template.body
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(header).toBe(
        'soru;a;b;c;d;e;f;dogru;gorsel_id;video_id;kategori;zorluk;etiketler;durum',
      );
      expect(example).toContain('Ankara');

      const response = await fetch(
        new URL('/api/admin/import/quiz/template?format=xlsx', testApp.url),
        { headers: { cookie: editor.cookie ?? '', origin: 'http://localhost:3000' } },
      );
      expect(response.status).toBe(200);
      const xlsx = Buffer.from(await response.arrayBuffer());
      const sheet = await readSheet(xlsx);
      expect(sheet[0]?.[0]?.toString()).toBe('soru');

      const preview = await editor.request<ImportPreview>(
        'POST',
        '/api/admin/import/quiz/preview',
        {
          form: uploadForm(xlsx, 'sablon.xlsx'),
        },
      );
      expect(preview.status, JSON.stringify(preview.body)).toBe(201);
      expect(preview.body.rows).toEqual([
        expect.objectContaining({ row: 2, ok: true, issues: [] }),
      ]);
      expect(preview.body.rows[0]?.input).toMatchObject({
        gameType: 'quiz',
        status: 'DRAFT',
        difficulty: 'MEDIUM',
        tags: ['örnek', 'ilk'],
        data: { correctOptionId: 'b' },
      });
    });

    it('previews rows with their problems, then saves only the valid ones', async () => {
      const tag = randomUUID().slice(0, 8);
      const before = await prisma.contentItem.count();
      const preview = await editor.request<ImportPreview>(
        'POST',
        '/api/admin/import/quiz/preview',
        {
          form: csv([
            'Soru;A;B;C;Doğru;Kategori;Zorluk;Etiketler;Durum;Not',
            `İçe aktarılan 1 ${tag};Bir;İki;;b;Genel Kültür;Zor;${tag};Yayında;x`,
            `İçe aktarılan 2 ${tag};Bir;;;a;;;;;`,
            `İçe aktarılan 3 ${tag};Bir;İki;Üç;d;bilinmeyen;çok zor;;;`,
            `"İçe; aktarılan 4 ${tag}";Bir;İki;;A;;kolay;;taslak;`,
          ]),
        },
      );
      expect(preview.status, JSON.stringify(preview.body)).toBe(201);
      const { rows, unknownColumns, missingColumns } = preview.body;
      expect(unknownColumns).toEqual(['Not']);
      expect(missingColumns).toEqual([]);
      expect(rows.map((row) => row.ok)).toEqual([true, false, false, true]);
      expect(rows[0]?.input).toMatchObject({
        difficulty: 'HARD',
        status: 'PUBLISHED',
        tags: [tag],
      });
      expect(rows[0]?.input?.categoryId).toEqual(expect.any(String));
      expect(rows[1]?.issues).toContainEqual({ column: 'b', code: 'REQUIRED' });
      expect(rows[2]?.issues).toEqual(
        expect.arrayContaining([
          { column: 'dogru', code: 'INVALID' },
          { column: 'kategori', code: 'CATEGORY_UNKNOWN' },
          { column: 'zorluk', code: 'DIFFICULTY_INVALID' },
        ]),
      );
      expect(rows[3]?.input?.data).toMatchObject({
        question: `İçe; aktarılan 4 ${tag}`,
        correctOptionId: 'a',
      });
      // A preview saves nothing.
      expect(await prisma.contentItem.count()).toBe(before);

      const items = rows.flatMap((row) => (row.input ? [row.input] : []));
      const saved = await editor.request<{ created: number }>('POST', '/api/admin/import/quiz', {
        json: { items },
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(201);
      expect(saved.body.created).toBe(2);
      const created = await prisma.contentItem.findMany({
        where: { data: { path: ['question'], string_contains: tag } },
      });
      expect(created).toHaveLength(2);
      expect(created.every((item) => item.createdById === editor.userId)).toBe(true);
    });

    it('saves nothing when one item was tampered with', async () => {
      const tag = randomUUID().slice(0, 8);
      const good = contentInput(quizData(tag));
      const bad = contentInput({ ...quizData(tag), correctOptionId: 'z' });
      const response = await editor.request<ApiError>('POST', '/api/admin/import/quiz', {
        json: { items: [good, bad] },
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('CONTENT_INVALID');
      expect(response.body.issues?.[0]?.path.slice(0, 2)).toEqual(['items', 1]);
      const other = await editor.request<ApiError>('POST', '/api/admin/import/quiz', {
        json: { items: [contentInput(quizData(tag), { gameType: 'drawing' })] },
      });
      expect(other.status).toBe(400);
      expect(
        await prisma.contentItem.count({
          where: { data: { path: ['question'], string_contains: tag } },
        }),
      ).toBe(0);
    });

    it('refuses files it cannot read and games without import', async () => {
      const latin1 = await editor.request<ApiError>('POST', '/api/admin/import/quiz/preview', {
        form: uploadForm(Buffer.from('soru;a;b;dogru\nK\xfcltür;x;y;a\n', 'latin1'), 'eski.csv'),
      });
      expect(latin1.status).toBe(400);
      expect(latin1.body).toMatchObject({
        code: 'IMPORT_INVALID',
        issues: [{ path: ['file'], code: 'NOT_UTF8' }],
      });

      const huge = await editor.request<ApiError>('POST', '/api/admin/import/quiz/preview', {
        form: uploadForm(Buffer.alloc(2 * 1024 * 1024 + 1, 'a'), 'buyuk.csv'),
      });
      expect(huge.status).toBe(400);
      expect(huge.body.issues?.[0]?.code).toBe('TOO_LARGE');

      const missing = await editor.request<ImportPreview>(
        'POST',
        '/api/admin/import/quiz/preview',
        { form: csv(['soru;a', 'Bir soru;x']) },
      );
      expect(missing.body.missingColumns).toEqual(['b', 'dogru']);

      const unknown = await editor.request<ApiError>('GET', '/api/admin/import/yok/template');
      expect(unknown.status).toBe(404);

      const anonymous = await fetch(new URL('/api/admin/import/quiz/template', testApp.url));
      expect(anonymous.status).toBe(401);
    });
  });

  describe('history', () => {
    /** A finished two-player game with one quiz round on `contentItemId`. */
    async function playedSession(
      contentItemId: string | null,
      overrides: { startedAt?: Date; status?: 'ACTIVE' | 'FINISHED' | 'ABORTED' } = {},
    ) {
      const roomCode = String(Math.floor(100_000 + Math.random() * 900_000));
      const session = await prisma.gameSession.create({
        data: {
          roomCode,
          packSnapshot: { name: `Geçmiş paketi ${roomCode}` },
          status: overrides.status ?? 'FINISHED',
          ...(overrides.startedAt ? { startedAt: overrides.startedAt } : {}),
          endedAt: overrides.status === 'ACTIVE' ? null : new Date(),
        },
      });
      const player = (nickname: string, finalScore: number, finalRank: number) =>
        prisma.sessionPlayer.create({
          data: {
            sessionId: session.id,
            playerId: randomUUID(),
            nickname,
            avatar: 'fox',
            color: 'coral',
            finalScore,
            finalRank,
          },
        });
      const ayse = await player('Ayşe', 900, 1);
      const mehmet = await player('Mehmet', 0, 2);
      const round = await prisma.sessionRound.create({
        data: {
          sessionId: session.id,
          roundIndex: 0,
          gameType: 'quiz',
          contentItemId,
          contentSnapshot: quizData('geçmiş'),
          endedAt: new Date(),
        },
      });
      await prisma.playerAnswer.createMany({
        data: [
          {
            sessionRoundId: round.id,
            sessionPlayerId: ayse.id,
            input: { optionId: 'b' },
            isCorrect: true,
            responseTimeMs: 1200,
          },
          {
            sessionRoundId: round.id,
            sessionPlayerId: mehmet.id,
            input: { optionId: 'a' },
            isCorrect: false,
            responseTimeMs: 2800,
          },
        ],
      });
      await prisma.scoreEvent.create({
        data: {
          sessionRoundId: round.id,
          sessionPlayerId: ayse.id,
          points: 900,
          reason: 'answer',
        },
      });
      return { session, ayse: ayse, mehmet: mehmet };
    }

    async function content(): Promise<ContentItem> {
      const response = await editor.request<ContentItem>('POST', '/api/admin/content', {
        json: contentInput(quizData(randomUUID().slice(0, 8))),
      });
      expect(response.status).toBe(201);
      return response.body;
    }

    it('lists played games and shows each round with answers and points', async () => {
      const { session, ayse, mehmet } = await playedSession(null);
      const list = await editor.request<{ items: SessionSummary[]; total: number }>(
        'GET',
        `/api/admin/sessions?q=${session.roomCode}`,
      );
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          id: session.id,
          packName: `Geçmiş paketi ${session.roomCode}`,
          status: 'FINISHED',
          playerCount: 2,
          roundCount: 1,
          winner: 'Ayşe',
        }),
      ]);

      const detail = await editor.request<SessionDetail>(
        'GET',
        `/api/admin/sessions/${session.id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.players.map((player) => player.nickname)).toEqual(['Ayşe', 'Mehmet']);
      expect(detail.body.rounds[0]?.results).toEqual([
        {
          playerId: ayse.id,
          answer: { optionId: 'b' },
          correct: true,
          responseTimeMs: 1200,
          points: 900,
        },
        {
          playerId: mehmet.id,
          answer: { optionId: 'a' },
          correct: false,
          responseTimeMs: 2800,
          points: 0,
        },
      ]);
      expect(JSON.stringify(detail.body)).not.toContain('tokenHash');

      // Only admins delete history.
      const editorDelete = await editor.request('DELETE', `/api/admin/sessions/${session.id}`);
      expect(editorDelete.status).toBe(403);
      const admin = await loggedIn(testApp.url, prisma, 'ADMIN');
      expect((await admin.request('DELETE', `/api/admin/sessions/${session.id}`)).status).toBe(204);
      expect((await admin.request('DELETE', `/api/admin/sessions/${session.id}`)).status).toBe(404);
      expect(await prisma.playerAnswer.count({ where: { sessionPlayerId: ayse.id } })).toBe(0);
    });

    it('reports activity and how content plays', async () => {
      const item = await content();
      const unplayed = await content();
      await playedSession(item.id);
      await playedSession(item.id);

      const overview = await editor.request<AdminStats>('GET', '/api/admin/stats?days=7');
      expect(overview.status).toBe(200);
      expect(overview.body.days).toBe(7);
      expect(overview.body.perDay).toHaveLength(7);
      expect(overview.body.perDay.at(-1)?.date).toBe(new Date().toISOString().slice(0, 10));
      expect(
        overview.body.perDay.reduce((sum, day) => sum + day.sessions, 0),
      ).toBeGreaterThanOrEqual(2);
      expect(overview.body.sessions).toBeGreaterThanOrEqual(2);
      expect(overview.body.players).toBeGreaterThanOrEqual(4);
      expect(overview.body.packs.length).toBeLessThanOrEqual(10);
      expect(overview.body.games.find((game) => game.gameType === 'quiz')?.rounds).toBeGreaterThan(
        1,
      );

      const stats = await editor.request<ContentStat[]>(
        'GET',
        `/api/admin/stats/content?ids=${item.id},${unplayed.id}`,
      );
      expect(stats.status).toBe(200);
      expect(stats.body).toEqual([
        expect.objectContaining({
          contentItemId: item.id,
          gameType: 'quiz',
          rounds: 2,
          answers: 4,
          correctRate: 0.5,
          avgResponseMs: 2000,
        }),
      ]);

      const top = await editor.request<ContentStat[]>(
        'GET',
        '/api/admin/stats/content/top?order=mostPlayed&gameType=quiz&limit=50',
      );
      expect(top.body.some((stat) => stat.contentItemId === item.id)).toBe(true);
      const badIds = await editor.request<ApiError>('GET', '/api/admin/stats/content?ids=x');
      expect(badIds.status).toBe(400);
    });

    it('marks stale games aborted and deletes history past the retention period', async () => {
      const now = new Date();
      const old = await playedSession(null, { startedAt: new Date(now.getTime() - 200 * DAY_MS) });
      const stale = await playedSession(null, {
        status: 'ACTIVE',
        startedAt: new Date(now.getTime() - 2 * DAY_MS),
      });
      const recent = await playedSession(null, { status: 'ACTIVE' });

      const result = await testApp.app.get(RetentionService).purge(now);
      expect(result.deleted).toBeGreaterThanOrEqual(1);
      expect(result.aborted).toBeGreaterThanOrEqual(1);
      expect(await prisma.gameSession.findUnique({ where: { id: old.session.id } })).toBeNull();
      expect(await prisma.sessionPlayer.count({ where: { sessionId: old.session.id } })).toBe(0);
      const statuses = await prisma.gameSession.findMany({
        where: { id: { in: [stale.session.id, recent.session.id] } },
        select: { id: true, status: true },
      });
      expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({
        [stale.session.id]: 'ABORTED',
        [recent.session.id]: 'ACTIVE',
      });
    });

    it('keeps history forever when the retention period is 0', async () => {
      const app = await startTestApp({ env: { SESSION_RETENTION_DAYS: '0' } });
      try {
        const old = await playedSession(null, {
          startedAt: new Date(Date.now() - 2_000 * DAY_MS),
        });
        await app.app.get(RetentionService).purge();
        expect(
          await prisma.gameSession.findUnique({ where: { id: old.session.id } }),
        ).not.toBeNull();
        await prisma.gameSession.delete({ where: { id: old.session.id } });
      } finally {
        await app.app.close();
      }
    });
  });
});
