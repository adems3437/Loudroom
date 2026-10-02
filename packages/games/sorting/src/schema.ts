import { mediaIdSchema } from '@loudroom/game-sdk';
import { z } from 'zod';

export const SORTING_GAME_TYPE = 'sorting';
export const SORTING_MIN_ITEMS = 3;
export const SORTING_MAX_ITEMS = 8;

const itemIdSchema = z.string().min(1).max(64);

/**
 * Content of one sorting question (SPEC §6, §7.3): the items in their correct order, with
 * optional names for the two ends ("En eski" … "En yeni").
 */
export const sortingContentSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(300),
    items: z
      .array(
        z.strictObject({
          id: itemIdSchema,
          text: z.string().trim().min(1).max(80),
          mediaId: mediaIdSchema.optional(),
        }),
      )
      .min(SORTING_MIN_ITEMS)
      .max(SORTING_MAX_ITEMS),
    labels: z
      .strictObject({
        first: z.string().trim().min(1).max(24),
        last: z.string().trim().min(1).max(24),
      })
      .optional(),
  })
  .superRefine((content, ctx) => {
    const ids = content.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Item ids must be unique' });
    }
  });
export type SortingContent = z.infer<typeof sortingContentSchema>;

/**
 * `position`: share of items in their correct place. `kendall`: share of item pairs in the
 * correct order (Kendall tau), which gives partial credit for nearly right orders.
 */
export const sortingScoringSchema = z.enum(['position', 'kendall']);
export type SortingScoring = z.infer<typeof sortingScoringSchema>;

export const sortingSettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  baseScore: z.number().int().min(0).max(10_000),
  scoring: sortingScoringSchema,
  /** Off: the first order sent is final. */
  allowAnswerChange: z.boolean(),
});
export type SortingSettings = z.infer<typeof sortingSettingsSchema>;

export const SORTING_DEFAULT_SETTINGS: SortingSettings = {
  introMs: 3_000,
  timeLimitMs: 30_000,
  baseScore: 1_000,
  scoring: 'position',
  allowAnswerChange: false,
};

export const sortingInputSchema = z.strictObject({
  order: z.array(itemIdSchema).min(SORTING_MIN_ITEMS).max(SORTING_MAX_ITEMS),
});
export type SortingInput = z.infer<typeof sortingInputSchema>;

const itemViewSchema = z.strictObject({
  id: itemIdSchema,
  text: z.string(),
  mediaId: mediaIdSchema.nullable(),
});
export type SortingItemView = z.infer<typeof itemViewSchema>;

const labelsViewSchema = z.strictObject({ first: z.string(), last: z.string() }).nullable();

const hostCommon = {
  question: z.string(),
  labels: labelsViewSchema,
};
const hostCounts = {
  answeredCount: z.number().int().nonnegative(),
  /** Connected players who can answer. */
  playerCount: z.number().int().nonnegative(),
};

/**
 * Host views per phase. Items are shown in a seeded order that does not depend on the
 * correct one; the correct order exists only in REVEAL (SPEC §3, §9).
 */
export const sortingHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), ...hostCommon }),
  z.strictObject({
    phase: z.literal('ANSWERING'),
    ...hostCommon,
    ...hostCounts,
    items: z.array(itemViewSchema),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    ...hostCommon,
    ...hostCounts,
    /** Items in the correct order, each with how many put it in its right place. */
    correctOrder: z.array(itemViewSchema.extend({ placedRight: z.number().int().nonnegative() })),
    /** Players with the whole order right. */
    perfectCount: z.number().int().nonnegative(),
  }),
]);
export type SortingHostView = z.infer<typeof sortingHostViewSchema>;

export const sortingPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('ANSWERING'),
    question: z.string(),
    labels: labelsViewSchema,
    /** Starting order on every phone (the same seeded order as the host's). */
    items: z.array(itemViewSchema),
    /** The order this player sent, if any. */
    submittedOrder: z.array(itemIdSchema).nullable(),
    /** True once the order can no longer change. */
    locked: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    labels: labelsViewSchema,
    correctOrder: z.array(itemViewSchema),
    submittedOrder: z.array(itemIdSchema).nullable(),
    /** Items this player put in their right place; null without an answer. */
    correctPositions: z.number().int().nonnegative().nullable(),
    /** The whole order right; null without an answer. */
    correct: z.boolean().nullable(),
  }),
]);
export type SortingPlayerView = z.infer<typeof sortingPlayerViewSchema>;
