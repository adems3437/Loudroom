import { ClientCommand, ServerEvent, type GameState } from '@loudroom/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { SessionRecorder } from '../src/game/session-recorder.js';
import {
  answering,
  answeringOpen,
  createQuizPack,
  gameState,
  recordAll,
  roomState,
  setTable,
  testPrisma,
  type Table,
} from './game-support.js';
import {
  connect,
  nextEvent,
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestAppOptions,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

describe('game engine', () => {
  let prisma: PrismaClient;
  let testApp: TestApp;
  const extraApps: TestApp[] = [];
  const sockets: TestSocket[] = [];

  async function start(options: TestAppOptions = {}): Promise<TestApp> {
    const app = await startTestApp({ ...options, config: { ...FAST, ...options.config } });
    extraApps.push(app);
    return app;
  }

  async function startGame(table: Table, packId: string): Promise<void> {
    await sendOk(table.host, ClientCommand.GameStart, { packId });
  }

  async function answer(socket: TestSocket, roundId: string, optionId: string) {
    return send(socket, ClientCommand.RoundInput, { roundId, input: { optionId } });
  }

  beforeAll(async () => {
    prisma = testPrisma();
    await resetRedis();
    testApp = await startTestApp({ config: FAST });
  });

  beforeEach(async () => {
    await resetRedis();
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    for (const app of extraApps.splice(0)) await app.app.close();
  });

  afterAll(async () => {
    await testApp.app.close();
    await prisma.$disconnect();
  });

  it('plays a full game: questions, scoring, scoreboard, podium and history', async () => {
    const { packId, questions } = await createQuizPack(prisma, { count: 2 });
    const table = await setTable(testApp, 3, sockets);
    const [ayse, mehmet, zeynep] = table.players as [
      Table['players'][0],
      Table['players'][0],
      Table['players'][0],
    ];

    await startGame(table, packId);
    for (const [index, question] of questions.entries()) {
      const roundId = await answeringOpen(table.host);
      expect(await answer(ayse.socket, roundId, question.correctOptionId)).toEqual({
        ok: true,
        data: {},
      });
      expect((await answer(mehmet.socket, roundId, question.wrongOptionId)).ok).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
      const mehmetResult = gameState(mehmet.socket, (s) => s.status === 'ROUND_RESULT');
      expect((await answer(zeynep.socket, roundId, question.correctOptionId)).ok).toBe(true);

      // Everyone answered: the round ends without waiting for the clock.
      const shown = await result;
      expect(shown.round?.view).toMatchObject({
        phase: 'REVEAL',
        correctOptionId: question.correctOptionId,
      });
      const byId = new Map(shown.standings.map((s) => [s.playerId, s]));
      expect(byId.get(mehmet.playerId)?.delta).toBe(0);
      // Faster correct answer → more points (both get at least half the base score).
      expect(byId.get(ayse.playerId)?.delta).toBeGreaterThan(byId.get(zeynep.playerId)?.delta ?? 0);
      expect(byId.get(zeynep.playerId)?.delta).toBeGreaterThanOrEqual(500);
      expect(shown.standings.map((s) => s.playerId)).toEqual([
        ayse.playerId,
        zeynep.playerId,
        mehmet.playerId,
      ]);

      // Each phone sees only its own outcome.
      const mine = await mehmetResult;
      expect(mine).toMatchObject({ role: 'player', lastRound: { points: 0, correct: false } });

      if (index === 0) {
        // The server publishes the new state before acking, so listen first.
        const scoreboard = gameState(table.host, (s) => s.status === 'SCOREBOARD');
        await sendOk(table.host, ClientCommand.GameNext, {});
        const board = await scoreboard;
        expect(board.role === 'host' && board.canAdvance).toBe(true);
        await sendOk(table.host, ClientCommand.GameNext, {});
      }
    }

    const finished = gameState(table.host, (s) => s.status === 'FINISHED');
    const ended = nextEvent(ayse.socket, ServerEvent.GameEnd);
    await sendOk(table.host, ClientCommand.GameNext, {});
    const podium = await finished;
    expect(podium.standings.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect((await ended).standings[0]?.playerId).toBe(ayse.playerId);

    // History in PostgreSQL.
    await testApp.app.get(SessionRecorder).flush();
    const session = await prisma.gameSession.findFirstOrThrow({
      where: { roomCode: table.roomCode },
      include: {
        players: { orderBy: { finalRank: 'asc' } },
        rounds: { include: { answers: true, scoreEvents: true }, orderBy: { roundIndex: 'asc' } },
      },
    });
    expect(session.status).toBe('FINISHED');
    expect(session.gamePackId).toBe(packId);
    expect(session.players.map((p) => [p.playerId, p.finalRank])).toEqual([
      [ayse.playerId, 1],
      [zeynep.playerId, 2],
      [mehmet.playerId, 3],
    ]);
    expect(session.rounds).toHaveLength(2);
    expect(session.rounds[0]?.answers).toHaveLength(3);
    expect(session.rounds[0]?.scoreEvents).toHaveLength(3);
    expect(session.rounds[0]?.contentItemId).toBe(questions[0]?.id);
  });

  it('never sends the correct answer before the reveal (transport level)', async () => {
    const { packId, questions } = await createQuizPack(prisma, { count: 1 });
    const table = await setTable(testApp, 2, sockets);
    const recordings = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT');

    await startGame(table, packId);
    const roundId = await answeringOpen(table.host);
    for (const player of table.players) {
      await answer(player.socket, roundId, questions[0]?.wrongOptionId ?? '');
    }
    await result;

    for (const received of recordings) {
      const cut = received.findIndex(
        (entry) =>
          entry.event === ServerEvent.RoundResult ||
          (entry.event === ServerEvent.GameState &&
            (entry.payload as GameState).status === 'ROUND_RESULT'),
      );
      const beforeReveal = JSON.stringify(received.slice(0, cut));
      expect(cut).toBeGreaterThan(0);
      expect(beforeReveal).not.toContain('correctOptionId');
      expect(beforeReveal).not.toMatch(/"correct":/);
      expect(beforeReveal).not.toContain('distribution');
    }
  });

  it('refuses inputs out of turn, stale, repeated or malformed, and checks roles', async () => {
    const { packId, questions } = await createQuizPack(prisma, { count: 2, introMs: 400 });
    const table = await setTable(testApp, 2, sockets);
    const [first] = table.players as [Table['players'][0]];
    const right = questions[0]?.correctOptionId ?? '';

    expect(await send(first.socket, ClientCommand.GameStart, {})).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await send(table.host, ClientCommand.GameNext, {})).toMatchObject({
      code: 'INVALID_STATE',
    });
    await startGame(table, packId);
    expect(await send(table.host, ClientCommand.GameStart, { packId })).toMatchObject({
      code: 'INVALID_STATE',
    });

    const intro = await gameState(first.socket, (s) => s.round?.phase?.name === 'INTRO');
    const introRound = intro.round?.roundId ?? '';
    expect(await answer(first.socket, introRound, right)).toMatchObject({ code: 'ROUND_CLOSED' });

    const roundId = await answeringOpen(first.socket);
    expect(await answer(first.socket, 'r9-deadbeef', right)).toMatchObject({ code: 'STALE_ROUND' });
    expect(
      await send(first.socket, ClientCommand.RoundInput, { roundId, input: { option: 1 } }),
    ).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await answer(first.socket, roundId, 'no-such-option')).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await answer(table.host, roundId, right)).toMatchObject({ code: 'FORBIDDEN' });
    expect((await answer(first.socket, roundId, right)).ok).toBe(true);
    expect(await answer(first.socket, roundId, questions[0]?.wrongOptionId ?? '')).toMatchObject({
      code: 'ALREADY_ANSWERED',
    });
  });

  it('needs connected players to start', async () => {
    const { packId } = await createQuizPack(prisma, { count: 1 });
    const table = await setTable(testApp, 0, sockets);
    expect(await send(table.host, ClientCommand.GameStart, { packId })).toMatchObject({
      code: 'NOT_ENOUGH_PLAYERS',
    });
    expect(
      await send(table.host, ClientCommand.GameStart, {
        packId: '00000000-0000-4000-8000-000000000000',
      }),
    ).toMatchObject({ code: 'PACK_NOT_FOUND' });
  });

  it('ends the round when time runs out', async () => {
    const { packId } = await createQuizPack(prisma, { count: 1, timeLimitMs: 3_000 });
    const table = await setTable(testApp, 2, sockets);
    await startGame(table, packId);
    await answeringOpen(table.host);
    const result = await gameState(table.host, (s) => s.status === 'ROUND_RESULT', 6_000);
    expect(result.standings.every((s) => s.delta === 0)).toBe(true);
  });

  it('pauses and resumes without losing answering time', async () => {
    const { packId } = await createQuizPack(prisma, { count: 1, timeLimitMs: 10_000 });
    const table = await setTable(testApp, 1, sockets);
    await startGame(table, packId);
    const { state: before } = await answering(table.host);

    const paused = gameState(table.host, (s) => s.status === 'PAUSED');
    await sendOk(table.host, ClientCommand.GamePause, {});
    const pausedState = await paused;
    expect(pausedState.pausedRemainingMs).toBeGreaterThan(8_000);
    expect(await send(table.host, ClientCommand.GamePause, {})).toMatchObject({
      code: 'INVALID_STATE',
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    const resumed = gameState(table.host, (s) => s.status === 'PLAYING');
    await sendOk(table.host, ClientCommand.GameResume, {});
    const after = await resumed;
    const shift = (after.round?.phase?.endsAt ?? 0) - (before.round?.phase?.endsAt ?? 0);
    expect(shift).toBeGreaterThanOrEqual(550);
  });

  it('pauses automatically when the host disconnects, and the host resumes it', async () => {
    const { packId } = await createQuizPack(prisma, { count: 1, timeLimitMs: 10_000 });
    const table = await setTable(testApp, 1, sockets);
    const [player] = table.players as [Table['players'][0]];
    await startGame(table, packId);
    await answeringOpen(player.socket);

    const paused = gameState(player.socket, (s) => s.status === 'PAUSED');
    table.host.close();
    await paused;

    const host = await connect(testApp.url, table.hostToken);
    sockets.push(host);
    expect((await gameState(host, () => true)).status).toBe('PAUSED');
    const resumed = gameState(player.socket, (s) => s.status === 'PLAYING');
    await sendOk(host, ClientCommand.GameResume, {});
    await resumed;
  });

  it('survives a server restart: the game comes back paused and continues', async () => {
    const { packId, questions } = await createQuizPack(prisma, { count: 1, timeLimitMs: 30_000 });
    const first = await start();
    const table = await setTable(first, 1, sockets);
    await startGame(table, packId);
    const roundId = await answeringOpen(table.host);
    await first.app.close();
    extraApps.splice(extraApps.indexOf(first), 1);

    const second = await start();
    const host = await connect(second.url, table.hostToken);
    sockets.push(host);
    const restored = await gameState(host, () => true);
    expect(restored.status).toBe('PAUSED');
    expect(restored.pausedRemainingMs).toBeGreaterThan(20_000);

    const player = await connect(second.url, table.players[0]?.playerToken);
    sockets.push(player);
    await sendOk(host, ClientCommand.GameResume, {});
    await gameState(player, (s) => s.status === 'PLAYING');
    const result = gameState(host, (s) => s.status === 'ROUND_RESULT');
    expect((await answer(player, roundId, questions[0]?.correctOptionId ?? '')).ok).toBe(true);
    expect((await result).standings[0]?.delta).toBeGreaterThan(500);
  });

  it('applies the late-join setting', async () => {
    const { packId } = await createQuizPack(prisma, { count: 1, timeLimitMs: 10_000 });

    const closed = await setTable(testApp, 1, sockets);
    await startGame(closed, packId);
    const outsider = await connect(testApp.url);
    sockets.push(outsider);
    expect(
      await send(outsider, ClientCommand.RoomJoin, {
        roomCode: closed.roomCode,
        nickname: 'Geç',
        avatar: 'moon',
      }),
    ).toMatchObject({ code: 'GAME_IN_PROGRESS' });

    const open = await setTable(testApp, 1, sockets, { lateJoin: 'zeroPoints' });
    await startGame(open, packId);
    await answeringOpen(open.host);
    const late = await connect(testApp.url);
    sockets.push(late);
    const state = gameState(late, (s) => s.status === 'PLAYING');
    const joined = await sendOk(late, ClientCommand.RoomJoin, {
      roomCode: open.roomCode,
      nickname: 'Geç Gelen',
      avatar: 'moon',
    });
    expect((await state).standings.find((s) => s.playerId === joined.playerId)?.score).toBe(0);
    await testApp.app.get(SessionRecorder).flush();
    expect(await prisma.sessionPlayer.count({ where: { playerId: joined.playerId } })).toBe(1);
  });

  it('lets the host skip a question, end the game and play again', async () => {
    const { packId } = await createQuizPack(prisma, { count: 3 });
    const table = await setTable(testApp, 1, sockets);
    await startGame(table, packId);
    const firstRound = await answeringOpen(table.host);

    await sendOk(table.host, ClientCommand.GameSkip, {});
    const second = await gameState(table.host, (s) => s.status === 'PLAYING' && s.roundIndex === 1);
    expect(second.round?.roundId).not.toBe(firstRound);

    const finished = gameState(table.host, (s) => s.status === 'FINISHED');
    await sendOk(table.host, ClientCommand.GameEnd, {});
    await finished;

    const lobby = roomState(table.host, (s) => s.status === 'LOBBY');
    await sendOk(table.host, ClientCommand.GameRestart, {});
    expect((await lobby).players.every((p) => p.score === 0 && !p.ready)).toBe(true);
  });

  it('keeps disconnected players in a running game, and applies the grace period after it', async () => {
    const { packId } = await createQuizPack(prisma, { count: 1 });
    const app = await start({ env: { PLAYER_RECONNECT_GRACE_MS: '200' } });
    const table = await setTable(app, 2, sockets);
    const [, leaving] = table.players as [Table['players'][0], Table['players'][0]];
    await startGame(table, packId);
    await answeringOpen(table.host);

    leaving.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const finished = gameState(table.host, (s) => s.status === 'FINISHED');
    await sendOk(table.host, ClientCommand.GameEnd, {});
    const during = await finished;
    expect(during.standings.some((s) => s.playerId === leaving.playerId)).toBe(true);

    const left = nextEvent(table.host, ServerEvent.PlayerLeft);
    await sendOk(table.host, ClientCommand.GameRestart, {});
    expect(await left).toMatchObject({ playerId: leaving.playerId, reason: 'timeout' });
  });
});
