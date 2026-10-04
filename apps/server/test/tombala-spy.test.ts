import type { SpyPlayerView } from '@loudroom/game-spy/server';
import type { TombalaHostView, TombalaPlayerView } from '@loudroom/game-tombala/server';
import { ClientCommand } from '@loudroom/shared';
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
type Drawing<T> = Extract<T, { phase: 'DRAW' }>;

/** Numbers drawn so far, from any Tombala view (the intro has none). */
const drawnCount = (view: unknown) =>
  (view as { drawn?: number[] } | undefined)?.drawn?.length ?? 0;

function playerOf(table: Table, playerId: string | undefined): Player {
  const player = table.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`no player ${String(playerId)}`);
  return player;
}

const places = [
  'Hastane',
  'Okul',
  'Havalimanı',
  'Restoran',
  'Sinema',
  'Plaj',
  'Market',
  'Banka',
].map((name, index) => ({ id: `l${index + 1}`, name }));

describe('host inputs, Tombala and "Casus Kim?" through the engine', () => {
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

  it('takes host inputs from the host only, checked by the game, and refuses games without', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'tombala',
        contents: [{ title: 'Klasik Tombala' }],
        settings: { drawMode: 'manual' },
      },
      {
        gameType: 'closestNumber',
        contents: [{ question: 'Kaç?', answer: 42, displayFormat: 'number' }],
      },
    ]);
    const table = await setTable(testApp, 2, sockets);
    const [ayse] = table.players as [Player, Player];
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    // The intro ends with the first number; then the host draws.
    const first = await phaseOpen(table.host, 'DRAW');
    expect(first.state.round?.phase).toMatchObject({ durationMs: null });
    const hostInput = (socket: TestSocket, roundId: string, value: unknown) =>
      send(socket, ClientCommand.RoundHostInput, { roundId, input: value });

    expect(await hostInput(ayse.socket, first.roundId, { type: 'draw' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await hostInput(table.host, first.roundId, { type: 'shuffle' })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(
      await hostInput(table.host, '00000000-0000-4000-8000-000000000000', { type: 'draw' }),
    ).toMatchObject({ ok: false, code: 'STALE_ROUND' });

    const second = gameState(table.host, (s) => drawnCount(s.round?.view) === 2);
    expect(await hostInput(table.host, first.roundId, { type: 'draw' })).toEqual({
      ok: true,
      data: {},
    });
    await second;

    // A wrong call is taken, and locks the caller.
    const locked = gameState(
      ayse.socket,
      (s) => (s.round?.view as Drawing<TombalaPlayerView>).lockedDraws === 3,
    );
    expect(await input(ayse, first.roundId, { type: 'claim' })).toEqual({ ok: true, data: {} });
    await locked;
    expect(await input(ayse, first.roundId, { type: 'claim' })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });

    // The host ends the Tombala round; the next game takes no host input.
    const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
    await sendOk(table.host, ClientCommand.GameSkip, {});
    await result;
    // Result, then the scoreboard of the pack's Tombala part, then the next game.
    const scoreboard = gameState(table.host, (s) => s.status === 'SCOREBOARD');
    await sendOk(table.host, ClientCommand.GameNext, {});
    await scoreboard;
    await sendOk(table.host, ClientCommand.GameNext, {});
    const next = await phaseOpen(table.host, 'ANSWERING');
    expect(await hostInput(table.host, next.roundId, { type: 'draw' })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
  }, 30_000);

  it('draws on its own clock, which a pause stops', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'tombala',
        contents: [{ title: 'Klasik Tombala' }],
        settings: { drawIntervalMs: 3_000 },
      },
    ]);
    const table = await setTable(testApp, 2, sockets);
    await sendOk(table.host, ClientCommand.GameStart, { packId });
    const first = await phaseOpen(table.host, 'DRAW');
    expect(first.state.round?.phase).toMatchObject({ durationMs: 3_000 });

    const paused = gameState(table.host, (s) => s.status === 'PAUSED');
    await sendOk(table.host, ClientCommand.GamePause, {});
    expect((await paused).pausedRemainingMs).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 3_500));
    const stillOne = gameState(table.host, () => true);
    await sendOk(table.host, ClientCommand.GameResume, {});
    expect(((await stillOne).round?.view as Drawing<TombalaHostView>).drawn).toHaveLength(1);
    const second = await gameState(table.host, (s) => drawnCount(s.round?.view) === 2);
    expect(second.status).toBe('PLAYING');
  }, 30_000);

  it('keeps the place from the spy and the TV, and the spy from everyone, until the reveal', async () => {
    const { packId } = await createPack(prisma, [
      {
        gameType: 'spy',
        contents: [{ title: 'Şehir', locations: places }],
        settings: { discussionMs: 60_000, voteMs: 10_000 },
      },
    ]);
    const table = await setTable(testApp, 4, sockets);
    const hostRecords = recordAll(table.host);
    const phoneRecords = table.players.map((player) => recordAll(player.socket));
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    const talk = await phaseOpen(table.host, 'DISCUSS');
    const views = await Promise.all(
      table.players.map(async (player) => {
        const state = await gameState(player.socket, (s) => s.round?.phase?.name === 'DISCUSS');
        return state.round?.view as Extract<SpyPlayerView, { phase: 'DISCUSS' }>;
      }),
    );
    const spyIndex = views.findIndex((view) => view.role?.spy === true);
    expect(spyIndex).toBeGreaterThanOrEqual(0);
    const spy = playerOf(table, table.players[spyIndex]?.playerId);
    const place = views.find((view) => view.role?.spy === false)?.role;
    if (!place || place.spy) throw new Error('no place');

    // The asker names who they ask; the turn moves on.
    const asker = playerOf(table, views[0]?.asker);
    const asked = playerOf(table, table.players.find((p) => p !== asker)?.playerId);
    expect(await input(asker, talk.roundId, { type: 'ask', playerId: asked.playerId })).toEqual({
      ok: true,
      data: {},
    });

    const beforeReveal = (records: { payload: unknown }[]) =>
      records.map((entry) => JSON.stringify(entry.payload)).join('\n');
    const tvText = beforeReveal(hostRecords);
    expect(tvText).not.toContain('"location"');
    expect(tvText).not.toContain('"spies"');
    expect(tvText).not.toContain('"spy":true');
    phoneRecords.forEach((records, index) => {
      const text = beforeReveal(records);
      expect(text).not.toContain('"spies"');
      if (index === spyIndex) expect(text).not.toContain('"location"');
      else expect(text).not.toContain('"spy":true');
    });

    // The spy names the place and wins.
    const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
    expect(
      await input(spy, talk.roundId, { type: 'guess', locationId: place.location.id }),
    ).toEqual({ ok: true, data: {} });
    const shown = await result;
    expect(shown.round?.view).toMatchObject({ outcome: 'guessed', spies: [spy.playerId] });
    const delta = new Map(shown.standings.map((s) => [s.playerId, s.delta]));
    expect(table.players.map((p) => delta.get(p.playerId))).toEqual(
      table.players.map((p) => (p === spy ? 1_500 : 0)),
    );
  }, 30_000);
});
