import { isNearMatch } from '@loudroom/game-sdk';
import { z } from 'zod';

export const BLUFF_GAME_TYPE = 'bluff';
/** Longest answer, lie or decoy (characters as a person counts them). */
export const BLUFF_MAX_TEXT = 40;
export const BLUFF_MAX_ACCEPTED = 5;
export const BLUFF_MIN_DECOYS = 2;
export const BLUFF_MAX_DECOYS = 6;

const textSchema = z.string().trim().min(1).max(BLUFF_MAX_TEXT);

/**
 * Content of one question (SPEC §7.6): the real answer, other spellings of it ("3" for "üç"),
 * and decoys — the house's own lies that fill the options when players write too few.
 */
export const bluffContentSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(300),
    answer: textSchema,
    acceptedAnswers: z.array(textSchema).max(BLUFF_MAX_ACCEPTED).optional(),
    decoys: z.array(textSchema).min(BLUFF_MIN_DECOYS).max(BLUFF_MAX_DECOYS),
  })
  .superRefine((content, ctx) => {
    const truths = [content.answer, ...(content.acceptedAnswers ?? [])];
    content.decoys.forEach((decoy, index) => {
      if (truths.some((truth) => isNearMatch(decoy, truth))) {
        ctx.addIssue({
          code: 'custom',
          path: ['decoys', index],
          message: 'A decoy must not look like the answer',
        });
      }
      if (content.decoys.slice(0, index).some((other) => isNearMatch(decoy, other))) {
        ctx.addIssue({ code: 'custom', path: ['decoys', index], message: 'Duplicate decoy' });
      }
    });
  });
export type BluffContent = z.infer<typeof bluffContentSchema>;

export const bluffSettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  /** Time to write a lie (the pack round's time limit). */
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  voteMs: z.number().int().min(5_000).max(120_000),
  /** For picking the real answer. */
  truthPoints: z.number().int().min(0).max(10_000),
  /** For each player who picked your lie. */
  foolPoints: z.number().int().min(0).max(10_000),
  /** Decoys fill the options up to this many. */
  minOptions: z.number().int().min(2).max(8),
});
export type BluffSettings = z.infer<typeof bluffSettingsSchema>;

export const BLUFF_DEFAULT_SETTINGS: BluffSettings = {
  introMs: 3_000,
  timeLimitMs: 45_000,
  voteMs: 25_000,
  truthPoints: 1_000,
  foolPoints: 500,
  minOptions: 4,
};

export const bluffInputSchema = z.discriminatedUnion('type', [
  /** Cleaned and length-checked by the module. */
  z.strictObject({ type: z.literal('lie'), text: z.string().max(200) }),
  z.strictObject({ type: z.literal('vote'), optionId: z.string().min(1).max(16) }),
]);
export type BluffInput = z.infer<typeof bluffInputSchema>;

/** An option as voted on: upper-cased so spelling style never gives the real one away. */
const optionViewSchema = z.strictObject({ id: z.string(), text: z.string() });
export type BluffOptionView = z.infer<typeof optionViewSchema>;

/** One reveal step: a picked lie or decoy with who fell for it and who wrote it; then the truth. */
const stepSchema = z.strictObject({
  optionId: z.string(),
  text: z.string(),
  kind: z.enum(['lie', 'decoy', 'truth']),
  authors: z.array(z.string()),
  voters: z.array(z.string()),
});
export type BluffRevealStep = z.infer<typeof stepSchema>;

const counts = {
  /** Connected players who can take part. */
  playerCount: z.number().int().nonnegative(),
};
const reveal = {
  options: z.array(optionViewSchema),
  steps: z.array(stepSchema),
  /** Time per step; the REVEAL phase clock says which step is on screen. */
  stepMs: z.number().int().positive(),
  /** The reveal has finished (the round is scored). */
  done: z.boolean(),
};

/**
 * Host views. Until REVEAL nothing tells the real answer apart from the lies, and nobody's
 * lie or vote is attributed (SPEC §3, §9).
 */
export const bluffHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('WRITE'),
    question: z.string(),
    writtenCount: z.number().int().nonnegative(),
    ...counts,
  }),
  z.strictObject({
    phase: z.literal('VOTE'),
    question: z.string(),
    options: z.array(optionViewSchema),
    votedCount: z.number().int().nonnegative(),
    ...counts,
  }),
  z.strictObject({ phase: z.literal('REVEAL'), question: z.string(), ...reveal }),
]);
export type BluffHostView = z.infer<typeof bluffHostViewSchema>;

export const bluffPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('WRITE'),
    question: z.string(),
    /** This player's accepted lie; once sent it is final. */
    lie: z.string().nullable(),
  }),
  z.strictObject({
    phase: z.literal('VOTE'),
    question: z.string(),
    /** `own`: this player's lie (cannot be voted for). */
    options: z.array(optionViewSchema.extend({ own: z.boolean() })),
    vote: z.string().nullable(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    question: z.string(),
    done: z.boolean(),
    truth: z.string(),
    lie: z.string().nullable(),
    vote: z.string().nullable(),
    /** Picked the real answer; null without a vote. */
    correct: z.boolean().nullable(),
    /** Players who picked this player's lie. */
    fooled: z.array(z.string()),
    /** Authors of the lie this player picked; empty for a decoy or the truth. */
    fooledBy: z.array(z.string()),
    /** Picked one of the house's decoys. */
    pickedDecoy: z.boolean(),
  }),
]);
export type BluffPlayerView = z.infer<typeof bluffPlayerViewSchema>;
