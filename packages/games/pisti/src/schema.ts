import { z } from 'zod';
import { DECK_SIZE, playingCardSchema } from './cards.js';

export * from './cards.js';

export const PISTI_GAME_TYPE = 'pisti';
export const PISTI_MIN_PLAYERS = 2;
export const PISTI_MAX_SEATS = 4;
/** Platform points per game point. */
export const PISTI_POINT_SCALE = 10;

/** Content of a Pişti match: only its name; the rules are round settings. */
export const pistiContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
});
export type PistiContent = z.infer<typeof pistiContentSchema>;

export const pistiSettingsSchema = z
  .strictObject({
    /** The match ends after the deal in which a side reaches it; 0: no target. */
    targetPoints: z.number().int().min(0).max(1_001),
    /** The match ends after this many deals; 0: no limit. */
    maxDeals: z.number().int().min(0).max(20),
    /** With four players, partners sit opposite and share their points. */
    teams: z.boolean(),
    turnMs: z.number().int().min(5_000).max(120_000),
    bots: z.boolean(),
    botDelayMs: z.number().int().min(500).max(5_000),
    /** How long a deal's score is shown before the next deal. */
    tallyMs: z.number().int().min(3_000).max(30_000),
  })
  .refine((settings) => settings.targetPoints > 0 || settings.maxDeals > 0, {
    message: 'A match needs a target or a number of deals',
    path: ['targetPoints'],
  });
export type PistiSettings = z.infer<typeof pistiSettingsSchema>;

export const PISTI_DEFAULT_SETTINGS: PistiSettings = {
  targetPoints: 101,
  maxDeals: 0,
  teams: true,
  turnMs: 20_000,
  bots: true,
  botDelayMs: 1_500,
  tallyMs: 6_000,
};

const cardIdSchema = z
  .number()
  .int()
  .min(0)
  .max(DECK_SIZE - 1);

export const pistiInputSchema = z.strictObject({ type: z.literal('play'), cardId: cardIdSchema });
export type PistiInput = z.infer<typeof pistiInputSchema>;

const playerIdSchema = z.string().min(1).max(64);
const pistiKindSchema = z.enum(['normal', 'jack']);

export const pistiPlaySchema = z.strictObject({
  playerId: playerIdSchema,
  card: playingCardSchema,
  /** The pile was taken. */
  captured: z.boolean(),
  pisti: pistiKindSchema.nullable(),
});
export type PistiPlay = z.infer<typeof pistiPlaySchema>;

export const tallyRowSchema = z.strictObject({
  side: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
  /** 3 for the most cards (nobody on a tie). */
  mostCards: z.number().int().nonnegative(),
  /** Aces, Jacks, ♣2 and ♦10. */
  cardPoints: z.number().int().nonnegative(),
  pistis: z.number().int().nonnegative(),
  jackPistis: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type TallyRow = z.infer<typeof tallyRowSchema>;

const sideSchema = z.strictObject({
  side: z.number().int().nonnegative(),
  players: z.array(playerIdSchema),
  score: z.number().int().nonnegative(),
  /** Cards taken in this deal. */
  captured: z.number().int().nonnegative(),
});

const table = {
  title: z.string(),
  deal: z.number().int().positive(),
  targetPoints: z.number().int().nonnegative(),
  maxDeals: z.number().int().nonnegative(),
  teams: z.boolean(),
  seats: z.array(
    z.strictObject({
      playerId: playerIdSchema,
      count: z.number().int().nonnegative(),
      side: z.number().int().nonnegative(),
    }),
  ),
  sides: z.array(sideSchema),
  turn: playerIdSchema,
  bot: z.boolean(),
  /** Cards on the table: face-down ones are only counted. */
  pile: z.strictObject({
    count: z.number().int().nonnegative(),
    hidden: z.number().int().nonnegative(),
    /** The face-up cards, top last (at most the last six). */
    visible: z.array(playingCardSchema),
  }),
  deckCount: z.number().int().nonnegative(),
  last: pistiPlaySchema.nullable(),
};
const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};
const ended = {
  title: z.string(),
  teams: z.boolean(),
  sides: z.array(sideSchema),
  /** Sides with the most points (most cards over the match on a tie). */
  winners: z.array(z.number().int().nonnegative()),
};

export const pistiHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('TURN'), ...table }),
  z.strictObject({ phase: z.literal('TALLY'), ...table, tally: z.array(tallyRowSchema) }),
  z.strictObject({ phase: z.literal('END'), ...ended }),
  z.strictObject(skipped),
]);
export type PistiHostView = z.infer<typeof pistiHostViewSchema>;

const mine = {
  /** Null for a spectator. */
  hand: z.array(playingCardSchema).nullable(),
  mySide: z.number().int().nonnegative().nullable(),
};

export const pistiPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('TURN'), ...table, ...mine }),
  z.strictObject({
    phase: z.literal('TALLY'),
    ...table,
    ...mine,
    tally: z.array(tallyRowSchema),
  }),
  z.strictObject({ phase: z.literal('END'), ...ended, mySide: mine.mySide }),
  z.strictObject(skipped),
]);
export type PistiPlayerView = z.infer<typeof pistiPlayerViewSchema>;
