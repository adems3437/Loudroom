import { foldText } from '@loudroom/game-sdk';
import { z } from 'zod';

export const DRAWING_GAME_TYPE = 'drawing';
export const DRAWING_MIN_PLAYERS = 2;
export const DRAWING_MAX_WORD = 30;

/** The canvas is 4:3; coordinates run 0..CANVAS_UNITS across its width and its height. */
export const CANVAS_UNITS = 1000;
export const CANVAS_ASPECT = 4 / 3;
/** Pen colors; white on the white canvas is the eraser. */
export const PALETTE = [
  '#14142a',
  '#ffffff',
  '#ef4565',
  '#ff9f1c',
  '#f5b700',
  '#2bb673',
  '#3a86ff',
  '#9b5de5',
] as const;
export const ERASER_COLOR = 1;
/** Pen widths in thousandths of the canvas width. */
export const PEN_SIZES = [6, 14, 32] as const;

const wordSchema = z.string().trim().min(1).max(DRAWING_MAX_WORD);

/** Content of one drawing round (SPEC §7.5): the word and other accepted spellings. */
export const drawingContentSchema = z
  .strictObject({
    word: wordSchema,
    alternatives: z.array(wordSchema).max(5).optional(),
  })
  .superRefine((content, ctx) => {
    if (foldText(content.word).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['word'], message: 'The word needs letters' });
    }
  });
export type DrawingContent = z.infer<typeof drawingContentSchema>;

export const drawingSettingsSchema = z.strictObject({
  /** The drawer sees the word (and everyone who draws) before drawing starts. */
  introMs: z.number().int().min(0).max(15_000),
  /** Drawing and guessing time (the pack round's time limit). */
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  /** For the first correct guess. */
  baseScore: z.number().int().min(0).max(10_000),
  /** Less for each later correct guess… */
  rankStep: z.number().int().min(0).max(5_000),
  /** …but never below this. */
  minScore: z.number().int().min(0).max(10_000),
  /** For the drawer, per player who guessed the word. */
  drawerPoints: z.number().int().min(0).max(5_000),
  /** Show the word's letter count as empty boxes. */
  showLetterSlots: z.boolean(),
});
export type DrawingSettings = z.infer<typeof drawingSettingsSchema>;

export const DRAWING_DEFAULT_SETTINGS: DrawingSettings = {
  introMs: 3_000,
  timeLimitMs: 80_000,
  baseScore: 1_000,
  rankStep: 150,
  minScore: 300,
  drawerPoints: 250,
  showLetterSlots: true,
};

export const drawingInputSchema = z.strictObject({
  type: z.literal('guess'),
  /** Cleaned and length-checked by the module. */
  text: z.string().max(100),
});
export type DrawingInput = z.infer<typeof drawingInputSchema>;

const coordinate = z.number().int().min(0).max(CANVAS_UNITS);
const strokeId = z.number().int().min(0).max(100_000);

/**
 * One stream chunk (~50 ms of drawing): line pieces (a stroke continues across chunks under
 * its id), undo of a whole stroke, or clearing the canvas.
 */
export const drawingOpSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('line'),
    s: strokeId,
    c: z
      .number()
      .int()
      .min(0)
      .max(PALETTE.length - 1),
    w: z
      .number()
      .int()
      .min(0)
      .max(PEN_SIZES.length - 1),
    /** x, y, x, y, … */
    p: z
      .array(coordinate)
      .min(2)
      .max(128)
      .refine((points) => points.length % 2 === 0, 'Points come in x, y pairs'),
  }),
  z.strictObject({ t: z.literal('undo'), s: strokeId }),
  z.strictObject({ t: z.literal('clear') }),
]);
export type DrawingOp = z.infer<typeof drawingOpSchema>;

export const drawingChunkSchema = z.strictObject({
  ops: z.array(drawingOpSchema).min(1).max(16),
});
export type DrawingChunk = z.infer<typeof drawingChunkSchema>;

/** What a chunk counts toward the round's stream limit: its points, plus one per op. */
export function chunkCost(chunk: DrawingChunk): number {
  return chunk.ops.reduce((sum, op) => sum + 1 + (op.t === 'line' ? op.p.length / 2 : 0), 0);
}

/** Letters per word of the answer ("buz dolabı" → [3, 6]); null when hidden by a setting. */
const slotsSchema = z.array(z.number().int().positive()).nullable();
const feedSchema = z.array(z.strictObject({ playerId: z.string(), text: z.string() }));
const skipped = z.strictObject({
  phase: z.literal('SKIPPED'),
  minPlayers: z.number().int().positive(),
});

/**
 * Host views. The word exists only in REVEAL; wrong guesses are shown, right ones never
 * (SPEC §3, §9). The drawing itself arrives on the round's stream.
 */
export const drawingHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), drawerId: z.string(), slots: slotsSchema }),
  z.strictObject({
    phase: z.literal('DRAWING'),
    drawerId: z.string(),
    slots: slotsSchema,
    /** Wrong guesses, newest last. */
    feed: feedSchema,
    /** Players who guessed it, in order. */
    solvers: z.array(z.string()),
    /** Connected players who can guess. */
    guesserCount: z.number().int().nonnegative(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    drawerId: z.string(),
    word: z.string(),
    feed: feedSchema,
    solvers: z.array(z.string()),
  }),
  skipped,
]);
export type DrawingHostView = z.infer<typeof drawingHostViewSchema>;

const guessResultSchema = z.enum(['wrong', 'close']);
export type GuessFeedback = z.infer<typeof guessResultSchema>;

export const drawingPlayerViewSchema = z.union([
  z.strictObject({ phase: z.literal('INTRO'), role: z.literal('drawer'), word: z.string() }),
  z.strictObject({
    phase: z.literal('INTRO'),
    role: z.literal('guesser'),
    drawerId: z.string(),
    slots: slotsSchema,
  }),
  z.strictObject({
    phase: z.literal('DRAWING'),
    role: z.literal('drawer'),
    word: z.string(),
    solvedCount: z.number().int().nonnegative(),
    guesserCount: z.number().int().nonnegative(),
  }),
  z.strictObject({
    phase: z.literal('DRAWING'),
    role: z.literal('guesser'),
    drawerId: z.string(),
    slots: slotsSchema,
    solved: z.boolean(),
    /** This player's latest guesses; "close" is told to nobody else. */
    guesses: z.array(z.strictObject({ text: z.string(), result: guessResultSchema })),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    role: z.enum(['drawer', 'guesser']),
    drawerId: z.string(),
    word: z.string(),
    /** Guessed it; null for the drawer and for players who never guessed. */
    solved: z.boolean().nullable(),
    rank: z.number().int().positive().nullable(),
    solvedCount: z.number().int().nonnegative(),
  }),
  skipped,
]);
export type DrawingPlayerView = z.infer<typeof drawingPlayerViewSchema>;
