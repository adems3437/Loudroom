import { z } from 'zod';

export const QUIZ_GAME_TYPE = 'quiz';
export const QUIZ_MIN_OPTIONS = 2;
export const QUIZ_MAX_OPTIONS = 6;

const optionIdSchema = z.string().min(1).max(64);

/** Content of one question (SPEC §6: stored as ContentItem.data, validated on write and read). */
export const quizContentSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(300),
    options: z
      .array(z.strictObject({ id: optionIdSchema, text: z.string().trim().min(1).max(120) }))
      .min(QUIZ_MIN_OPTIONS)
      .max(QUIZ_MAX_OPTIONS),
    correctOptionId: optionIdSchema,
  })
  .superRefine((content, ctx) => {
    const ids = content.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option ids must be unique' });
    }
    if (!ids.includes(content.correctOptionId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctOptionId'],
        message: 'The correct option must be one of the options',
      });
    }
  });
export type QuizContent = z.infer<typeof quizContentSchema>;

export const quizSettingsSchema = z.strictObject({
  /** Question shown before answering opens. */
  introMs: z.number().int().min(0).max(15_000),
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  baseScore: z.number().int().min(0).max(10_000),
  /** Off: the first answer is final (SPEC §7.1 default). */
  allowAnswerChange: z.boolean(),
  /** Bonus for consecutive correct answers: from the Nth in a row, +step each, capped. */
  streakBonus: z.strictObject({
    fromStreak: z.number().int().min(2).max(20),
    step: z.number().int().min(0).max(1_000),
    max: z.number().int().min(0).max(5_000),
  }),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const QUIZ_DEFAULT_SETTINGS: QuizSettings = {
  introMs: 3_000,
  timeLimitMs: 20_000,
  baseScore: 1_000,
  allowAnswerChange: false,
  streakBonus: { fromStreak: 3, step: 100, max: 500 },
};

export const quizInputSchema = z.strictObject({ optionId: optionIdSchema });
export type QuizInput = z.infer<typeof quizInputSchema>;

/** An option as shown: `slot` is its display position, which picks its color and shape. */
const optionViewSchema = z.strictObject({
  id: optionIdSchema,
  text: z.string(),
  slot: z.number().int().min(0).max(QUIZ_MAX_OPTIONS - 1),
});
export type QuizOptionView = z.infer<typeof optionViewSchema>;

const hostCommon = {
  question: z.string(),
  options: z.array(optionViewSchema),
  answeredCount: z.number().int().nonnegative(),
  /** Connected players who can answer. */
  playerCount: z.number().int().nonnegative(),
};

/** Host views per phase. The correct answer exists only in REVEAL (SPEC §3, §9). */
export const quizHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), ...hostCommon }),
  z.strictObject({ phase: z.literal('ANSWERING'), ...hostCommon }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    ...hostCommon,
    correctOptionId: optionIdSchema,
    distribution: z.array(
      z.strictObject({ optionId: optionIdSchema, count: z.number().int().nonnegative() }),
    ),
  }),
]);
export type QuizHostView = z.infer<typeof quizHostViewSchema>;

export const quizPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('ANSWERING'),
    question: z.string(),
    options: z.array(optionViewSchema),
    selectedOptionId: optionIdSchema.nullable(),
    /** True once the answer can no longer change. */
    locked: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    options: z.array(optionViewSchema),
    selectedOptionId: optionIdSchema.nullable(),
    correctOptionId: optionIdSchema,
    /** null when the player did not answer. */
    correct: z.boolean().nullable(),
  }),
]);
export type QuizPlayerView = z.infer<typeof quizPlayerViewSchema>;
