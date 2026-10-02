import { z } from 'zod';

export const REACTION_GAME_TYPE = 'reaction';

/**
 * `classic`: tap when the target appears. `goNoGo`: some attempts show a decoy instead —
 * tapping it costs a penalty (SPEC §7.7).
 */
export const reactionVariantSchema = z.enum(['classic', 'goNoGo']);
export type ReactionVariant = z.infer<typeof reactionVariantSchema>;

export const reactionContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  variant: reactionVariantSchema,
});
export type ReactionContent = z.infer<typeof reactionContentSchema>;

export const reactionSettingsSchema = z
  .strictObject({
    introMs: z.number().int().min(0).max(15_000),
    /** Target attempts per player; the result is their median. */
    attempts: z.number().int().min(1).max(7),
    /** The wait before the target is random between these (seeded, never told to clients). */
    minWaitMs: z.number().int().min(500).max(10_000),
    maxWaitMs: z.number().int().min(1_000).max(15_000),
    /** Slower than this is a miss; early taps, misses and refused taps count as this. */
    maxReactionMs: z.number().int().min(500).max(5_000),
    /** Faster than this is not humanly possible: refused (SPEC §7.7). */
    minReactionMs: z.number().int().min(50).max(300),
    /** How long each attempt's results stay on screen. */
    resultMs: z.number().int().min(500).max(5_000),
    /** A median below this counts as "correct" (streaks). */
    goodMs: z.number().int().min(150).max(2_000),
    baseScore: z.number().int().min(0).max(10_000),
    rankStep: z.number().int().min(0).max(5_000),
    minScore: z.number().int().min(0).max(10_000),
    /** goNoGo: decoy attempts added, as a share of the target attempts. */
    decoyRate: z.number().min(0).max(1),
  })
  .refine((settings) => settings.maxWaitMs >= settings.minWaitMs, {
    path: ['maxWaitMs'],
    message: 'maxWaitMs must not be below minWaitMs',
  });
export type ReactionSettings = z.infer<typeof reactionSettingsSchema>;

export const REACTION_DEFAULT_SETTINGS: ReactionSettings = {
  introMs: 3_000,
  attempts: 3,
  minWaitMs: 1_500,
  maxWaitMs: 4_000,
  maxReactionMs: 1_500,
  minReactionMs: 100,
  resultMs: 1_500,
  goodMs: 450,
  baseScore: 1_000,
  rankStep: 150,
  minScore: 300,
  decoyRate: 0.34,
};

const attemptIndex = z.number().int().min(0).max(31);

/**
 * `shown`: the phone drew the target (sent at once). `tap`: the phone's own measurement
 * from that frame to the touch (`performance.now()` clock). `early`: tapped before it.
 */
export const reactionInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('shown'), attempt: attemptIndex }),
  z.strictObject({
    type: z.literal('tap'),
    attempt: attemptIndex,
    reactionMs: z.number().min(0).max(60_000),
  }),
  z.strictObject({ type: z.literal('early'), attempt: attemptIndex }),
]);
export type ReactionInput = z.infer<typeof reactionInputSchema>;

/**
 * What happened to a player in one attempt. `held`: a decoy correctly not tapped (not
 * scored); every other outcome but `ok` counts as the penalty time.
 */
export const outcomeSchema = z.enum(['ok', 'early', 'missed', 'invalid', 'decoyTap', 'held']);
export type Outcome = z.infer<typeof outcomeSchema>;

export const attemptKindSchema = z.enum(['target', 'decoy']);
export type AttemptKind = z.infer<typeof attemptKindSchema>;

const progress = {
  /** 0-based index of the attempt. */
  attempt: z.number().int().nonnegative(),
  total: z.number().int().positive(),
};
const resultSchema = z.strictObject({
  outcome: outcomeSchema,
  /** Measured time for `ok`. */
  ms: z.number().int().nullable(),
});
const rankingSchema = z.array(
  z.strictObject({
    playerId: z.string(),
    /** Null without a single valid tap. */
    medianMs: z.number().int().nullable(),
    bestMs: z.number().int().nullable(),
    penalties: z.number().int().nonnegative(),
  }),
);

/**
 * Host views. The TV is not the reference (its delay varies): it shows the state and the
 * results; the target itself is drawn on the phones. The wait before GO is never sent.
 */
export const reactionHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({
    phase: z.literal('INTRO'),
    title: z.string(),
    variant: reactionVariantSchema,
    total: z.number().int().positive(),
  }),
  z.strictObject({ phase: z.literal('ARMED'), ...progress }),
  z.strictObject({
    phase: z.literal('GO'),
    ...progress,
    kind: attemptKindSchema,
    doneCount: z.number().int().nonnegative(),
    playerCount: z.number().int().nonnegative(),
  }),
  z.strictObject({
    phase: z.literal('RESULT'),
    ...progress,
    kind: attemptKindSchema,
    /** Fastest first. */
    results: z.array(resultSchema.extend({ playerId: z.string() })),
  }),
  z.strictObject({ phase: z.literal('REVEAL'), ranking: rankingSchema }),
]);
export type ReactionHostView = z.infer<typeof reactionHostViewSchema>;

export const reactionPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({
    phase: z.literal('INTRO'),
    title: z.string(),
    variant: reactionVariantSchema,
  }),
  z.strictObject({
    phase: z.literal('ARMED'),
    ...progress,
    /** This player already tapped too early in this attempt. */
    early: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal('GO'),
    ...progress,
    kind: attemptKindSchema,
    /** This player's outcome once decided. */
    done: outcomeSchema.nullable(),
  }),
  z.strictObject({
    phase: z.literal('RESULT'),
    ...progress,
    kind: attemptKindSchema,
    ...resultSchema.shape,
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    medianMs: z.number().int().nullable(),
    rank: z.number().int().positive().nullable(),
    results: z.array(resultSchema.extend({ kind: attemptKindSchema })),
  }),
]);
export type ReactionPlayerView = z.infer<typeof reactionPlayerViewSchema>;
