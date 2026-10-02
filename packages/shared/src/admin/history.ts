import { z } from 'zod';
import { paginationQuerySchema } from './api.js';

export const sessionStatusSchema = z.enum(['ACTIVE', 'FINISHED', 'ABORTED']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const sessionListQuerySchema = paginationQuerySchema.extend({
  status: sessionStatusSchema.optional(),
  /** Room code or pack name. */
  q: z.string().trim().min(1).max(80).optional(),
});
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

export const sessionSummarySchema = z.strictObject({
  id: z.uuid(),
  roomCode: z.string(),
  packName: z.string(),
  status: sessionStatusSchema,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  playerCount: z.number().int().nonnegative(),
  roundCount: z.number().int().nonnegative(),
  /** Nickname of the player ranked first, once finished. */
  winner: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionDetailSchema = sessionSummarySchema.extend({
  players: z.array(
    z.strictObject({
      id: z.uuid(),
      nickname: z.string(),
      avatar: z.string(),
      color: z.string(),
      finalScore: z.number().int(),
      finalRank: z.number().int().nullable(),
    }),
  ),
  rounds: z.array(
    z.strictObject({
      index: z.number().int().nonnegative(),
      gameType: z.string(),
      contentItemId: z.uuid().nullable(),
      /** The content as it was played. */
      content: z.unknown(),
      startedAt: z.iso.datetime(),
      endedAt: z.iso.datetime().nullable(),
      results: z.array(
        z.strictObject({
          /** SessionPlayer id. */
          playerId: z.uuid(),
          answer: z.unknown(),
          correct: z.boolean().nullable(),
          responseTimeMs: z.number().int().nullable(),
          points: z.number().int(),
        }),
      ),
    }),
  ),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/** Activity over the last `days` days (admin overview). */
export const adminStatsSchema = z.strictObject({
  days: z.number().int().positive(),
  sessions: z.number().int().nonnegative(),
  finishedSessions: z.number().int().nonnegative(),
  /** Seats taken, summed over sessions. */
  players: z.number().int().nonnegative(),
  rounds: z.number().int().nonnegative(),
  /** Every day of the period, oldest first (UTC dates). */
  perDay: z.array(z.strictObject({ date: z.string(), sessions: z.number().int() })),
  packs: z.array(
    z.strictObject({ packId: z.uuid().nullable(), name: z.string(), sessions: z.number().int() }),
  ),
  games: z.array(z.strictObject({ gameType: z.string(), rounds: z.number().int() })),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

/** How a content item has played: rounds, answers, share of right answers, answer time. */
export const contentStatSchema = z.strictObject({
  contentItemId: z.uuid(),
  gameType: z.string(),
  /** The item's current content (for its one-line summary). */
  data: z.unknown(),
  rounds: z.number().int().nonnegative(),
  answers: z.number().int().nonnegative(),
  /** 0..1 over answers that can be right or wrong; null when none can. */
  correctRate: z.number().min(0).max(1).nullable(),
  avgResponseMs: z.number().int().nullable(),
});
export type ContentStat = z.infer<typeof contentStatSchema>;

export const contentStatsQuerySchema = z.object({
  /** Comma-separated ids (a content list page). */
  ids: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : []))
    .pipe(z.array(z.uuid()).max(100)),
});

export const topContentQuerySchema = z.object({
  order: z.enum(['hardest', 'mostPlayed']).default('hardest'),
  gameType: z.string().min(1).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /** Items answered fewer times are left out of "hardest". */
  minAnswers: z.coerce.number().int().min(1).max(1_000).default(3),
});
