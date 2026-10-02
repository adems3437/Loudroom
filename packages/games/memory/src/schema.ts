import { foldText, mediaIdSchema } from '@loudroom/game-sdk';
import { z } from 'zod';

export const MEMORY_GAME_TYPE = 'memory';
export const MEMORY_MIN_ITEMS = 8;
export const MEMORY_MAX_ITEMS = 24;

const itemIdSchema = z.string().min(1).max(32);

/** One object of a set: a label with an emoji or an uploaded image (SPEC §7.8). */
export const memoryItemSchema = z
  .strictObject({
    id: itemIdSchema,
    label: z.string().trim().min(1).max(30),
    emoji: z.string().trim().min(1).max(16).optional(),
    mediaId: mediaIdSchema.optional(),
  })
  .refine((item) => item.emoji !== undefined || item.mediaId !== undefined, {
    message: 'An item needs an emoji or an image',
    path: ['emoji'],
  });
export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const memoryContentSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(60),
    items: z.array(memoryItemSchema).min(MEMORY_MIN_ITEMS).max(MEMORY_MAX_ITEMS),
  })
  .superRefine((content, ctx) => {
    const ids = new Set<string>();
    const labels = new Set<string>();
    content.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'Duplicate id' });
      }
      const label = foldText(item.label);
      if (labels.has(label)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'label'],
          message: 'Duplicate label',
        });
      }
      ids.add(item.id);
      labels.add(label);
    });
  });
export type MemoryContent = z.infer<typeof memoryContentSchema>;

export const memorySettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  /** How long the board stays on the TV. */
  showMs: z.number().int().min(2_000).max(30_000),
  /** Time to answer all questions (the pack round's time limit). */
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  /** Spaces on the board… */
  boardSize: z.number().int().min(4).max(16),
  /** …filled with this many different objects (some repeated, for "how many"). */
  distinctCount: z.number().int().min(3).max(12),
  questionCount: z.number().int().min(1).max(5),
  pointsPerQuestion: z.number().int().min(0).max(5_000),
});
export type MemorySettings = z.infer<typeof memorySettingsSchema>;

export const MEMORY_DEFAULT_SETTINGS: MemorySettings = {
  introMs: 3_000,
  showMs: 8_000,
  timeLimitMs: 30_000,
  boardSize: 9,
  distinctCount: 6,
  questionCount: 3,
  pointsPerQuestion: 400,
};

export const memoryInputSchema = z.strictObject({
  question: z.number().int().min(0).max(4),
  optionId: z.string().min(1).max(8),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export const questionTypeSchema = z.enum(['present', 'absent', 'count']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const itemViewSchema = z.strictObject({
  id: itemIdSchema,
  label: z.string(),
  emoji: z.string().nullable(),
  mediaId: mediaIdSchema.nullable(),
});
export type ItemView = z.infer<typeof itemViewSchema>;

/** An answer option: an object, or a number for "how many". */
const optionViewSchema = z.strictObject({
  id: z.string(),
  item: itemViewSchema.nullable(),
  number: z.number().int().nullable(),
});
export type OptionView = z.infer<typeof optionViewSchema>;

/** A question as asked: never with its answer before the reveal. */
const questionViewSchema = z.strictObject({
  type: questionTypeSchema,
  /** The object to count ("how many"). */
  subject: itemViewSchema.nullable(),
  options: z.array(optionViewSchema),
});
export type QuestionView = z.infer<typeof questionViewSchema>;

const revealedQuestionSchema = questionViewSchema.extend({
  correctOptionId: z.string(),
  /** Players who got it right. */
  correctCount: z.number().int().nonnegative(),
});

/**
 * Host views. The board is on the TV while it is shown and again in the reveal; never on
 * phones, and never with the answers before the reveal (SPEC §3, §9).
 */
export const memoryHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), title: z.string() }),
  z.strictObject({ phase: z.literal('SHOW'), title: z.string(), board: z.array(itemViewSchema) }),
  z.strictObject({
    phase: z.literal('QUESTIONS'),
    title: z.string(),
    questionCount: z.number().int().positive(),
    /** Players who answered every question. */
    finishedCount: z.number().int().nonnegative(),
    playerCount: z.number().int().nonnegative(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    title: z.string(),
    board: z.array(itemViewSchema),
    questions: z.array(revealedQuestionSchema),
  }),
]);
export type MemoryHostView = z.infer<typeof memoryHostViewSchema>;

export const memoryPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), title: z.string() }),
  z.strictObject({ phase: z.literal('SHOW') }),
  z.strictObject({
    phase: z.literal('QUESTIONS'),
    questions: z.array(questionViewSchema),
    /** This player's answers, by question index. */
    answers: z.record(z.string(), z.string()),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    questions: z.array(revealedQuestionSchema.omit({ correctCount: true })),
    answers: z.record(z.string(), z.string()),
    correctCount: z.number().int().nonnegative(),
  }),
]);
export type MemoryPlayerView = z.infer<typeof memoryPlayerViewSchema>;
