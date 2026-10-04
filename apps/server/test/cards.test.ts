import type { PistiHostView } from '@loudroom/game-pisti/server';
import type { UnoHostView, UnoPlayerView } from '@loudroom/game-uno/server';
import { ClientCommand, type GameState } from '@loudroom/shared';
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
  connect,
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

type Player = Table['players'][number];
type UnoTurn<T> = Extract<T, { phase: 'TURN' }>;

function playerOf(table: Table, playerId: string | undefined): Player {
  const player = table.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`no player ${String(playerId)}`);
  return player;
}

const unoView = (state: GameState) => state.round?.view as UnoTurn<UnoHostView> | undefined;

describe('card games through the engine', () => {
  let prisma: PrismaClient;
  let testApp: TestApp;
  const sockets: TestSocket[] = [];

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

  it('hands an away player’s turn to a bot and gives it back when they return', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'uno',
        contents: [{ title: 'Klasik UNO' }],
        settings: { botDelayMs: 3_000, turnMs: 60_000 },
      },
    ]);
    const table = await setTable(testApp, 3, sockets);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const first = await phaseOpen(table.host, 'TURN');
    const turnOf = (state: GameState) => playerOf(table, unoView(state)?.turn);
    const away = turnOf(first.state);

    // The player whose turn it is drops out: a bot's short pause starts at once.
    const botClock = gameState(table.host, (s) => unoView(s)?.bot === true);
    away.socket.close();
    const bot = await botClock;
    expect(bot.round?.phase).toMatchObject({ name: 'TURN', durationMs: 3_000 });

    // Back before the bot moves: the turn and its full time are theirs again.
    const mine = gameState(table.host, (s) => unoView(s)?.bot === false);
    const back = await connect(testApp.url, away.playerToken);
    sockets.push(back);
    const returned = await mine;
    expect(returned.round?.phase).toMatchObject({ durationMs: 60_000 });
    expect(unoView(returned)?.turn).toBe(away.playerId);

    // Gone again: the bot plays the turn and the next player is up.
    const moved = gameState(
      table.host,
      (s) => {
        const view = unoView(s);
        return (
          view !== undefined && view.turn !== away.playerId && view.last?.playerId === away.playerId
        );
      },
      10_000,
    );
    back.close();
    expect(unoView(await moved)?.last?.kind).toMatch(/^(play|draw)$/);
  }, 30_000);

  it('sends a hand only to its owner, and the draw pile to nobody', async () => {
    const { packId } = await createPack(prisma, [
      { gameType: 'uno', contents: [{ title: 'Klasik UNO' }], settings: { turnMs: 60_000 } },
    ]);
    const table = await setTable(testApp, 3, sockets);
    const records = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const open = await phaseOpen(table.host, 'TURN');
    const hands = await Promise.all(
      table.players.map(async (player) => {
        const state = await gameState(player.socket, (s) => s.round?.phase?.name === 'TURN');
        return (state.round?.view as UnoTurn<UnoPlayerView>).hand ?? [];
      }),
    );
    expect(hands.every((hand) => hand.length === 7 || hand.length === 9)).toBe(true);

    const everything = records.map((list) => list.map((e) => JSON.stringify(e.payload)).join('\n'));
    expect(everything.join('\n')).not.toContain('"deck"');
    // The host (index 0) sees no hand; each phone sees its own only.
    expect(everything[0]).not.toContain('"hand"');
    hands.forEach((hand, owner) => {
      for (const [index, text] of everything.entries()) {
        if (index === owner + 1) continue;
        for (const card of hand) expect(text).not.toContain(JSON.stringify(card));
      }
    });

    // A move out of turn is refused.
    const waiting = playerOf(
      table,
      table.players.find((p) => p.playerId !== unoView(open.state)?.turn)?.playerId,
    );
    expect(
      await send(waiting.socket, ClientCommand.RoundInput, {
        roundId: open.roundId,
        input: { type: 'draw' },
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  }, 30_000);

  it('plays Pişti cards from the phones and pauses the turn clock', async () => {
    const { packId } = await createPack(prisma, [
      { gameType: 'pisti', contents: [{ title: 'Pişti' }], settings: { turnMs: 30_000 } },
    ]);
    const table = await setTable(testApp, 2, sockets);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const open = await phaseOpen(table.host, 'TURN');
    const view = open.state.round?.view as Extract<PistiHostView, { phase: 'TURN' }>;
    const player = playerOf(table, view.turn);
    const own = await gameState(player.socket, (s) => s.round?.phase?.name === 'TURN');
    const card = (own.round?.view as { hand: { id: number }[] }).hand[0]?.id ?? 0;

    const played = gameState(table.host, (s) => {
      const next = s.round?.view as Extract<PistiHostView, { phase: 'TURN' }> | undefined;
      return next?.last?.card.id === card;
    });
    await sendOk(player.socket, ClientCommand.RoundInput, {
      roundId: open.roundId,
      input: { type: 'play', cardId: card },
    });
    expect((await played).round?.view).toMatchObject({
      turn: table.players.find((p) => p !== player)?.playerId,
    });

    const paused = gameState(table.host, (s) => s.status === 'PAUSED');
    await sendOk(table.host, ClientCommand.GamePause, {});
    expect((await paused).pausedRemainingMs).toBeGreaterThan(25_000);
    await sendOk(table.host, ClientCommand.GameResume, {});
  }, 30_000);
});
