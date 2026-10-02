import { randomUUID } from 'node:crypto';
import type { ClosestNumberHostView } from '@loudroom/game-closest-number/server';
import type { SortingHostView } from '@loudroom/game-sorting/server';
import type { WhoWouldHostView } from '@loudroom/game-who-would/server';
import { ClientCommand, type GameState } from '@loudroom/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  createPack,
  gameState,
  phaseOpen,
  recordAll,
  roomState,
  setTable,
  testPrisma,
  type Table,
} from './game-support.js';
import {
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

type Player = Table['players'][number];
type Recorded = ReturnType<typeof recordAll>;

describe('closest number, sorting and "Kim Yapar?" through the engine', () => {
  let prisma: PrismaClient;
  let testApp: TestApp;
  const sockets: TestSocket[] = [];

  function input(player: Player, roundId: string, value: unknown) {
    return send(player.socket, ClientCommand.RoundInput, { roundId, input: value });
  }

  /** Listens for the result before the last input ends the round. */
  async function lastInput(table: Table, player: Player, roundId: string, value: unknown) {
    const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
    expect((await input(player, roundId, value)).ok).toBe(true);
    return result;
  }

  async function next(table: Table, status: GameState['status']) {
    const reached = gameState(table.host, (s) => s.status === status);
    await sendOk(table.host, ClientCommand.GameNext, {});
    return reached;
  }

  function sent(...records: Recorded[]): string {
    return records
      .flat()
      .map((entry) => JSON.stringify(entry.payload))
      .join('\n');
  }

  function deltas(state: GameState): Map<string, number> {
    return new Map(state.standings.map((standing) => [standing.playerId, standing.delta]));
  }

  beforeAll(async () => {
    prisma = testPrisma();
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
    await prisma.$disconnect();
  });

  it('plays a mixed pack: secrets stay on the server, bad input is refused, streaks carry over', async () => {
    const tag = randomUUID().slice(0, 8);
    const items = [1, 2, 3, 4].map((n) => ({ id: `item-${tag}-${n}`, text: `Öğe ${n}` }));
    const ids = items.map((item) => item.id);
    const quizRight = `right-${tag}`;
    const { packId } = await createPack(prisma, [
      {
        gameType: 'closestNumber',
        contents: [{ question: 'Kaç?', answer: 7_654_321, displayFormat: 'number' }],
      },
      { gameType: 'sorting', contents: [{ question: 'Sırala', items }] },
      {
        gameType: 'quiz',
        contents: [
          {
            question: 'Hangisi?',
            options: [
              { id: `wrong-${tag}`, text: 'Yanlış' },
              { id: quizRight, text: 'Doğru' },
            ],
            correctOptionId: quizRight,
          },
        ],
        // Only the streak bonus counts, so the carried streak is all that shows.
        settings: { baseScore: 0 },
      },
    ]);
    const table = await setTable(testApp, 3, sockets);
    const [ayse, mehmet, zeynep] = table.players as [Player, Player, Player];
    const records = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    // ── Closest Number ──
    const closest = await phaseOpen(table.host, 'ANSWERING');
    expect(await input(ayse, closest.roundId, { value: 'çok' })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect((await input(ayse, closest.roundId, { value: 7_654_000 })).ok).toBe(true);
    expect(await input(ayse, closest.roundId, { value: 1 })).toMatchObject({
      ok: false,
      code: 'ALREADY_ANSWERED',
    });
    expect((await input(mehmet, closest.roundId, { value: 1 })).ok).toBe(true);
    expect(sent(...records)).not.toMatch(/7654321|"answer"/);
    const closestResult = await lastInput(table, zeynep, closest.roundId, { value: 8_000_000 });
    const closestView = closestResult.round?.view as ClosestNumberHostView;
    expect(closestView).toMatchObject({ phase: 'REVEAL', answer: 7_654_321 });
    expect(closestView.phase === 'REVEAL' && closestView.guesses[0]?.playerId).toBe(ayse.playerId);
    expect(deltas(closestResult).get(ayse.playerId)).toBeGreaterThan(990);
    expect(deltas(closestResult).get(mehmet.playerId)).toBe(0);

    // The last question of a game is followed by the scoreboard.
    await next(table, 'SCOREBOARD');
    const sortingRecords = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    await sendOk(table.host, ClientCommand.GameNext, {});

    // ── Sorting ──
    const sorting = await phaseOpen(table.host, 'ANSWERING');
    const shown = sorting.state.round?.view as Extract<SortingHostView, { phase: 'ANSWERING' }>;
    expect(shown.items.map((item) => item.id).sort()).toEqual([...ids].sort());
    for (const order of [
      [ids[0], ids[0], ids[1], ids[2]],
      [...ids.slice(0, 3), 'x'],
      ids.slice(1),
    ]) {
      expect(await input(mehmet, sorting.roundId, { order })).toMatchObject({
        ok: false,
        code: 'INVALID_INPUT',
      });
    }
    expect((await input(ayse, sorting.roundId, { order: ids })).ok).toBe(true);
    expect((await input(mehmet, sorting.roundId, { order: [...ids].reverse() })).ok).toBe(true);
    expect(sent(...sortingRecords)).not.toContain('correctOrder');
    const sortingResult = await lastInput(table, zeynep, sorting.roundId, {
      order: [ids[1], ids[0], ids[2], ids[3]],
    });
    expect(sortingResult.round?.view).toMatchObject({ phase: 'REVEAL', perfectCount: 1 });
    expect(
      [ayse, mehmet, zeynep].map((player) => deltas(sortingResult).get(player.playerId)),
    ).toEqual([1000, 0, 500]);

    await next(table, 'SCOREBOARD');
    await sendOk(table.host, ClientCommand.GameNext, {});

    // ── Quiz: Ayşe was right in both earlier games, so this is her third in a row ──
    const quiz = await phaseOpen(table.host, 'ANSWERING');
    expect((await input(ayse, quiz.roundId, { optionId: quizRight })).ok).toBe(true);
    expect((await input(mehmet, quiz.roundId, { optionId: quizRight })).ok).toBe(true);
    const quizResult = await lastInput(table, zeynep, quiz.roundId, { optionId: `wrong-${tag}` });
    expect(deltas(quizResult).get(ayse.playerId)).toBe(100);
    expect(deltas(quizResult).get(mehmet.playerId)).toBe(0);

    const finished = await next(table, 'FINISHED');
    expect(finished.standings[0]?.playerId).toBe(ayse.playerId);
  });

  it('runs "Kim Yapar?": anonymous votes, majority points, too few players skips the round', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'whoWould',
        contents: [
          { question: 'Kim en çok geç kalır?', title: 'Geç Kalma Şampiyonu' },
          { question: 'Kim en çok güler?' },
        ],
        settings: { winnerPoints: 100, allowSelfVote: false },
      },
    ]);

    // At least three players are needed to start.
    const pair = await setTable(testApp, 2, sockets);
    expect(await send(pair.host, ClientCommand.GameStart, { packId })).toMatchObject({
      ok: false,
      code: 'NOT_ENOUGH_PLAYERS',
    });

    const table = await setTable(testApp, 4, sockets);
    const [p1, p2, p3, p4] = table.players as [Player, Player, Player, Player];
    const hostEvents = recordAll(table.host);
    const phoneEvents = table.players.map((player) => recordAll(player.socket));
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    const voting = await phaseOpen(table.host, 'VOTING');
    expect(voting.state.round?.view).toMatchObject({
      candidates: table.players.map((player) => player.playerId),
    });
    expect(await input(p1, voting.roundId, { playerId: randomUUID() })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(await input(p1, voting.roundId, { playerId: p1.playerId })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect((await input(p1, voting.roundId, { playerId: p2.playerId })).ok).toBe(true);
    expect((await input(p2, voting.roundId, { playerId: p3.playerId })).ok).toBe(true);
    expect((await input(p3, voting.roundId, { playerId: p2.playerId })).ok).toBe(true);
    const phoneResult = gameState(p4.socket, (s) => s.status === 'ROUND_RESULT');
    const result = await lastInput(table, p4, voting.roundId, { playerId: p1.playerId });

    const view = result.round?.view as Extract<WhoWouldHostView, { phase: 'REVEAL' }>;
    expect(view).toMatchObject({
      phase: 'REVEAL',
      title: 'Geç Kalma Şampiyonu',
      winners: [p2.playerId],
      votedCount: 4,
    });
    expect(view.distribution.find((entry) => entry.playerId === p2.playerId)?.count).toBe(2);
    expect([p1, p2, p3, p4].map((player) => deltas(result).get(player.playerId))).toEqual([
      1000, 100, 1000, 0,
    ]);
    expect(await phoneResult).toMatchObject({ lastRound: { points: 0, correct: false } });

    // Who voted for whom never leaves the server — not to the host, not to other phones.
    expect(sent(hostEvents)).not.toMatch(/votedFor|"votes"/);
    const ownVotes = [p2, p3, p2, p1].map((target) => target.playerId);
    phoneEvents.forEach((events, index) => {
      const votedFor = new Set(
        [...sent(events).matchAll(/"votedFor":"([^"]+)"/g)].map((match) => match[1]),
      );
      expect([...votedFor]).toEqual([ownVotes[index]]);
    });

    // Two players drop out: the next question has too few and ends without points.
    for (const player of [p3, p4]) {
      const gone = roomState(table.host, (state) =>
        state.players.some((other) => other.id === player.playerId && !other.connected),
      );
      player.socket.close();
      await gone;
    }
    const skipped = gameState(
      table.host,
      (s) =>
        s.status === 'ROUND_RESULT' && (s.round?.view as { phase?: string }).phase === 'SKIPPED',
    );
    await sendOk(table.host, ClientCommand.GameNext, {});
    expect((await skipped).round?.view).toMatchObject({ minPlayers: 3 });
    expect((await skipped).standings.every((standing) => standing.delta === 0)).toBe(true);
  });
});
