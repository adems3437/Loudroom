import { z } from 'zod';

export const TOMBALA_GAME_TYPE = 'tombala';
export const TOMBALA_MIN_PLAYERS = 2;
export const TOMBALA_ROWS = 3;
export const TOMBALA_COLUMNS = 9;
/** Numbers per row; a card holds 3 × 5 = 15. */
export const TOMBALA_ROW_NUMBERS = 5;
export const TOMBALA_MAX_NUMBER = 90;

/** Prizes in the order they are won (SPEC §7.10), with the full rows each needs. */
export const TOMBALA_PRIZES = ['firstLine', 'secondLine', 'tombala'] as const;
export const tombalaPrizeSchema = z.enum(TOMBALA_PRIZES);
export type TombalaPrize = z.infer<typeof tombalaPrizeSchema>;
export const PRIZE_LINES: Record<TombalaPrize, number> = {
  firstLine: 1,
  secondLine: 2,
  tombala: 3,
};

/** Content of a Tombala game: only its name; the rules are round settings. */
export const tombalaContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
});
export type TombalaContent = z.infer<typeof tombalaContentSchema>;

export const tombalaDrawModeSchema = z.enum(['auto', 'manual']);
export type TombalaDrawMode = z.infer<typeof tombalaDrawModeSchema>;

export const tombalaSettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  /** `auto`: a number every `drawIntervalMs`; `manual`: the host draws each one. */
  drawMode: tombalaDrawModeSchema,
  drawIntervalMs: z.number().int().min(3_000).max(20_000),
  /** Drawn numbers count as marked on every card; players only call their prizes. */
  autoMark: z.boolean(),
  /** How long drawing stops to show a prize's winners. */
  claimMs: z.number().int().min(1_000).max(10_000),
  firstLinePoints: z.number().int().min(0).max(10_000),
  secondLinePoints: z.number().int().min(0).max(10_000),
  tombalaPoints: z.number().int().min(0).max(10_000),
  /** Draws a player must wait to call again after a wrong call. */
  falseClaimLockout: z.number().int().min(0).max(10),
  /** Points off per wrong call; may take the round's points below zero. */
  falseClaimPenalty: z.number().int().min(0).max(5_000),
});
export type TombalaSettings = z.infer<typeof tombalaSettingsSchema>;

export const TOMBALA_DEFAULT_SETTINGS: TombalaSettings = {
  introMs: 5_000,
  drawMode: 'auto',
  drawIntervalMs: 6_000,
  autoMark: false,
  claimMs: 4_000,
  firstLinePoints: 300,
  secondLinePoints: 600,
  tombalaPoints: 1_200,
  falseClaimLockout: 3,
  falseClaimPenalty: 0,
};

const numberSchema = z.number().int().min(1).max(TOMBALA_MAX_NUMBER);

export const tombalaInputSchema = z.discriminatedUnion('type', [
  /** Mark (or unmark) a number of one's own card; only drawn numbers can be marked. */
  z.strictObject({ type: z.literal('mark'), number: numberSchema, marked: z.boolean() }),
  /** "Çinko!" / "Tombala!": the server checks the card against the drawn numbers. */
  z.strictObject({ type: z.literal('claim') }),
]);
export type TombalaInput = z.infer<typeof tombalaInputSchema>;

/** The host screen draws the next number now (manual mode, or without waiting). */
export const tombalaHostInputSchema = z.strictObject({ type: z.literal('draw') });
export type TombalaHostInput = z.infer<typeof tombalaHostInputSchema>;

/** 3 rows × 9 columns; empty cells are null. */
export const tombalaCardSchema = z
  .array(z.array(numberSchema.nullable()).length(TOMBALA_COLUMNS))
  .length(TOMBALA_ROWS);
export type TombalaCard = z.infer<typeof tombalaCardSchema>;

const playerIdSchema = z.string().min(1).max(64);

const prizeStatusSchema = z.array(
  z.strictObject({ prize: tombalaPrizeSchema, winners: z.array(playerIdSchema) }),
);

const board = {
  title: z.string(),
  drawMode: tombalaDrawModeSchema,
  /** Drawn numbers in drawing order; the bag's order is never sent. */
  drawn: z.array(numberSchema),
  remaining: z.number().int().nonnegative(),
  /** Every prize with its winners (empty until won), in prize order. */
  prizes: prizeStatusSchema,
};
const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};

export const tombalaHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), title: z.string(), drawMode: tombalaDrawModeSchema }),
  z.strictObject({ phase: z.literal('DRAW'), ...board }),
  /** Drawing stops while the latest prize's winners are shown. */
  z.strictObject({
    phase: z.literal('CLAIM'),
    ...board,
    claim: z.strictObject({ prize: tombalaPrizeSchema, winners: z.array(playerIdSchema) }),
  }),
  z.strictObject({ phase: z.literal('REVEAL'), ...board }),
  z.strictObject(skipped),
]);
export type TombalaHostView = z.infer<typeof tombalaHostViewSchema>;

const mine = {
  /** Null for a player who joined late, until the next draw deals a card. */
  card: tombalaCardSchema.nullable(),
  /** This player's marks; with `autoMark` every drawn number on the card. */
  marked: z.array(numberSchema),
  autoMark: z.boolean(),
  /** The prize a call would be checked for now; null once all are taken. */
  nextPrize: tombalaPrizeSchema.nullable(),
  /** Draws until this player may call again after a wrong call. */
  lockedDraws: z.number().int().nonnegative(),
  falseClaims: z.number().int().nonnegative(),
  myPrizes: z.array(tombalaPrizeSchema),
};

export const tombalaPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({
    phase: z.literal('INTRO'),
    title: z.string(),
    card: tombalaCardSchema.nullable(),
    autoMark: z.boolean(),
  }),
  z.strictObject({ phase: z.literal('DRAW'), ...board, ...mine }),
  z.strictObject({
    phase: z.literal('CLAIM'),
    ...board,
    ...mine,
    claim: z.strictObject({ prize: tombalaPrizeSchema, winners: z.array(playerIdSchema) }),
  }),
  z.strictObject({ phase: z.literal('REVEAL'), ...board, ...mine }),
  z.strictObject(skipped),
]);
export type TombalaPlayerView = z.infer<typeof tombalaPlayerViewSchema>;
