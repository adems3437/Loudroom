import type { MemoryHostView, MemoryPlayerView } from '@loudroom/game-memory/server';
import type { ReactionHostView } from '@loudroom/game-reaction/server';
import { ClientCommand, ServerEvent } from '@loudroom/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

type Player = Table['players'][number];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Reaction and Memory through the engine', () => {
  let prisma: PrismaClient;
  let testApp: TestApp;
  const sockets: TestSocket[] = [];

  function input(player: Player, roundId: string, value: unknown) {
    return send(player.socket, ClientCommand.RoundInput, { roundId, input: value });
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

  it('keeps the wait before GO secret and checks taps against their real arrival', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'reaction',
        contents: [{ title: 'Klasik', variant: 'classic' }],
        settings: { attempts: 2, minWaitMs: 600, maxWaitMs: 1_000, resultMs: 500 },
      },
    ]);
    const table = await setTable(testApp, 3, sockets);
    const [ayse, mehmet, zeynep] = table.players as [Player, Player, Player];
    const records = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    const armed = await phaseOpen(table.host, 'ARMED');
    // The clients learn that it is ARMED, never when it ends.
    expect(armed.state.round?.phase).toEqual({ name: 'ARMED', durationMs: null, endsAt: null });
    expect(await input(zeynep, armed.roundId, { type: 'early', attempt: 0 })).toEqual({
      ok: true,
      data: {},
    });

    const go = await phaseOpen(table.host, 'GO');
    expect((await input(ayse, go.roundId, { type: 'shown', attempt: 0 })).ok).toBe(true);
    await sleep(250);
    const result = gameState(table.host, (s) => s.round?.phase?.name === 'RESULT');
    expect((await input(ayse, go.roundId, { type: 'tap', attempt: 0, reactionMs: 250 })).ok).toBe(
      true,
    );
    // A tap without "shown" is taken but counts as invalid.
    expect((await input(mehmet, go.roundId, { type: 'tap', attempt: 0, reactionMs: 150 })).ok).toBe(
      true,
    );
    const first = (await result).round?.view as Extract<ReactionHostView, { phase: 'RESULT' }>;
    expect(Object.fromEntries(first.results.map((r) => [r.playerId, [r.outcome, r.ms]]))).toEqual({
      [ayse.playerId]: ['ok', 250],
      [mehmet.playerId]: ['invalid', null],
      [zeynep.playerId]: ['early', null],
    });

    // Paused while ARMED: the remaining wait is not shown either.
    await phaseOpen(table.host, 'ARMED');
    const paused = gameState(table.host, (s) => s.status === 'PAUSED');
    await sendOk(table.host, ClientCommand.GamePause, {});
    expect((await paused).pausedRemainingMs).toBeNull();
    await sendOk(table.host, ClientCommand.GameResume, {});

    const go2 = await phaseOpen(table.host, 'GO');
    for (const player of [ayse, mehmet, zeynep]) {
      expect((await input(player, go2.roundId, { type: 'shown', attempt: 1 })).ok).toBe(true);
    }
    await sleep(300);
    const reveal = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
    for (const [player, ms] of [
      [ayse, 300],
      [mehmet, 320],
      [zeynep, 340],
    ] as const) {
      await input(player, go2.roundId, { type: 'tap', attempt: 1, reactionMs: ms });
    }
    const shown = await reveal;
    const ranking = (shown.round?.view as Extract<ReactionHostView, { phase: 'REVEAL' }>).ranking;
    // Ayşe: [250, 300] → 275; Mehmet: [1500, 320] → 910; Zeynep: [1500, 340] → 920.
    expect(ranking.map((entry) => [entry.playerId, entry.medianMs])).toEqual([
      [ayse.playerId, 275],
      [mehmet.playerId, 910],
      [zeynep.playerId, 920],
    ]);
    const delta = new Map(shown.standings.map((s) => [s.playerId, s.delta]));
    expect([ayse, mehmet, zeynep].map((p) => delta.get(p.playerId))).toEqual([1000, 850, 700]);

    // No ARMED end time ever left the server.
    const sent = records.flat().filter((entry) => {
      const text = JSON.stringify(entry.payload);
      return text.includes('"name":"ARMED"') && !text.includes('"endsAt":null');
    });
    expect(sent).toEqual([]);
    expect(
      records
        .flat()
        .filter((e) => e.event === ServerEvent.RoundPhase)
        .map((e) => e.payload as { phase: { name: string; endsAt: number | null } })
        .filter((p) => p.phase.name === 'ARMED')
        .every((p) => p.phase.endsAt === null),
    ).toBe(true);
  }, 30_000);

  it('shows the board on the TV only and keeps the answers on the server until the reveal', async () => {
    const items = ['Elma', 'Armut', 'Muz', 'Kiraz', 'Üzüm', 'Karpuz', 'Çilek', 'Limon', 'Ayva'].map(
      (label, index) => ({ id: `i${index}`, label, emoji: '🍎' }),
    );
    const { packId } = await createPack(prisma, [
      {
        gameType: 'memory',
        contents: [{ title: 'Meyveler', items }],
        settings: { showMs: 2_000 },
        timeLimitMs: 10_000,
      },
    ]);
    const table = await setTable(testApp, 2, sockets);
    const [ayse, mehmet] = table.players as [Player, Player];
    const phoneRecords = table.players.map((p) => recordAll(p.socket));
    const hostRecords = recordAll(table.host);
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    const show = await phaseOpen(table.host, 'SHOW');
    expect(
      (show.state.round?.view as Extract<MemoryHostView, { phase: 'SHOW' }>).board,
    ).toHaveLength(9);
    const questions = await phaseOpen(table.host, 'QUESTIONS');
    const phoneState = await gameState(ayse.socket, (s) => s.round?.phase?.name === 'QUESTIONS');
    const view = phoneState.round?.view as Extract<MemoryPlayerView, { phase: 'QUESTIONS' }>;
    expect(view.questions).toHaveLength(3);

    // Ayşe answers o1 everywhere, Mehmet o2.
    for (let q = 0; q < 3; q++) {
      expect((await input(ayse, questions.roundId, { question: q, optionId: 'o1' })).ok).toBe(true);
    }
    expect(await input(ayse, questions.roundId, { question: 0, optionId: 'o2' })).toMatchObject({
      ok: false,
      code: 'ALREADY_ANSWERED',
    });
    for (let q = 0; q < 2; q++) {
      await input(mehmet, questions.roundId, { question: q, optionId: 'o2' });
    }
    expect(
      phoneRecords
        .flat()
        .map((e) => JSON.stringify(e.payload))
        .join('\n'),
    ).not.toMatch(/correctOptionId|"board"/);
    const hostBefore = hostRecords.map((e) => JSON.stringify(e.payload)).join('\n');
    expect(hostBefore).not.toContain('correctOptionId');

    const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
    await input(mehmet, questions.roundId, { question: 2, optionId: 'o2' });
    const revealed = (await result).round?.view as Extract<MemoryHostView, { phase: 'REVEAL' }>;
    const right = revealed.questions.map((q) => q.correctOptionId);
    const points = (picks: string[]) => picks.filter((pick, q) => pick === right[q]).length * 400;
    const delta = new Map((await result).standings.map((s) => [s.playerId, s.delta]));
    expect(delta.get(ayse.playerId)).toBe(points(['o1', 'o1', 'o1']));
    expect(delta.get(mehmet.playerId)).toBe(points(['o2', 'o2', 'o2']));
  }, 30_000);
});
