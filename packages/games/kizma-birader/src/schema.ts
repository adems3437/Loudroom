import { z } from 'zod';

export const KIZMA_GAME_TYPE = 'kizmaBirader';
export const KIZMA_MIN_PLAYERS = 2;
/** Goal squares per player (the lane into the middle). */
export const GOAL_SIZE = 4;

/** Content of a Kızma Birader match: only its name; the rules are round settings. */
export const kizmaContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
});
export type KizmaContent = z.infer<typeof kizmaContentSchema>;

export const kizmaSettingsSchema = z.strictObject({
  /** 4: 40 squares, up to 4 players; 6: 48 squares, up to 6 (SPEC §7.15). */
  board: z.union([z.literal(4), z.literal(6)]),
  pawns: z.number().int().min(1).max(4),
  /** Play the only possible move without asking. */
  autoMove: z.boolean(),
  rollMs: z.number().int().min(5_000).max(60_000),
  moveMs: z.number().int().min(5_000).max(60_000),
  /** After this the match ends at the next turn: ranked by progress. */
  matchMs: z.number().int().min(120_000).max(3_600_000),
  bots: z.boolean(),
  botDelayMs: z.number().int().min(500).max(5_000),
  firstPoints: z.number().int().min(0).max(10_000),
  secondPoints: z.number().int().min(0).max(10_000),
  thirdPoints: z.number().int().min(0).max(10_000),
  otherPoints: z.number().int().min(0).max(10_000),
});
export type KizmaSettings = z.infer<typeof kizmaSettingsSchema>;

export const KIZMA_DEFAULT_SETTINGS: KizmaSettings = {
  board: 4,
  pawns: 4,
  autoMove: true,
  rollMs: 15_000,
  moveMs: 15_000,
  matchMs: 1_200_000,
  bots: true,
  botDelayMs: 1_500,
  firstPoints: 1_000,
  secondPoints: 600,
  thirdPoints: 400,
  otherPoints: 200,
};

export const kizmaInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('roll') }),
  /** Moves one of the player's pawns (by index) the rolled number of squares. */
  z.strictObject({ type: z.literal('move'), pawn: z.number().int().min(0).max(3) }),
]);
export type KizmaInput = z.infer<typeof kizmaInputSchema>;

const playerIdSchema = z.string().min(1).max(64);

/**
 * A pawn's progress from its owner's start: -1 in the yard, 0…track−1 on the track, track…
 * track+3 in the goal lane.
 */
const progressSchema = z.number().int().min(-1);

export const kizmaEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('roll'), playerId: playerIdSchema, value: z.number().int() }),
  z.strictObject({
    kind: z.literal('move'),
    playerId: playerIdSchema,
    pawn: z.number().int(),
    from: progressSchema,
    to: progressSchema,
    /** The pawn sent back to its yard by this move. */
    captured: z.strictObject({ playerId: playerIdSchema, pawn: z.number().int() }).nullable(),
  }),
  /** No move was possible with the roll. */
  z.strictObject({ kind: z.literal('pass'), playerId: playerIdSchema, value: z.number().int() }),
]);
export type KizmaEvent = z.infer<typeof kizmaEventSchema>;

const boardSchema = z.strictObject({
  slots: z.union([z.literal(4), z.literal(6)]),
  /** Squares on the track. */
  track: z.number().int().positive(),
  players: z.array(
    z.strictObject({
      playerId: playerIdSchema,
      /** Where on the board the player sits (their start is slot × spacing). */
      slot: z.number().int().nonnegative(),
      pawns: z.array(progressSchema),
      /** 1 for the first to finish; null while playing. */
      place: z.number().int().positive().nullable(),
    }),
  ),
});

const table = {
  title: z.string(),
  board: boardSchema,
  turn: playerIdSchema,
  /** The die on the table; null before this turn's roll. */
  die: z.number().int().min(1).max(6).nullable(),
  /** Pawns that may move with the die (by index). */
  movable: z.array(z.number().int()),
  /** Rolls left this turn when only a 6 can bring a pawn out. */
  triesLeft: z.number().int().nonnegative(),
  bot: z.boolean(),
  last: kizmaEventSchema.nullable(),
};
const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};
const ended = {
  title: z.string(),
  board: boardSchema,
  endedBy: z.enum(['finished', 'time']),
  ranking: z.array(
    z.strictObject({
      playerId: playerIdSchema,
      home: z.number().int().nonnegative(),
      progress: z.number().int(),
    }),
  ),
};

export const kizmaHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('ROLL'), ...table }),
  z.strictObject({ phase: z.literal('MOVE'), ...table }),
  z.strictObject({ phase: z.literal('END'), ...ended }),
  z.strictObject(skipped),
]);
export type KizmaHostView = z.infer<typeof kizmaHostViewSchema>;

const mine = {
  /** False for a spectator. */
  seated: z.boolean(),
};

export const kizmaPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('ROLL'), ...table, ...mine }),
  z.strictObject({ phase: z.literal('MOVE'), ...table, ...mine }),
  z.strictObject({ phase: z.literal('END'), ...ended, ...mine }),
  z.strictObject(skipped),
]);
export type KizmaPlayerView = z.infer<typeof kizmaPlayerViewSchema>;
