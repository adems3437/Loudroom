import { Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import type { ScoreResult } from '@loudroom/game-sdk';
import { KeyedMutex } from '../common/keyed-mutex.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { StoredPlayer } from '../room/room.store.js';

const logger = new Logger('SessionRecorder');

type RecordedPlayer = Pick<StoredPlayer, 'id' | 'nickname' | 'avatar' | 'color'>;

function json(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

/**
 * Writes game history to PostgreSQL (GameSession and friends). Live play never waits for it:
 * writes for one session run in order in the background, and a failure is logged, not fatal.
 */
@Injectable()
export class SessionRecorder implements BeforeApplicationShutdown {
  private readonly queue = new KeyedMutex();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  startSession(input: {
    sessionId: string;
    roomCode: string;
    packId: string;
    packSnapshot: unknown;
    startedAt: number;
    players: RecordedPlayer[];
  }): void {
    this.enqueue(input.sessionId, 'start session', async () => {
      await this.prisma.gameSession.create({
        data: {
          id: input.sessionId,
          roomCode: input.roomCode,
          gamePackId: input.packId,
          packSnapshot: json(input.packSnapshot),
          startedAt: new Date(input.startedAt),
          players: { create: input.players.map(sessionPlayer) },
        },
      });
    });
  }

  addPlayer(sessionId: string, player: RecordedPlayer): void {
    this.enqueue(sessionId, 'add player', async () => {
      await this.prisma.sessionPlayer.upsert({
        where: { sessionId_playerId: { sessionId, playerId: player.id } },
        create: { sessionId, ...sessionPlayer(player) },
        update: {},
      });
    });
  }

  recordRound(input: {
    sessionId: string;
    roundIndex: number;
    gameType: string;
    contentItemId: string | null;
    content: unknown;
    startedAt: number;
    endedAt: number;
    results: ScoreResult[];
  }): void {
    this.enqueue(input.sessionId, 'record round', async () => {
      const sessionPlayers = await this.prisma.sessionPlayer.findMany({
        where: { sessionId: input.sessionId },
        select: { id: true, playerId: true },
      });
      const idOf = new Map(sessionPlayers.map((player) => [player.playerId, player.id]));
      // Results of players the session knows, paired with their SessionPlayer id.
      const rows = input.results.flatMap((result) => {
        const sessionPlayerId = idOf.get(result.playerId);
        return sessionPlayerId ? [{ result, sessionPlayerId }] : [];
      });

      await this.prisma.sessionRound.create({
        data: {
          sessionId: input.sessionId,
          roundIndex: input.roundIndex,
          gameType: input.gameType,
          contentItemId: input.contentItemId,
          contentSnapshot: json(input.content),
          startedAt: new Date(input.startedAt),
          endedAt: new Date(input.endedAt),
          answers: {
            create: rows
              .filter(({ result }) => result.answer !== null)
              .map(({ result, sessionPlayerId }) => ({
                sessionPlayerId,
                input: json(result.answer),
                isCorrect: result.correct,
                responseTimeMs: result.responseTimeMs,
              })),
          },
          scoreEvents: {
            create: rows.map(({ result, sessionPlayerId }) => ({
              sessionPlayerId,
              points: result.points,
              reason: 'round',
              breakdown: json(result.breakdown),
            })),
          },
        },
      });
    });
  }

  finishSession(input: {
    sessionId: string;
    endedAt: number;
    standings: { playerId: string; score: number; rank: number }[];
  }): void {
    this.enqueue(input.sessionId, 'finish session', async () => {
      await this.prisma.$transaction([
        this.prisma.gameSession.update({
          where: { id: input.sessionId },
          data: { status: 'FINISHED', endedAt: new Date(input.endedAt) },
        }),
        ...input.standings.map((standing) =>
          this.prisma.sessionPlayer.updateMany({
            where: { sessionId: input.sessionId, playerId: standing.playerId },
            data: { finalScore: standing.score, finalRank: standing.rank },
          }),
        ),
      ]);
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /** Resolves once every queued write has finished (used by tests and shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  private enqueue(sessionId: string, what: string, write: () => Promise<void>): void {
    const run = this.queue
      .run(sessionId, write)
      .catch((error: unknown) => {
        logger.error(`${what} failed for session ${sessionId}: ${String(error)}`);
      })
      .finally(() => {
        this.pending.delete(run);
      });
    this.pending.add(run);
  }
}

function sessionPlayer(player: RecordedPlayer) {
  return {
    playerId: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    color: player.color,
  };
}
