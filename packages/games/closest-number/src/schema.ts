import { z } from 'zod';

export const CLOSEST_NUMBER_GAME_TYPE = 'closestNumber';

/** Largest answer or guess accepted (a trillion, either sign). */
export const MAX_ABS_VALUE = 1e12;
const valueSchema = z.number().min(-MAX_ABS_VALUE).max(MAX_ABS_VALUE);

/** How the number is written: grouped (1.234.567) or as a year (1923, no separators). */
export const displayFormatSchema = z.enum(['number', 'year']);
export type DisplayFormat = z.infer<typeof displayFormatSchema>;

/** Content of one question (SPEC §6, §7.2). A year is a whole number. */
export const closestNumberContentSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(300),
    answer: valueSchema,
    /** Written after the number, e.g. "m" or "km²". */
    unit: z.string().trim().min(1).max(24).optional(),
    displayFormat: displayFormatSchema,
  })
  .superRefine((content, ctx) => {
    if (content.displayFormat === 'year' && !Number.isInteger(content.answer)) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'A year is a whole number' });
    }
  });
export type ClosestNumberContent = z.infer<typeof closestNumberContentSchema>;

/**
 * `relative`: points fall with the guess's relative error on a log curve, reaching 0 at
 * `maxRelativeError` (years: at `maxYearError` years off). `rank`: the closest guess gets the
 * full score, the others less by rank. Speed only breaks ties in the ranking (SPEC §7).
 */
export const scoringModeSchema = z.enum(['relative', 'rank']);
export type ScoringMode = z.infer<typeof scoringModeSchema>;

export const closestNumberSettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  baseScore: z.number().int().min(0).max(10_000),
  scoring: scoringModeSchema,
  /** 1 = 100 %: a guess off by the answer's own size or more scores 0. */
  maxRelativeError: z.number().min(0.05).max(10),
  maxYearError: z.number().int().min(1).max(1_000),
});
export type ClosestNumberSettings = z.infer<typeof closestNumberSettingsSchema>;

export const CLOSEST_NUMBER_DEFAULT_SETTINGS: ClosestNumberSettings = {
  introMs: 3_000,
  timeLimitMs: 25_000,
  baseScore: 1_000,
  scoring: 'relative',
  maxRelativeError: 1,
  maxYearError: 100,
};

export const closestNumberInputSchema = z.strictObject({ value: valueSchema });
export type ClosestNumberInput = z.infer<typeof closestNumberInputSchema>;

const questionCommon = {
  question: z.string(),
  unit: z.string().nullable(),
  displayFormat: displayFormatSchema,
};

const hostCounts = {
  answeredCount: z.number().int().nonnegative(),
  /** Connected players who can answer. */
  playerCount: z.number().int().nonnegative(),
};

/** Host views per phase. The answer and the guesses exist only in REVEAL (SPEC §3, §9). */
export const closestNumberHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), ...questionCommon }),
  z.strictObject({ phase: z.literal('ANSWERING'), ...questionCommon, ...hostCounts }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    ...questionCommon,
    ...hostCounts,
    answer: z.number(),
    /** Guesses at least this far from the answer score 0 in relative mode (number line edge). */
    zeroPointDistance: z.number().positive(),
    /** Closest first; ties by answer time. */
    guesses: z.array(
      z.strictObject({
        playerId: z.string(),
        value: z.number(),
        closest: z.boolean(),
      }),
    ),
  }),
]);
export type ClosestNumberHostView = z.infer<typeof closestNumberHostViewSchema>;

export const closestNumberPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('ANSWERING'),
    ...questionCommon,
    /** The player's sent guess; once sent it is final. */
    guess: z.number().nullable(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    ...questionCommon,
    answer: z.number(),
    guess: z.number().nullable(),
    /** Whether this was (one of) the closest guesses; null without a guess. */
    correct: z.boolean().nullable(),
    /** 1 = closest; null without a guess. */
    rank: z.number().int().positive().nullable(),
    answeredCount: z.number().int().nonnegative(),
  }),
]);
export type ClosestNumberPlayerView = z.infer<typeof closestNumberPlayerViewSchema>;
