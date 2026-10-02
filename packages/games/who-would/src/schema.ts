import { z } from 'zod';

export const WHO_WOULD_GAME_TYPE = 'whoWould';
/** Fewer players make the vote meaningless (SPEC §7.9). */
export const WHO_WOULD_MIN_PLAYERS = 3;

/** Content of one "Kim Yapar?" question (SPEC §7.9): only the statement; players are the options. */
export const whoWouldContentSchema = z.strictObject({
  question: z.string().trim().min(1).max(200),
  /** Given to the most voted player in the reveal, e.g. "Geç Kalma Şampiyonu". */
  title: z.string().trim().min(1).max(40).optional(),
});
export type WhoWouldContent = z.infer<typeof whoWouldContentSchema>;

export const whoWouldSettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  /** For voting for the most voted player (any of them on a tie). */
  baseScore: z.number().int().min(0).max(10_000),
  /** For being the most voted player. */
  winnerPoints: z.number().int().min(0).max(10_000),
  allowSelfVote: z.boolean(),
});
export type WhoWouldSettings = z.infer<typeof whoWouldSettingsSchema>;

export const WHO_WOULD_DEFAULT_SETTINGS: WhoWouldSettings = {
  introMs: 3_000,
  timeLimitMs: 20_000,
  baseScore: 1_000,
  winnerPoints: 0,
  allowSelfVote: true,
};

const playerIdSchema = z.string().min(1).max(64);

export const whoWouldInputSchema = z.strictObject({ playerId: playerIdSchema });
export type WhoWouldInput = z.infer<typeof whoWouldInputSchema>;

const distributionSchema = z.array(
  z.strictObject({ playerId: playerIdSchema, count: z.number().int().nonnegative() }),
);

const voting = {
  question: z.string(),
  /** Players connected when the round began, in join order. */
  candidates: z.array(playerIdSchema),
};
const hostCounts = {
  votedCount: z.number().int().nonnegative(),
  /** Connected players who can vote. */
  playerCount: z.number().int().nonnegative(),
};
const result = {
  title: z.string().nullable(),
  /** Votes per candidate, most first. Who voted for whom is never sent (SPEC §7.9). */
  distribution: distributionSchema,
  /** The most voted candidates; empty without votes. */
  winners: z.array(playerIdSchema),
};
const skipped = {
  phase: z.literal('SKIPPED'),
  question: z.string(),
  minPlayers: z.number().int().positive(),
};

export const whoWouldHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({ phase: z.literal('VOTING'), ...voting, ...hostCounts }),
  z.strictObject({ phase: z.literal('REVEAL'), ...voting, ...hostCounts, ...result }),
  /** Too few players when the round began: it ends without points. */
  z.strictObject(skipped),
]);
export type WhoWouldHostView = z.infer<typeof whoWouldHostViewSchema>;

export const whoWouldPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('VOTING'),
    ...voting,
    allowSelfVote: z.boolean(),
    /** This player's own vote; votes are final. */
    votedFor: playerIdSchema.nullable(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    question: z.string(),
    ...result,
    votedFor: playerIdSchema.nullable(),
    /** Voted for (one of) the most voted; null without a vote. */
    correct: z.boolean().nullable(),
  }),
  z.strictObject(skipped),
]);
export type WhoWouldPlayerView = z.infer<typeof whoWouldPlayerViewSchema>;
