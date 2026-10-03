import { gameStatusSchema } from '@loudroom/shared';
import { z } from 'zod';

/** One round of the game as planned at start; content is a snapshot, so play needs no DB. */
const plannedRoundSchema = z.object({
  roundId: z.string(),
  /** Index of the pack round ("segment") this question belongs to. */
  segmentIndex: z.number().int().nonnegative(),
  gameType: z.string(),
  contentItemId: z.string().nullable(),
  content: z.unknown(),
  settings: z.unknown(),
  scoreMultiplier: z.number(),
  showScoreboardAfter: z.boolean(),
  lastInSegment: z.boolean(),
  seed: z.number().int(),
  /**
   * The media the content refers to (from Media), for modules that need sizes or video lengths.
   * Games stored before videos existed only have sizes: they were images.
   */
  media: z
    .record(
      z.string(),
      z.object({
        type: z.enum(['image', 'video']).default('image'),
        format: z.enum(['webp', 'mp4', 'webm']).default('webp'),
        width: z.number().int(),
        height: z.number().int(),
        durationMs: z.number().int().nullable().default(null),
      }),
    )
    .optional(),
});
export type PlannedRound = z.infer<typeof plannedRoundSchema>;

const clockSchema = z.object({
  name: z.string(),
  /** Kept on the server only: clients get the phase without its end. */
  hidden: z.boolean().optional(),
  durationMs: z.number().int().nullable(),
  endsAt: z.number().nullable(),
});

const playerStatsSchema = z.object({
  score: z.number().int(),
  streak: z.number().int(),
  correctCount: z.number().int(),
  totalAnswerMs: z.number(),
});

/** Engine state of a running game, stored in `room:{code}:game` (SPEC §11). */
export const gameRecordSchema = z.object({
  sessionId: z.string(),
  packId: z.string(),
  packName: z.string(),
  rounds: z.array(plannedRoundSchema),
  /** -1 until the first round starts. */
  roundIndex: z.number().int(),
  moduleState: z.unknown(),
  /** The module's current phase (round clock). */
  phase: clockSchema.nullable(),
  /** The "get ready" countdown while STARTING. */
  countdown: clockSchema.nullable(),
  /** The one pending timer; stale timers carry another token and are ignored. */
  timer: z.object({ token: z.string(), firesAt: z.number() }).nullable(),
  paused: z
    .object({ resumeStatus: gameStatusSchema, remainingMs: z.number().int().nullable() })
    .nullable(),
  stats: z.record(z.string(), playerStatsSchema),
  lastResults: z.array(
    z.object({ playerId: z.string(), points: z.number().int(), correct: z.boolean().nullable() }),
  ),
  roundStartedAt: z.number().nullable(),
  startedAt: z.number(),
});
export type GameRecord = z.infer<typeof gameRecordSchema>;
export type PlayerStatsRecord = z.infer<typeof playerStatsSchema>;
