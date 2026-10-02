import type { DrawingChunk, DrawingHostView } from '@loudroom/game-drawing/server';
import { ClientCommand, ClientStream, ServerEvent, type RoundStreamEvent } from '@loudroom/shared';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  createPack,
  gameState,
  phaseOpen,
  recordAll,
  setTable,
  testPrisma,
  type Table,
} from './game-support.js';
import {
  nextEvent,
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

type Player = Table['players'][number];

const line = (stroke: number, points: number[]): DrawingChunk => ({
  ops: [{ t: 'line', s: stroke, c: 0, w: 1, p: points }],
});

function stream(socket: TestSocket, roundId: string, chunk: unknown): void {
  (socket as unknown as Socket).emit(ClientStream.RoundStream, { roundId, chunk });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

/** Stream events a socket received. */
function streamEvents(records: ReturnType<typeof recordAll>): RoundStreamEvent[] {
  return records
    .filter((entry) => entry.event === ServerEvent.RoundStream)
    .map((entry) => entry.payload as RoundStreamEvent);
}

/** Connects with a session token, recording from before the handshake (history comes at once). */
async function reconnect(url: string, token: string, sockets: TestSocket[]) {
  const socket = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { token },
  });
  const records: { event: string; payload: unknown }[] = [];
  socket.onAny((event: string, payload: unknown) => records.push({ event, payload }));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  sockets.push(socket);
  return { socket: socket as unknown as TestSocket, records };
}

