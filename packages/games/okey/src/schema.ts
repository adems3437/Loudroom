import { z } from 'zod';
import { OKEY_COLORS, RACK_SLOTS, TILE_COUNT } from './tiles.js';

export * from './tiles.js';

export const OKEY_GAME_TYPE = 'okey';
export const OKEY_MIN_PLAYERS = 2;
export const OKEY_SEATS = 4;
/** The hand counts and starting points the TV offers before the deal. */
export const OKEY_HAND_CHOICES = [1, 2, 4, 8] as const;
export const OKEY_POINT_CHOICES = [10, 20] as const;

/** Content of an Okey match: only its name; the rules are round settings. */
export const okeyContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
});
export type OkeyContent = z.infer<typeof okeyContentSchema>;

export const okeySettingsSchema = z.strictObject({
  /** Defaults for the choices the host makes on the TV before the deal. */
  hands: z.number().int().min(1).max(20),
  startPoints: z.number().int().min(2).max(50),
  teams: z.boolean(),
  /** How long the TV waits for those choices before dealing with the defaults. */
  setupMs: z.number().int().min(10_000).max(600_000),
  turnMs: z.number().int().min(10_000).max(120_000),
  /** A bot plays the turns of a player who is offline (empty seats always have bots). */
  bots: z.boolean(),
  botDelayMs: z.number().int().min(500).max(5_000),
  /** The scoreboard after each hand. */
  tallyMs: z.number().int().min(2_000).max(30_000),
  /** After this the match ends at the next turn; the hand being played does not count. */
  matchMs: z.number().int().min(120_000).max(7_200_000),
  firstPoints: z.number().int().min(0).max(10_000),
  secondPoints: z.number().int().min(0).max(10_000),
  thirdPoints: z.number().int().min(0).max(10_000),
  otherPoints: z.number().int().min(0).max(10_000),
  /** With partners: the losing side's points (the winners get `firstPoints`). */
  teamLoserPoints: z.number().int().min(0).max(10_000),
});
export type OkeySettings = z.infer<typeof okeySettingsSchema>;

export const OKEY_DEFAULT_SETTINGS: OkeySettings = {
  hands: 4,
  startPoints: 20,
  teams: false,
  setupMs: 120_000,
  turnMs: 30_000,
  bots: true,
  botDelayMs: 1_500,
  tallyMs: 8_000,
  matchMs: 1_800_000,
  firstPoints: 1_000,
  secondPoints: 600,
  thirdPoints: 400,
  otherPoints: 200,
  teamLoserPoints: 300,
};

const tileIdSchema = z
  .number()
  .int()
  .min(0)
  .max(TILE_COUNT - 1);
const slotSchema = z
  .number()
  .int()
  .min(0)
  .max(RACK_SLOTS - 1);

export const okeyInputSchema = z.discriminatedUnion('type', [
  /** Draws from the middle; `slot` places the tile on the rack (else the first free slot). */
  z.strictObject({ type: z.literal('draw'), slot: slotSchema.optional() }),
  /** Takes the tile the player on the left just discarded. */
  z.strictObject({ type: z.literal('take'), slot: slotSchema.optional() }),
  z.strictObject({ type: z.literal('discard'), tile: tileIdSchema }),
  /** Ends the hand by putting `tile` down: the other 14 must finish. */
  z.strictObject({ type: z.literal('finish'), tile: tileIdSchema }),
  /** Shows the indicator's twin on the first turn of the hand. */
  z.strictObject({ type: z.literal('show') }),
  /** The rack as laid out on the phone: every slot's tile id or null. */
  z.strictObject({
    type: z.literal('arrange'),
    slots: z.array(tileIdSchema.nullable()).length(RACK_SLOTS),
  }),
]);
export type OkeyInput = z.infer<typeof okeyInputSchema>;

/** The TV's choices before the deal. */
export const okeyHostInputSchema = z.strictObject({
  type: z.literal('start'),
  hands: z.number().int().min(1).max(20),
  startPoints: z.number().int().min(2).max(50),
  teams: z.boolean(),
});
export type OkeyHostInput = z.infer<typeof okeyHostInputSchema>;

const seatIdSchema = z.string().min(1).max(64);
const colorSchema = z.enum(OKEY_COLORS);
const faceSchema = z.strictObject({ color: colorSchema, number: z.number().int().min(1).max(13) });

