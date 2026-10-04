import { randomUUID } from 'node:crypto';
import { QUIZ_GAME_TYPE } from '@loudroom/game-quiz/server';
import {
  ClientCommand,
  ServerEvent,
  type GameState,
  type HostRoomState,
  type ServerEventPayload,
} from '@loudroom/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Socket } from 'socket.io-client';
import { inject } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { findGameModule } from '../src/game/registry.js';
import { connect, nextEvent, sendOk, type TestApp, type TestSocket } from './support.js';

export function testPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: inject('databaseUrl') }) });
}

export interface TestQuestion {
  id: string;
  correctOptionId: string;
  wrongOptionId: string;
}

/**
 * A quiz pack with `count` questions. Option ids are unique per test run, so a leaked correct
 * answer could not be mistaken for anything else.
 */
export async function createQuizPack(
  prisma: PrismaClient,
  options: { count: number; introMs?: number; timeLimitMs?: number; showScoreboardAfter?: boolean },
): Promise<{ packId: string; questions: TestQuestion[] }> {
  const tag = randomUUID().slice(0, 8);
  const questions: TestQuestion[] = [];
  for (let i = 0; i < options.count; i++) {
    const id = randomUUID();
    const correctOptionId = `right-${tag}-${i}`;
    const wrongOptionId = `wrong-${tag}-${i}`;
    await prisma.contentItem.create({
      data: {
        id,
        gameType: QUIZ_GAME_TYPE,
        status: 'PUBLISHED',
        data: {
          question: `Test sorusu ${i + 1}`,
          options: [
            { id: wrongOptionId, text: 'Yanlış' },
            { id: correctOptionId, text: 'Doğru' },
          ],
          correctOptionId,
        },
      },
    });
    questions.push({ id, correctOptionId, wrongOptionId });
  }
  const pack = await prisma.gamePack.create({
    data: {
      name: `Test ${tag}`,
      status: 'PUBLISHED',
      settings: { [QUIZ_GAME_TYPE]: { introMs: options.introMs ?? 50 } },
      rounds: {
        create: {
          order: 1,
          gameType: QUIZ_GAME_TYPE,
          contentSelection: { mode: 'fixed', contentIds: questions.map((question) => question.id) },
          questionCount: options.count,
          timeLimitMs: options.timeLimitMs ?? 3_000,
          showScoreboardAfter: options.showScoreboardAfter ?? true,
        },
      },
    },
  });
  return { packId: pack.id, questions };
}

export interface PackSegment {
  gameType: string;
  /** Content items of the round, played in this order. */
  contents: unknown[];
  /** Round settings (changes to the game's defaults). */
  settings?: Record<string, unknown>;
  timeLimitMs?: number;
}

function hasIntro(gameType: string): boolean {
  const defaults = findGameModule(gameType)?.defaultSettings as object | undefined;
  return defaults !== undefined && 'introMs' in defaults;
}

/** A published pack with one round per segment, each a fixed list of new content. */
export async function createPack(
  prisma: PrismaClient,
  segments: PackSegment[],
): Promise<{ packId: string; contentIds: string[][] }> {
  const contentIds: string[][] = [];
  for (const segment of segments) {
    const ids: string[] = [];
    for (const data of segment.contents) {
      const item = await prisma.contentItem.create({
        data: { gameType: segment.gameType, status: 'PUBLISHED', data: data as object },
      });
      ids.push(item.id);
    }
    contentIds.push(ids);
  }
  const pack = await prisma.gamePack.create({
    data: {
      name: `Karışık ${randomUUID().slice(0, 8)}`,
      status: 'PUBLISHED',
      rounds: {
        create: segments.map((segment, index) => ({
          order: index + 1,
          gameType: segment.gameType,
          contentSelection: { mode: 'fixed', contentIds: contentIds[index] ?? [] },
          questionCount: segment.contents.length,
          timeLimitMs: segment.timeLimitMs ?? 3_000,
          showScoreboardAfter: false,
          // Short intros keep tests fast; games without an intro have no such setting.
          settings: {
            ...(hasIntro(segment.gameType) ? { introMs: 50 } : {}),
            ...segment.settings,
          },
        })),
      },
    },
  });
  return { packId: pack.id, contentIds };
}

export interface Table {
  host: TestSocket;
  hostToken: string;
  roomCode: string;
  players: { socket: TestSocket; playerId: string; playerToken: string; nickname: string }[];
}

/** A room with a host and `count` joined players. */
export async function setTable(
  testApp: TestApp,
  count: number,
  sockets: TestSocket[],
  settings: { lateJoin?: 'closed' | 'zeroPoints' } = {},
): Promise<Table> {
  const host = await connect(testApp.url);
  sockets.push(host);
  const created = await sendOk(host, ClientCommand.RoomCreate, {
    settings: { maxPlayers: 12, ...settings },
  });
  const players = [];
  for (let i = 0; i < count; i++) {
    const socket = await connect(testApp.url);
    sockets.push(socket);
    const nickname = `Oyuncu ${i + 1}`;
    const joined = await sendOk(socket, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname,
      avatar: 'star',
    });
    players.push({ socket, playerId: joined.playerId, playerToken: joined.playerToken, nickname });
  }
  return { host, hostToken: created.hostToken, roomCode: created.roomCode, players };
}

export function gameState(
  socket: TestSocket,
  match: (state: GameState) => boolean,
  timeoutMs = 8_000,
): Promise<GameState> {
  return nextEvent(socket, ServerEvent.GameState, match, timeoutMs);
}

/** Waits until answering is open; returns the round id and that state. */
export async function answering(
  socket: TestSocket,
): Promise<{ roundId: string; state: GameState }> {
  const state = await gameState(
    socket,
    (s) => s.status === 'PLAYING' && s.round?.phase?.name === 'ANSWERING',
  );
  if (!state.round) throw new Error('no round');
  return { roundId: state.round.roundId, state };
}

/** Waits until the round enters the named phase; returns the round id and that state. */
export async function phaseOpen(
  socket: TestSocket,
  phase: string,
): Promise<{ roundId: string; state: GameState }> {
  const state = await gameState(
    socket,
    (s) => s.status === 'PLAYING' && s.round?.phase?.name === phase,
  );
  if (!state.round) throw new Error('no round');
  return { roundId: state.round.roundId, state };
}

export async function answeringOpen(socket: TestSocket): Promise<string> {
  return (await answering(socket)).roundId;
}

export function roomState(
  socket: TestSocket,
  match: (state: HostRoomState) => boolean,
): Promise<ServerEventPayload<typeof ServerEvent.RoomState>> {
  return nextEvent(socket, ServerEvent.RoomState, (state) => match(state as HostRoomState));
}

/** Records every event a socket receives, in order. */
export function recordAll(socket: TestSocket): { event: string; payload: unknown }[] {
  const received: { event: string; payload: unknown }[] = [];
  (socket as unknown as Socket).onAny((event: string, payload: unknown) => {
    received.push({ event, payload });
  });
  return received;
}
