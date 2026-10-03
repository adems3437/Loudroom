import type { QuizHostView } from '@loudroom/game-quiz/server';
import {
  ClientCommand,
  ServerEvent,
  type ApiError,
  type ContentItem,
  type MediaItem,
  type Pack,
} from '@loudroom/shared';
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
import { recordAll, setTable, testPrisma } from './game-support.js';
import {
  nextEvent,
  resetRedis,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';
import { hasFfmpeg, makeVideo, probeBuffer } from './video-support.js';

describe.skipIf(!hasFfmpeg)('video uploads (needs ffmpeg)', () => {
  let testApp: TestApp;
  let prisma: PrismaClient;
  let admin: AdminClient;
  const sockets: TestSocket[] = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });

  beforeAll(async () => {
    prisma = testPrisma();
    testApp = await startTestApp({ env: { MEDIA_MAX_VIDEO_BYTES: String(2 * 1024 * 1024) } });
  });

  afterAll(async () => {
    await testApp.app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetRedis();
    admin = await loggedIn(testApp.url, prisma, 'EDITOR');
  });

  async function upload(data: Buffer, name: string) {
    return admin.request<MediaItem & ApiError>('POST', '/api/admin/media', {
      form: uploadForm(data, name),
    });
  }

  it('stores MP4 and WebM remuxed, with every piece of metadata removed', async () => {
    for (const format of ['mp4', 'webm'] as const) {
      const source = makeVideo({ format, seconds: 2 });
      expect(JSON.stringify(probeBuffer(source).format.tags)).toContain('secret-title');

      const response = await upload(source, `klip.${format}`);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body).toMatchObject({
        type: 'VIDEO',
        mimeType: `video/${format}`,
        width: 160,
        height: 120,
        originalName: `klip.${format}`,
      });
      expect(response.body.durationMs).toBeGreaterThanOrEqual(1_900);
      expect(response.body.durationMs).toBeLessThanOrEqual(2_100);

      const file = await fetch(new URL(`/media/${response.body.id}.${format}`, testApp.url));
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe(`video/${format}`);
      const stored = Buffer.from(await file.arrayBuffer());
      const probe = probeBuffer(stored);
      const text = JSON.stringify(probe) + stored.toString('latin1');
      expect(text).not.toContain('secret-title');
      expect(text).not.toContain('41.0082');
      expect(probe.streams.map((stream) => stream.codec_type).sort()).toEqual(['audio', 'video']);
    }
  });

  it('serves byte ranges so players can seek', async () => {
    const response = await upload(makeVideo({ seconds: 1 }), 'kisa.mp4');
    const partial = await fetch(new URL(`/media/${response.body.id}.mp4`, testApp.url), {
      headers: { range: 'bytes=0-99' },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toMatch(/^bytes 0-99\//);
    expect((await partial.arrayBuffer()).byteLength).toBe(100);
  });

  it('refuses long, unsupported and oversized videos', async () => {
    const long = await upload(makeVideo({ seconds: 61, audio: false }), 'uzun.mp4');
    expect(long.status).toBe(415);
    expect(long.body.code).toBe('MEDIA_UNSUPPORTED');

    // H.264 inside Matroska is .mkv, not WebM.
    const mkv = await upload(makeVideo({ format: 'mkv', seconds: 1 }), 'film.webm');
    expect(mkv.body.code).toBe('MEDIA_UNSUPPORTED');

    const tooLarge = await upload(
      Buffer.concat([makeVideo({ seconds: 1 }), Buffer.alloc(2 * 1024 * 1024)]),
      'buyuk.mp4',
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.code).toBe('MEDIA_TOO_LARGE');

    // A broken file that only starts like an MP4.
    const broken = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom'),
      Buffer.alloc(64),
    ]);
    expect((await upload(broken, 'bozuk.mp4')).body.code).toBe('MEDIA_UNSUPPORTED');
  });

  it('answers VIDEO_UNAVAILABLE without ffmpeg, while images keep working', async () => {
    const noTools = await startTestApp({
      env: { FFMPEG_PATH: '/nonexistent/ffmpeg', FFPROBE_PATH: '/nonexistent/ffprobe' },
    });
    try {
      const client = await loggedIn(noTools.url, prisma, 'EDITOR');
      const video = await client.request<ApiError>('POST', '/api/admin/media', {
        form: uploadForm(makeVideo({ seconds: 1 }), 'klip.mp4'),
      });
      expect(video.status).toBe(503);
      expect(video.body.code).toBe('VIDEO_UNAVAILABLE');
    } finally {
      await noTools.app.close();
    }
  });

  it('checks that content names a video where it expects one, and an image elsewhere', async () => {
    const video = (await upload(makeVideo({ format: 'webm', seconds: 2 }), 'soru.webm')).body;
    const image = (await upload(await jpegWithExif(), 'resim.jpg')).body;
    const create = (data: unknown) =>
      admin.request<ContentItem & ApiError>('POST', '/api/admin/content', {
        json: contentInput(data),
      });

    const ok = await create({ ...quizData('video'), media: { type: 'video', mediaId: video.id } });
    expect(ok.status).toBe(201);
    expect(ok.body.mediaIds).toEqual([video.id]);

    for (const data of [
      { ...quizData('x'), media: { type: 'image', mediaId: video.id } },
      { ...quizData('x'), media: { type: 'video', mediaId: image.id } },
      {
        ...quizData('x'),
        options: [
          { id: 'a', text: 'Bir', mediaId: video.id },
          { id: 'b', text: 'İki' },
        ],
      },
    ]) {
      const refused = await create(data);
      expect(refused.body.code).toBe('CONTENT_INVALID');
      expect(refused.body.issues?.[0]?.code).toBe('MEDIA_MISSING');
    }
  });

  it('plays a video question: INTRO lasts the video, the TV gets it, phones do not', async () => {
    const video = (await upload(makeVideo({ format: 'webm', seconds: 2 }), 'soru.webm')).body;
    const content = (
      await admin.request<ContentItem>('POST', '/api/admin/content', {
        json: contentInput({ ...quizData('oyun'), media: { type: 'video', mediaId: video.id } }),
      })
    ).body;
    const pack = (
      await admin.request<Pack>('POST', '/api/admin/packs', { json: packInput([content.id]) })
    ).body;

    const table = await setTable(testApp, 1, sockets);
    const phone = table.players[0];
    if (!phone) throw new Error('no player');
    const phoneFrames = recordAll(phone.socket);
    const intro = nextEvent(
      table.host,
      ServerEvent.GameState,
      (state) => state.status === 'PLAYING' && state.round?.phase?.name === 'INTRO',
      10_000,
    );
    await sendOk(table.host, ClientCommand.GameStart, { packId: pack.id });
    const state = await intro;
    expect(state.round?.phase?.durationMs).toBe(video.durationMs);
    expect((state.round?.view as QuizHostView).media).toEqual({
      type: 'video',
      mediaId: video.id,
      format: 'webm',
      durationMs: video.durationMs,
    });
    expect(JSON.stringify(phoneFrames)).not.toContain(video.id);
  });
});
