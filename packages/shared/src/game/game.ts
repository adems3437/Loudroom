import { z } from 'zod';
import { playerIdSchema, roomStatusSchema } from '../room/room.js';

/** Statuses while a game exists (everything but LOBBY). */
export const gameStatusSchema = roomStatusSchema.exclude(['LOBBY']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

export const roundIdSchema = z.string().min(1).max(64);

/**
 * Leaderboard entry. Ranks are strict: equal scores are ordered by total answer time (faster
 * first, SPEC §7), then by join order.
 */
export const standingSchema = z.strictObject({
  playerId: playerIdSchema,
  score: z.number().int(),
  rank: z.number().int().positive(),
  /** Points from the last finished round. */
  delta: z.number().int(),
});
export type Standing = z.infer<typeof standingSchema>;

/** A timed phase; the client draws the countdown locally from `endsAt` (SPEC §3). */
export const phaseClockSchema = z.strictObject({
  name: z.string(),
  endsAt: z.number().nullable(),
  durationMs: z.number().int().nullable(),
});

const gameStateBase = {
  status: gameStatusSchema,
  /** -1 before the first round. */
  roundIndex: z.number().int().min(-1),
  roundCount: z.number().int().nonnegative(),
  /** The "get ready" countdown while STARTING. */
  countdown: phaseClockSchema.nullable(),
  round: z
    .strictObject({
      roundId: roundIdSchema,
      gameType: z.string(),
      phase: phaseClockSchema.nullable(),
      /** The game module's projection for this viewer; validated by the module's view schema. */
      view: z.unknown(),
    })
    .nullable(),
  /** Time left on the paused phase, while PAUSED. */
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
  standings: z.array(standingSchema),
};

export const gameStateSchema = z.discriminatedUnion('role', [
  z.strictObject({
    role: z.literal('host'),
    ...gameStateBase,
    /** Whether "next" moves on from here (result and scoreboard screens). */
    canAdvance: z.boolean(),
  }),
  z.strictObject({
    role: z.literal('player'),
    ...gameStateBase,
    /** This player's outcome of the last finished round. */
    lastRound: z
      .strictObject({ points: z.number().int(), correct: z.boolean().nullable() })
      .nullable(),
  }),
]);
export type GameState = z.infer<typeof gameStateSchema>;
export type HostGameState = Extract<GameState, { role: 'host' }>;
export type PlayerGameState = Extract<GameState, { role: 'player' }>;

// ── Commands ────────────────────────────────────────────────────────────────

export const gameStartRequestSchema = z.strictObject({ packId: z.uuid().optional() });
export const roundInputRequestSchema = z.strictObject({
  roundId: roundIdSchema,
  /** Validated by the current game module's input schema. */
  input: z.unknown(),
});

/** `round:hostInput`: the host screen's input to the current round (e.g. Tombala's draw). */
export const roundHostInputRequestSchema = z.strictObject({
  roundId: roundIdSchema,
  /** Validated by the current game module's host input schema. */
  input: z.unknown(),
});

/**
 * `round:stream` from a player: one chunk of high-frequency data (e.g. strokes). Not
 * acknowledged; the server checks it with the game's stream schema and drops what it refuses.
 */
export const roundStreamRequestSchema = z.strictObject({
  roundId: roundIdSchema,
  chunk: z.unknown(),
});
export type RoundStreamRequest = z.infer<typeof roundStreamRequestSchema>;

/** Most chunks one `round:stream` event may carry (a full history is sent at once). */
export const ROUND_STREAM_MAX_CHUNKS = 5_000;

// ── Events (notifications for effects; game:state is the source of truth) ──

/**
 * `round:stream` to a client: new chunks, or (`reset`) the round's whole history after a
 * (re)connect. `full`: the round's stream limit is reached; further chunks are dropped.
 */
export const roundStreamEventSchema = z.strictObject({
  roundId: roundIdSchema,
  reset: z.boolean(),
  chunks: z.array(z.unknown()).max(ROUND_STREAM_MAX_CHUNKS),
  full: z.boolean(),
});
export type RoundStreamEvent = z.infer<typeof roundStreamEventSchema>;

export const roundStartEventSchema = z.strictObject({
  roundId: roundIdSchema,
  roundIndex: z.number().int().nonnegative(),
  roundCount: z.number().int().positive(),
  gameType: z.string(),
});
export const roundPhaseEventSchema = z.strictObject({
  roundId: roundIdSchema,
  phase: phaseClockSchema,
});
export const roundResultEventSchema = z.strictObject({
  roundId: roundIdSchema,
  results: z.array(
    z.strictObject({
      playerId: playerIdSchema,
      points: z.number().int(),
      correct: z.boolean().nullable(),
    }),
  ),
});
export const scoreUpdateEventSchema = z.strictObject({ standings: z.array(standingSchema) });
export const gameEndEventSchema = z.strictObject({ standings: z.array(standingSchema) });
