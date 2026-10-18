import type { AmiralHostView } from '@loudroom/game-amiral-batti/server';
import type { KizmaHostView } from '@loudroom/game-kizma-birader/server';
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
import { resetRedis, sendOk, startTestApp, type TestApp, type TestSocket } from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

type Player = Table['players'][number];
type KizmaTurn = Extract<KizmaHostView, { phase: 'ROLL' | 'MOVE' }>;
type AmiralBattle = Extract<AmiralHostView, { phase: 'BATTLE' }>;

const kizma = (state: GameState) => state.round?.view as KizmaTurn | undefined;
const amiral = (state: GameState) => state.round?.view as AmiralBattle | undefined;

function playerOf(table: Table, playerId: string | null | undefined): Player {
  const player = table.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`no player ${String(playerId)}`);
  return player;
}

/** Mini fleets (6×6, ships of 3, 2, 2). */
const FLEETS = [
  [
    { x: 0, y: 0, vertical: false },
    { x: 0, y: 2, vertical: false },
    { x: 0, y: 4, vertical: false },
  ],
  [
    { x: 5, y: 0, vertical: true },
    { x: 3, y: 5, vertical: false },
    { x: 3, y: 3, vertical: false },
  ],
];

describe('board games through the engine', () => {
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

  it('rolls on the server, never tells the dice seed, and lets a bot play for an away player', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'kizmaBirader',
        contents: [{ title: 'Ludo' }],
        settings: { botDelayMs: 1_000 },
      },
    ]);
    const table = await setTable(testApp, 2, sockets);
    const records = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const open = await phaseOpen(table.host, 'ROLL');
    const first = playerOf(table, kizma(open.state)?.turn);

    const rolled = gameState(table.host, (s) => kizma(s)?.last?.kind !== undefined);
    await sendOk(first.socket, ClientCommand.RoundInput, {
      roundId: open.roundId,
      input: { type: 'roll' },
    });
    const last = kizma(await rolled)?.last;
    expect(last?.playerId).toBe(first.playerId);

    // After a first roll with every pawn in the yard the turn stays (a 6, or more tries):
    // the player drops out and a bot plays on for them.
    const away = first;
    const botRolled = gameState(
      table.host,
      (s) => kizma(s)?.last?.playerId === away.playerId && kizma(s)?.turn !== away.playerId,
      15_000,
    );
    away.socket.close();
    await botRolled;

    const sent = records
      .flat()
      .map((e) => JSON.stringify(e.payload))
      .join('\n');
    expect(sent).not.toMatch(/"seed"|"rolls"/);
  }, 30_000);

  it('sends each fleet only to its own side', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'amiralBatti',
        contents: [{ title: 'Amiral Battı' }],
        settings: { fleet: 'mini' },
      },
    ]);
    const table = await setTable(testApp, 2, sockets);
    const records = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const open = await phaseOpen(table.host, 'PLACE');
    // The last fleet starts the battle before its ack: listen first.
    const battleOpen = phaseOpen(table.host, 'BATTLE');
    for (const [i, player] of table.players.entries()) {
      await sendOk(player.socket, ClientCommand.RoundInput, {
        roundId: open.roundId,
        input: { type: 'place', ships: FLEETS[i] },
      });
    }
    const battle = await battleOpen;
    const shooter = playerOf(table, amiral(battle.state)?.duels[0]?.shooter);
    const shot = gameState(
      table.host,
      (s) =>
        (amiral(s)?.duels[0]?.b?.shotsTaken.length ?? 0) +
          (amiral(s)?.duels[0]?.a.shotsTaken.length ?? 0) ===
        1,
    );
    await sendOk(shooter.socket, ClientCommand.RoundInput, {
      roundId: battle.roundId,
      input: { type: 'shoot', x: 5, y: 0 },
    });
    await shot;

    const texts = records.map((list) => list.map((e) => JSON.stringify(e.payload)).join('\n'));
    expect(texts[0]).not.toContain('"fleet":[');
    for (const [i] of table.players.entries()) {
      const mine = JSON.stringify(FLEETS[i]);
      const theirs = JSON.stringify(FLEETS[1 - i]);
      expect(texts[i + 1]).toContain(mine);
      expect(texts[i + 1]).not.toContain(theirs);
    }
  }, 30_000);

  it('runs tournament duels side by side on one clock, which a pause stops', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'amiralBatti',
        contents: [{ title: 'Amiral Battı' }],
        settings: { fleet: 'mini', mode: 'tournament', shotMs: 30_000 },
      },
    ]);
    const table = await setTable(testApp, 4, sockets);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const open = await phaseOpen(table.host, 'PLACE');
    const battleOpen = phaseOpen(table.host, 'BATTLE');
    for (const player of table.players) {
      await sendOk(player.socket, ClientCommand.RoundInput, {
        roundId: open.roundId,
        input: { type: 'place', ships: FLEETS[0] },
      });
    }
    const battle = await battleOpen;
    const duels = amiral(battle.state)?.duels ?? [];
    expect(duels).toHaveLength(2);
    expect(duels.every((d) => d.waiting)).toBe(true);

    // One duel fires: the step waits for the other.
    const [first, second] = duels.map((d) => playerOf(table, d.shooter));
    if (!first || !second) throw new Error('two shooters expected');
    const half = gameState(
      table.host,
      (s) => amiral(s)?.duels.filter((d) => d.waiting).length === 1,
    );
    await sendOk(first.socket, ClientCommand.RoundInput, {
      roundId: battle.roundId,
      input: { type: 'shoot', x: 5, y: 5 },
    });
    await half;
    const both = gameState(
      table.host,
      (s) => amiral(s)?.duels.every((d) => d.waiting && d.turn === 'b') === true,
    );
    await sendOk(second.socket, ClientCommand.RoundInput, {
      roundId: battle.roundId,
      input: { type: 'shoot', x: 5, y: 5 },
    });
    await both;

    const paused = gameState(table.host, (s) => s.status === 'PAUSED');
    await sendOk(table.host, ClientCommand.GamePause, {});
    expect((await paused).pausedRemainingMs).toBeGreaterThan(25_000);
    await sendOk(table.host, ClientCommand.GameResume, {});
  }, 30_000);
});