/** What just happened (a tile drawn from the middle stays hidden). */
export const okeyEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('draw'), seat: seatIdSchema }),
  z.strictObject({ kind: z.literal('take'), seat: seatIdSchema, tile: tileIdSchema }),
  z.strictObject({ kind: z.literal('discard'), seat: seatIdSchema, tile: tileIdSchema }),
  z.strictObject({ kind: z.literal('show'), seat: seatIdSchema, tile: tileIdSchema }),
]);
export type OkeyEvent = z.infer<typeof okeyEventSchema>;

const seatSchema = z.strictObject({
  /** A player's id, or `bot:n` for a bot in an empty seat. */
  id: seatIdSchema,
  /** The bot's number for a bot seat ("Bot 2"); null for a player. */
  bot: z.number().int().positive().nullable(),
  side: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  /** The top of the pile this seat discards onto (the next seat may take it). */
  discard: tileIdSchema.nullable(),
  discardCount: z.number().int().nonnegative(),
});

const sideSchema = z.strictObject({
  points: z.number().int(),
  /** Hands this side finished. */
  wins: z.number().int().nonnegative(),
});

const choices = {
  hands: z.number().int().positive(),
  startPoints: z.number().int().positive(),
  teams: z.boolean(),
};

const table = {
  title: z.string(),
  hand: z.number().int().positive(),
  hands: z.number().int().positive(),
  teams: z.boolean(),
  seats: z.array(seatSchema),
  sides: z.array(sideSchema),
  /** Whose turn it is (a seat id). */
  turn: seatIdSchema,
  /** The current player has drawn or taken and must now discard (or finish). */
  drew: z.boolean(),
  indicator: tileIdSchema,
  okey: faceSchema,
  deckCount: z.number().int().nonnegative(),
  /** The turn is played by a bot (a bot seat or an away player). */
  bot: z.boolean(),
  last: okeyEventSchema.nullable(),
};

export const okeyTallySchema = z.strictObject({
  /** The seat that finished; null when the middle ran out. */
  winner: seatIdSchema.nullable(),
  kind: z.enum(['normal', 'okey', 'pairs', 'both', 'draw']),
  /** The finishing hand in groups (shown to everyone once the hand is over). */
  groups: z.array(z.array(tileIdSchema)).nullable(),
  /** The tile put down to finish. */
  tile: tileIdSchema.nullable(),
  /** Points each side lost this hand (the indicator shown included). */
  lost: z.array(z.number().int().nonnegative()),
});
export type OkeyTally = z.infer<typeof okeyTallySchema>;

const result = {
  title: z.string(),
  teams: z.boolean(),
  endedBy: z.enum(['hands', 'zero', 'time']),
  ranking: z.array(
    z.strictObject({
      id: seatIdSchema,
      bot: z.number().int().positive().nullable(),
      side: z.number().int().nonnegative(),
      points: z.number().int(),
      wins: z.number().int().nonnegative(),
      place: z.number().int().positive(),
    }),
  ),
};

const setup = {
  title: z.string(),
  seats: z.array(seatSchema.pick({ id: true, bot: true })),
  /** The defaults the TV starts from. */
  defaults: z.strictObject(choices),
};

const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};

export const okeyHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('SETUP'), ...setup }),
  z.strictObject({ phase: z.literal('TURN'), ...table }),
  z.strictObject({ phase: z.literal('TALLY'), ...table, tally: okeyTallySchema }),
  z.strictObject({ phase: z.literal('END'), ...result }),
  z.strictObject(skipped),
]);
export type OkeyHostView = z.infer<typeof okeyHostViewSchema>;

const mine = {
  /** The rack's 30 slots (null for a spectator). */
  rack: z.array(tileIdSchema.nullable()).length(RACK_SLOTS).nullable(),
  /** The pile this player may take from (the left neighbour's), when it is their turn. */
  canDraw: z.boolean(),
  canTake: z.boolean(),
  /** Has drawn: may discard or finish. */
  canDiscard: z.boolean(),
  /** Holds the indicator's twin on the first turn of the hand. */
  canShow: z.boolean(),
};

export const okeyPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('SETUP'), ...setup, seated: z.boolean() }),
  z.strictObject({ phase: z.literal('TURN'), ...table, ...mine }),
  z.strictObject({ phase: z.literal('TALLY'), ...table, ...mine, tally: okeyTallySchema }),
  z.strictObject({ phase: z.literal('END'), ...result, mySide: z.number().int().nullable() }),
  z.strictObject(skipped),
]);
export type OkeyPlayerView = z.infer<typeof okeyPlayerViewSchema>;
