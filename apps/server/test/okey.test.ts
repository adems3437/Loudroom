import type { OkeyHostView, OkeyPlayerView } from '@loudroom/game-okey/server';
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
} from './game-support.js';
import {
  connect,
  resetRedis,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

const playerView = (state: GameState) => state.round?.view as OkeyPlayerView | undefined;
const hostView = (state: GameState) => state.round?.view as OkeyHostView | undefined;
const rackOf = (state: GameState) => {
  const view = playerView(state);
  return view?.phase === 'TURN' || view?.phase === 'TALLY' ? view.rack : null;
};

describe('okey through the engine', () => {
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

  it('deals after the TV’s setup, keeps racks with their owners and lets bots finish', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'okey',
        contents: [{ title: 'Okey' }],
        settings: { botDelayMs: 500, turnMs: 60_000, tallyMs: 2_000 },
      },
    ]);
    const table = await setTable(testApp, 2, sockets);
    const [first, second] = table.players;
    if (!first || !second) throw new Error('two players expected');
    const records = [table.host, first.socket, second.socket].map(recordAll);
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    // The TV picks one hand from 10 points: two bots join the two players.
    const setup = await phaseOpen(table.host, 'SETUP');
    expect(hostView(setup.state)).toMatchObject({ phase: 'SETUP' });
    const dealt = gameState(first.socket, (s) => rackOf(s) !== null);
    await sendOk(table.host, ClientCommand.RoundHostInput, {
      roundId: setup.roundId,
      input: { type: 'start', hands: 1, startPoints: 10, teams: false },
    });
    const rack = rackOf(await dealt) ?? [];
    expect(rack.filter((id) => id !== null).length).toBeGreaterThanOrEqual(14);

    // The player lays out the rack; it comes back after a reconnect (paused, so no bot moves).
    const layout = [...rack].reverse();
    await sendOk(first.socket, ClientCommand.RoundInput, {
      roundId: setup.roundId,
      input: { type: 'arrange', slots: layout },
    });
    await sendOk(table.host, ClientCommand.GamePause, {});
    first.socket.close();
    const back = await connect(testApp.url, first.playerToken);
    sockets.push(back);
    const resumed = gameState(back, (s) => s.status === 'PLAYING' && rackOf(s) !== null);
    await sendOk(table.host, ClientCommand.GameResume, {});
    expect(rackOf(await resumed)).toEqual(layout);

    // Everyone leaves: bots play every seat until the hand ends, then the match.
    const ended = gameState(table.host, (s) => hostView(s)?.phase === 'END', 90_000);
    back.close();
    second.socket.close();
    const end = hostView(await ended);
    expect(end?.phase === 'END' && end.ranking).toHaveLength(4);

    // No rack reached the TV or another player; the middle and the seed reached nobody.
    const texts = records.map((list) => list.map((e) => JSON.stringify(e.payload)).join('\n'));
    expect(texts[0]).not.toContain('"rack"');
    expect(texts[2]).not.toContain(JSON.stringify(layout));
    for (const text of texts) expect(text).not.toMatch(/"racks"|"deck":\[|"seed"/);
  }, 120_000);
});
