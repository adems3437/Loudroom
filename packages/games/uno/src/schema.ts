import { z } from 'zod';
import { UNO_DECK_SIZE, unoCardSchema, unoColorSchema } from './cards.js';

export * from './cards.js';

export const UNO_GAME_TYPE = 'uno';
export const UNO_MIN_PLAYERS = 2;
export const UNO_MAX_SEATS = 10;

/** Content of an UNO match: only its name; the rules are round settings. */
export const unoContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
});
export type UnoContent = z.infer<typeof unoContentSchema>;

export const unoTimeoutActionSchema = z.enum(['autoPlay', 'drawAndPass']);
export type UnoTimeoutAction = z.infer<typeof unoTimeoutActionSchema>;

export const unoSettingsSchema = z.strictObject({
  startingCards: z.number().int().min(2).max(10),
  turnMs: z.number().int().min(10_000).max(120_000),
  /** When a present player's time runs out: the bot's move, or draw a card and pass. */
  timeoutAction: unoTimeoutActionSchema,
  /** +2 and +4 may be stacked onto a +2 / +4; the next player then draws the total. */
  stacking: z.boolean(),
  /** After this the match ends at the next turn: the fewest points in hand wins. */
  matchMs: z.number().int().min(120_000).max(3_600_000),
  /** A bot plays the turns of a player who is offline. */
  bots: z.boolean(),
  botDelayMs: z.number().int().min(500).max(5_000),
  firstPoints: z.number().int().min(0).max(10_000),
  secondPoints: z.number().int().min(0).max(10_000),
  thirdPoints: z.number().int().min(0).max(10_000),
  otherPoints: z.number().int().min(0).max(10_000),
});
export type UnoSettings = z.infer<typeof unoSettingsSchema>;

export const UNO_DEFAULT_SETTINGS: UnoSettings = {
  startingCards: 7,
  turnMs: 30_000,
  timeoutAction: 'autoPlay',
  stacking: false,
  matchMs: 900_000,
  bots: true,
  botDelayMs: 1_500,
  firstPoints: 1_000,
  secondPoints: 600,
  thirdPoints: 400,
  otherPoints: 200,
};

const cardIdSchema = z
  .number()
  .int()
  .min(0)
  .max(UNO_DECK_SIZE - 1);

export const unoInputSchema = z.discriminatedUnion('type', [
  /** Plays a card from the hand; a wild card names the colour to go on with. */
  z.strictObject({
    type: z.literal('play'),
    cardId: cardIdSchema,
    color: unoColorSchema.optional(),
  }),
  z.strictObject({ type: z.literal('draw') }),
  /** After drawing a playable card, keep it and end the turn. */
  z.strictObject({ type: z.literal('pass') }),
  /** "UNO!": with two cards before playing, or with one before anyone catches it. */
  z.strictObject({ type: z.literal('uno') }),
  /** "Yakala!": someone is down to one card without having said "UNO!". */
  z.strictObject({ type: z.literal('catch') }),
]);
export type UnoInput = z.infer<typeof unoInputSchema>;

const playerIdSchema = z.string().min(1).max(64);

/** What just happened, for the TV and the phones (drawn cards stay hidden). */
export const unoEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('play'),
    playerId: playerIdSchema,
    card: unoCardSchema,
    color: unoColorSchema,
  }),
  z.strictObject({ kind: z.literal('draw'), playerId: playerIdSchema, count: z.number().int() }),
  z.strictObject({ kind: z.literal('pass'), playerId: playerIdSchema }),
  z.strictObject({ kind: z.literal('uno'), playerId: playerIdSchema }),
  z.strictObject({ kind: z.literal('caught'), playerId: playerIdSchema, by: playerIdSchema }),
]);
export type UnoEvent = z.infer<typeof unoEventSchema>;

const seatSchema = z.strictObject({
  playerId: playerIdSchema,
  count: z.number().int().nonnegative(),
  /** Said "UNO!" and is down to one or two cards. */
  called: z.boolean(),
});

const table = {
  title: z.string(),
  seats: z.array(seatSchema),
  /** Whose turn it is. */
  turn: playerIdSchema,
  direction: z.union([z.literal(1), z.literal(-1)]),
  top: unoCardSchema,
  /** The colour to follow (a wild card's chosen colour). */
  color: unoColorSchema,
  deckCount: z.number().int().nonnegative(),
  /** Cards the next player must draw from stacked +2 / +4. */
  pending: z.number().int().nonnegative(),
  /** The turn is played by a bot (its player is away). */
  bot: z.boolean(),
  last: unoEventSchema.nullable(),
};
const result = {
  title: z.string(),
  winner: playerIdSchema,
  /** The match ran out of time instead of someone emptying their hand. */
  endedBy: z.enum(['empty', 'time']),
  ranking: z.array(
    z.strictObject({
      playerId: playerIdSchema,
      cards: z.number().int().nonnegative(),
      handPoints: z.number().int().nonnegative(),
    }),
  ),
};
const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};

export const unoHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('TURN'), ...table }),
  z.strictObject({ phase: z.literal('END'), ...result }),
  z.strictObject(skipped),
]);
export type UnoHostView = z.infer<typeof unoHostViewSchema>;

const mine = {
  /** Null for a spectator. */
  hand: z.array(unoCardSchema).nullable(),
  /** Ids of the cards this player may play now. */
  playable: z.array(cardIdSchema),
  /** The card just drawn this turn, which may still be played. */
  drawn: cardIdSchema.nullable(),
  called: z.boolean(),
  /** Someone else is down to one card: "Yakala!" may be tried. */
  canCatch: z.boolean(),
};

export const unoPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('TURN'), ...table, ...mine }),
  z.strictObject({ phase: z.literal('END'), ...result, hand: z.array(unoCardSchema).nullable() }),
  z.strictObject(skipped),
]);
export type UnoPlayerView = z.infer<typeof unoPlayerViewSchema>;
