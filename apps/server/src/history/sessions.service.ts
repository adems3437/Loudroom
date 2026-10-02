import { Injectable } from '@nestjs/common';
import type { SessionDetail, SessionListQuery, SessionSummary } from '@loudroom/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { notFound } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const packNameSchema = z.object({ name: z.string() });

/** The pack's name as it was when the game started (from the snapshot). */
function packName(snapshot: unknown): string {
  return packNameSchema.safeParse(snapshot).data?.name ?? '—';
}

const summaryInclude = {
  players: { select: { nickname: true, finalRank: true } },
  _count: { select: { rounds: true, players: true } },
} satisfies Prisma.GameSessionInclude;

type SummaryRow = Prisma.GameSessionGetPayload<{ include: typeof summaryInclude }>;

function toSummary(row: SummaryRow): SessionSummary {
  return {
    id: row.id,
    roomCode: row.roomCode,
    packName: packName(row.packSnapshot),
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    playerCount: row._count.players,
    roundCount: row._count.rounds,
    winner: row.players.find((player) => player.finalRank === 1)?.nickname ?? null,
  };
}

/** Played games for the admin panel (SPEC §15 Phase 9: session history). */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SessionListQuery) {
    const where: Prisma.GameSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { roomCode: { contains: query.q } },
              { gamePack: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.gameSession.count({ where }),
      this.prisma.gameSession.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<SessionDetail> {
    const row = await this.prisma.gameSession.findUnique({
      where: { id },
      include: {
        ...summaryInclude,
        players: { orderBy: [{ finalRank: 'asc' }, { joinedAt: 'asc' }] },
        rounds: {
          orderBy: { roundIndex: 'asc' },
          include: { answers: true, scoreEvents: true },
        },
      },
    });
    if (!row) throw notFound('Session');
    return {
      ...toSummary(row),
      players: row.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        color: player.color,
        finalScore: player.finalScore,
        finalRank: player.finalRank,
      })),
      rounds: row.rounds.map((round) => ({
        index: round.roundIndex,
        gameType: round.gameType,
        contentItemId: round.contentItemId,
        content: round.contentSnapshot,
        startedAt: round.startedAt.toISOString(),
        endedAt: round.endedAt?.toISOString() ?? null,
        results: row.players.map((player) => {
          const answer = round.answers.find((a) => a.sessionPlayerId === player.id);
          const points = round.scoreEvents
            .filter((event) => event.sessionPlayerId === player.id)
            .reduce((sum, event) => sum + event.points, 0);
          return {
            playerId: player.id,
            answer: answer?.input ?? null,
            correct: answer?.isCorrect ?? null,
            responseTimeMs: answer?.responseTimeMs ?? null,
            points,
          };
        }),
      })),
    };
  }

  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.gameSession.deleteMany({ where: { id } });
    if (count === 0) throw notFound('Session');
  }
}
