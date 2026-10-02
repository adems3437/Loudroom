import { Injectable } from '@nestjs/common';
import type { AdminStats, ContentStat } from '@loudroom/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface ContentRow {
  id: string;
  rounds: number;
  answers: number;
  judged: number;
  correct: number;
  avgMs: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Statistics from game history (SPEC §15 Phase 9): activity over a period and how each
 * content item plays. Plain aggregate queries over the history tables.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days: number, now = new Date()): Promise<AdminStats> {
    const since = new Date(now.getTime() - days * DAY_MS);
    const where = { startedAt: { gte: since } } satisfies Prisma.GameSessionWhereInput;
    const [sessions, finishedSessions, players, rounds, perDay, packs, games] = await Promise.all([
      this.prisma.gameSession.count({ where }),
      this.prisma.gameSession.count({ where: { ...where, status: 'FINISHED' } }),
      this.prisma.sessionPlayer.count({ where: { session: where } }),
      this.prisma.sessionRound.count({ where: { session: where } }),
      // One row per day of the period (UTC), days without games included.
      this.prisma.$queryRaw<{ date: string; sessions: number }[]>(Prisma.sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COUNT(s.id)::int AS sessions
        FROM generate_series(
               date_trunc('day', ${now}::timestamp) - ${days - 1} * interval '1 day',
               date_trunc('day', ${now}::timestamp),
               interval '1 day') AS d(day)
        LEFT JOIN "GameSession" s
          ON date_trunc('day', s."startedAt") = d.day AND s."startedAt" >= ${since}
        GROUP BY d.day ORDER BY d.day`),
      this.prisma.$queryRaw<{ packId: string | null; name: string; sessions: number }[]>(
        Prisma.sql`
        SELECT "gamePackId" AS "packId",
               COALESCE("packSnapshot"->>'name', '—') AS name,
               COUNT(*)::int AS sessions
        FROM "GameSession" WHERE "startedAt" >= ${since}
        GROUP BY 1, 2 ORDER BY sessions DESC, name LIMIT 10`,
      ),
      this.prisma.$queryRaw<{ gameType: string; rounds: number }[]>(Prisma.sql`
        SELECT r."gameType" AS "gameType", COUNT(*)::int AS rounds
        FROM "SessionRound" r JOIN "GameSession" s ON s.id = r."sessionId"
        WHERE s."startedAt" >= ${since}
        GROUP BY 1 ORDER BY rounds DESC, 1`),
    ]);
    return { days, sessions, finishedSessions, players, rounds, perDay, packs, games };
  }

  /** Stats of the given content items (a content list page). */
  async content(ids: readonly string[]): Promise<ContentStat[]> {
    if (ids.length === 0) return [];
    const rows = await this.contentRows(
      Prisma.sql`r."contentItemId" = ANY(${[...ids]}::uuid[])`,
      Prisma.empty,
      ids.length,
    );
    return this.withContent(rows);
  }

  /** The hardest (lowest share of right answers) or most played content. */
  async top(options: {
    order: 'hardest' | 'mostPlayed';
    gameType?: string | undefined;
    limit: number;
    minAnswers: number;
  }): Promise<ContentStat[]> {
    const filter = options.gameType
      ? Prisma.sql`r."contentItemId" IS NOT NULL AND r."gameType" = ${options.gameType}`
      : Prisma.sql`r."contentItemId" IS NOT NULL`;
    const having =
      options.order === 'hardest'
        ? Prisma.sql`HAVING COUNT(a."isCorrect") >= ${options.minAnswers}`
        : Prisma.empty;
    const order =
      options.order === 'hardest'
        ? Prisma.sql`ORDER BY SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::float / COUNT(a."isCorrect"), COUNT(a.id) DESC`
        : Prisma.sql`ORDER BY COUNT(DISTINCT r.id) DESC, COUNT(a.id) DESC`;
    const rows = await this.contentRows(filter, Prisma.sql`${having} ${order}`, options.limit);
    return this.withContent(rows);
  }

  private contentRows(filter: Prisma.Sql, tail: Prisma.Sql, limit: number) {
    return this.prisma.$queryRaw<ContentRow[]>(Prisma.sql`
      SELECT r."contentItemId" AS id,
             COUNT(DISTINCT r.id)::int AS rounds,
             COUNT(a.id)::int AS answers,
             COUNT(a."isCorrect")::int AS judged,
             SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::int AS correct,
             AVG(a."responseTimeMs")::float AS "avgMs"
      FROM "SessionRound" r LEFT JOIN "PlayerAnswer" a ON a."sessionRoundId" = r.id
      WHERE ${filter}
      GROUP BY r."contentItemId"
      ${tail}
      LIMIT ${limit}`);
  }

  /** Adds each item's game type and current data, keeping the query's order. */
  private async withContent(rows: ContentRow[]): Promise<ContentStat[]> {
    const items = await this.prisma.contentItem.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: { id: true, gameType: true, data: true },
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    return rows.flatMap((row) => {
      const item = byId.get(row.id);
      if (!item) return [];
      return [
        {
          contentItemId: row.id,
          gameType: item.gameType,
          data: item.data,
          rounds: row.rounds,
          answers: row.answers,
          correctRate: row.judged > 0 ? row.correct / row.judged : null,
          avgResponseMs: row.avgMs === null ? null : Math.round(row.avgMs),
        },
      ];
    });
  }
}
