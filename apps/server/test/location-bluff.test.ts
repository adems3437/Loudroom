import { randomUUID } from 'node:crypto';
import type { BluffHostView } from '@loudroom/game-bluff/server';
import type { ImageLocationHostView } from '@loudroom/game-image-location/server';
import { mediaFileName } from '@loudroom/game-sdk';
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
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

const FAST = { game: { startingMs: 50, inputGraceMs: 250 } };

type Player = Table['players'][number];

describe('Image Location and Bluff through the engine', () => {
  let prisma: PrismaClient;
  let testApp: TestApp;
  const sockets: TestSocket[] = [];

  function input(player: Player, roundId: string, value: unknown) {
    return send(player.socket, ClientCommand.RoundInput, { roundId, input: value });
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

  it('plays a map question and a bluff: sizes from Media, moderation, secrecy, scores', async () => {
    const mediaId = randomUUID();
    await prisma.media.create({
      data: {
        id: mediaId,
        type: 'IMAGE',
        storagePath: mediaFileName(mediaId),
        mimeType: 'image/webp',
        sizeBytes: 1,
        width: 2000,
        height: 1000,
      },
    });
    const tag = randomUUID().slice(0, 6);
    const { packId } = await createPack(prisma, [
      {
        gameType: 'imageLocation',
        contents: [{ question: `Nerede ${tag}?`, mediaId, target: { x: 0.4321, y: 0.5 } }],
      },
      {
        gameType: 'bluff',
        contents: [
          {
            question: `Bir ahtapotun kaç kalbi vardır? ${tag}`,
            answer: 'Üç',
            acceptedAnswers: ['3'],
            decoys: ['Bir', 'İki', 'Dört'],
          },
          {
            question: `Bir zürafanın boynunda kaç omur vardır? ${tag}`,
            answer: 'Yedi',
            decoys: ['On iki', 'Yirmi', 'Otuz'],
          },
        ],
      },
    ]);
    const table = await setTable(testApp, 3, sockets);
    const [ayse, mehmet, zeynep] = table.players as [Player, Player, Player];
    const records = [table.host, ...table.players.map((p) => p.socket)].map(recordAll);
    const sent = () =>
      records
        .flat()
        .map((entry) => JSON.stringify(entry.payload))
        .join('\n');
    await sendOk(table.host, ClientCommand.GameStart, { packId });

    // ── Image Location: the image size comes from the Media row ──
    const location = await phaseOpen(table.host, 'ANSWERING');
    expect(location.state.round?.view).toMatchObject({
      image: { mediaId, width: 2000, height: 1000 },
    });
    expect(await input(ayse, location.roundId, { point: { x: 2, y: 0 } })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect((await input(ayse, location.roundId, { point: { x: 0.4421, y: 0.5 } })).ok).toBe(true);
    expect((await input(mehmet, location.roundId, { point: { x: 0.9, y: 0.9 } })).ok).toBe(true);
    expect(sent()).not.toMatch(/0\.4321|"target"/);
    const locationResult = gameState(table.host, (s) => s.status === 'ROUND_RESULT');
    expect((await input(zeynep, location.roundId, { point: { x: 0.5, y: 0.5 } })).ok).toBe(true);
    const shown = await locationResult;
    const view = shown.round?.view as Extract<ImageLocationHostView, { phase: 'REVEAL' }>;
    expect(view.target).toEqual({ x: 0.4321, y: 0.5 });
    expect(view.pins[0]).toMatchObject({ playerId: ayse.playerId, inside: true });
    expect(deltas(shown).get(ayse.playerId)).toBe(1000);
    expect(deltas(shown).get(mehmet.playerId)).toBe(0);

    const scoreboard = gameState(table.host, (s) => s.status === 'SCOREBOARD');
    await sendOk(table.host, ClientCommand.GameNext, {});
    await scoreboard;
    await sendOk(table.host, ClientCommand.GameNext, {});

    // ── Bluff ──
    const write = await phaseOpen(table.host, 'WRITE');
    const lie = (player: Player, text: string) =>
      input(player, write.roundId, { type: 'lie', text });
    expect(await lie(ayse, 'ÜÇ!')).toMatchObject({ ok: false, code: 'TOO_CLOSE' });
    expect(await lie(ayse, '3')).toMatchObject({ ok: false, code: 'TOO_CLOSE' });
    // The server's own blocked-word lists check lies too.
    expect(await lie(ayse, 'Siktir')).toMatchObject({ ok: false, code: 'TEXT_REJECTED' });
    expect((await lie(ayse, 'Yedi')).ok).toBe(true);
    expect(await lie(ayse, 'Dokuz')).toMatchObject({ ok: false, code: 'ALREADY_ANSWERED' });
    expect((await lie(mehmet, 'Sekiz')).ok).toBe(true);
    const votingOpen = phaseOpen(table.host, 'VOTE');
    expect((await lie(zeynep, 'sekiz')).ok).toBe(true);
    const voting = await votingOpen;
    const options = (voting.state.round?.view as Extract<BluffHostView, { phase: 'VOTE' }>).options;
    expect(options.map((option) => option.text).sort()).toEqual(
      expect.arrayContaining(['SEKİZ', 'YEDİ', 'ÜÇ']),
    );
    expect(options).toHaveLength(4);
    const id = (text: string) => options.find((option) => option.text === text)?.id ?? '';

    const vote = (player: Player, text: string) =>
      input(player, voting.roundId, { type: 'vote', optionId: id(text) });
    expect(await vote(mehmet, 'SEKİZ')).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect((await vote(ayse, 'ÜÇ')).ok).toBe(true);
    expect((await vote(mehmet, 'YEDİ')).ok).toBe(true);
    // Before the reveal nobody learns which option is real or who wrote what.
    expect(sent()).not.toMatch(/truth|authors|voters|fooled/);

    const reveal = phaseOpen(table.host, 'REVEAL');
    const result = gameState(table.host, (s) => s.status === 'ROUND_RESULT', 20_000);
    expect((await vote(zeynep, 'YEDİ')).ok).toBe(true);
    const revealing = await reveal;
    expect(revealing.state.round?.view).toMatchObject({ phase: 'REVEAL', done: false });
    // The scores come once the staged reveal has run its clock.
    const scored = await result;
    expect(scored.round?.view).toMatchObject({ done: true });
    expect([ayse, mehmet, zeynep].map((player) => deltas(scored).get(player.playerId))).toEqual([
      1000 + 2 * 500,
      0,
      0,
    ]);
  }, 40_000);
});