describe('drawing and the round stream', () => {
  let prisma: PrismaClient;
  let testApp: TestApp;
  let redis: Redis;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    prisma = testPrisma();
    redis = new Redis(inject('redisUrl'));
    await resetRedis();
    testApp = await startTestApp({ config: FAST });
  });

  beforeEach(async () => {
    await resetRedis();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });

  afterAll(async () => {
    await testApp.app.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  it('streams the drawer’s chunks to the host only, keeps the history, refuses the rest', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'drawing',
        contents: [{ word: 'Zürafa' }, { word: 'Kaplan' }],
        timeLimitMs: 20_000,
      },
    ]);
    const table = await setTable(testApp, 3, sockets);
    // Turns follow join order: the first player draws the first word.
    const [drawer, mehmet, zeynep] = table.players as [Player, Player, Player];
    const hostRecords = recordAll(table.host);
    const phoneRecords = [mehmet, zeynep].map((player) => recordAll(player.socket));
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    const drawing = await phaseOpen(table.host, 'DRAWING');
    expect(drawing.state.round?.view).toMatchObject({ drawerId: drawer.playerId, slots: [6] });
    const roundId = drawing.roundId;

    // Not the drawer, a broken chunk, an old round: all dropped silently.
    stream(mehmet.socket, roundId, line(0, [1, 1]));
    stream(drawer.socket, roundId, { ops: [{ t: 'line', s: 0, c: 99, w: 0, p: [1, 1] }] });
    stream(drawer.socket, 'r0-stale', line(0, [1, 1]));
    await settle();
    expect(streamEvents(hostRecords)).toEqual([]);

    const live = nextEvent(table.host, ServerEvent.RoundStream);
    stream(drawer.socket, roundId, line(0, [10, 10, 20, 20]));
    expect(await live).toEqual({
      roundId,
      reset: false,
      chunks: [line(0, [10, 10, 20, 20])],
      full: false,
    });
    stream(drawer.socket, roundId, line(0, [30, 30]));
    await settle();
    expect(streamEvents(hostRecords)).toHaveLength(2);
    // Players never get the live drawing.
    for (const records of phoneRecords) expect(streamEvents(records)).toEqual([]);
    expect(await redis.llen(`room:${table.roomCode}:stream`)).toBe(2);

    // A reloaded host screen and a reloaded drawer phone get the whole history at once.
    const host2 = await reconnect(testApp.url, table.hostToken, sockets);
    const drawer2 = await reconnect(testApp.url, drawer.playerToken, sockets);
    await settle();
    for (const { records } of [host2, drawer2]) {
      expect(streamEvents(records)).toEqual([
        {
          roundId,
          reset: true,
          chunks: [line(0, [10, 10, 20, 20]), line(0, [30, 30])],
          full: false,
        },
      ]);
    }

    // A guesser reconnecting does not get the drawing.
    const mehmet2 = await reconnect(testApp.url, mehmet.playerToken, sockets);
    await settle();
    expect(streamEvents(mehmet2.records)).toEqual([]);

    // While paused nothing is taken.
    await sendOk(host2.socket, ClientCommand.GamePause, {});
    stream(drawer2.socket, roundId, line(1, [5, 5]));
    await settle();
    expect(await redis.llen(`room:${table.roomCode}:stream`)).toBe(2);
    await sendOk(host2.socket, ClientCommand.GameResume, {});

    // The word reaches nobody but the drawer before the reveal.
    const guess = (player: { socket: TestSocket }, text: string) =>
      send(player.socket, ClientCommand.RoundInput, { roundId, input: { type: 'guess', text } });
    expect((await guess(mehmet2, 'zebra')).ok).toBe(true);
    expect(await guess(drawer2, 'zürafa')).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const leaked = [hostRecords, host2.records, mehmet2.records, ...phoneRecords]
      .flat()
      .map((entry) => JSON.stringify(entry.payload))
      .join('\n');
    expect(leaked.toLocaleLowerCase('tr')).not.toContain('zürafa');

    const result = gameState(host2.socket, (s) => s.status === 'ROUND_RESULT');
    expect((await guess(mehmet2, 'ZURAFA')).ok).toBe(true);
    expect((await guess(zeynep, 'zürafa')).ok).toBe(true);
    const shown = await result;
    expect(shown.round?.view as DrawingHostView).toMatchObject({
      phase: 'REVEAL',
      word: 'Zürafa',
      solvers: [mehmet.playerId, zeynep.playerId],
      feed: [{ playerId: mehmet.playerId, text: 'zebra' }],
    });
    const delta = new Map(shown.standings.map((s) => [s.playerId, s.delta]));
    expect([drawer, mehmet, zeynep].map((p) => delta.get(p.playerId))).toEqual([500, 1000, 850]);

    // The next drawing starts with an empty history; the second player draws.
    const next = phaseOpen(host2.socket, 'DRAWING');
    await sendOk(host2.socket, ClientCommand.GameNext, {});
    const second = await next;
    expect(second.state.round?.view).toMatchObject({ drawerId: mehmet.playerId });
    expect(await redis.llen(`room:${table.roomCode}:stream`)).toBe(0);
  });

  it('caps a round’s stream and tells the drawer once; floods are rate-limited', async () => {
    const { packId } = await createPack(prisma, [
      { gameType: 'drawing', contents: [{ word: 'Kedi' }], timeLimitMs: 20_000 },
    ]);
    const table = await setTable(testApp, 2, sockets);
    const [drawer] = table.players as [Player, Player];
    const drawerRecords = recordAll(drawer.socket);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const { roundId } = await phaseOpen(table.host, 'DRAWING');

    // 16 ops × 64 points ≈ 1.040 per chunk; the round allows 30.000.
    const big: DrawingChunk = {
      ops: Array.from({ length: 16 }, (_, index) => ({
        t: 'line' as const,
        s: index,
        c: 0,
        w: 0,
        p: Array.from({ length: 128 }, (_, i) => i),
      })),
    };
    for (let i = 0; i < 40; i++) stream(drawer.socket, roundId, big);
    await settle();
    expect(await redis.llen(`room:${table.roomCode}:stream`)).toBe(28);
    const full = streamEvents(drawerRecords).filter((event) => event.full);
    expect(full).toHaveLength(1);

    // A flood of tiny chunks: the per-connection bucket (60, +30/s) drops most of them. Wait
    // for the bucket to fill up again first.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await redis.del(`room:${table.roomCode}:stream`, `room:${table.roomCode}:stream:cost`);
    for (let i = 0; i < 200; i++) stream(drawer.socket, roundId, line(i, [i, i]));
    await settle();
    const kept = await redis.llen(`room:${table.roomCode}:stream`);
    expect(kept).toBeGreaterThanOrEqual(55);
    expect(kept).toBeLessThan(120);
  });
});
