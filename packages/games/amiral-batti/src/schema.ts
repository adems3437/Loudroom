import { z } from 'zod';

export const AMIRAL_GAME_TYPE = 'amiralBatti';
export const AMIRAL_MIN_PLAYERS = 2;

/** Board sizes and fleets (SPEC §7.16): classic, and smaller ones for quick games. */
export const FLEETS = {
  classic: { grid: 10, ships: [5, 4, 3, 3, 2] },
  small: { grid: 8, ships: [4, 3, 2, 2] },
  mini: { grid: 6, ships: [3, 2, 2] },
} as const;
export const fleetNameSchema = z.enum(['classic', 'small', 'mini']);
export type FleetName = z.infer<typeof fleetNameSchema>;

/** Content of an Amiral Battı match: only its name; the rules are round settings. */
export const amiralContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
});
export type AmiralContent = z.infer<typeof amiralContentSchema>;

export const amiralModeSchema = z.enum(['teams', 'tournament']);
export type AmiralMode = z.infer<typeof amiralModeSchema>;

export const amiralSettingsSchema = z.strictObject({
  /** Two teams on one pair of boards, or a knockout of one-on-one duels. */
  mode: amiralModeSchema,
  fleet: fleetNameSchema,
  /** A hit earns another shot. */
  extraShotOnHit: z.boolean(),
  placementMs: z.number().int().min(30_000).max(300_000),
  shotMs: z.number().int().min(5_000).max(120_000),
  bots: z.boolean(),
  botDelayMs: z.number().int().min(500).max(5_000),
  /** Teams: each member of the winning / losing team. */
  winPoints: z.number().int().min(0).max(10_000),
  losePoints: z.number().int().min(0).max(10_000),
  /** Tournament places. */
  championPoints: z.number().int().min(0).max(10_000),
  finalistPoints: z.number().int().min(0).max(10_000),
  semifinalPoints: z.number().int().min(0).max(10_000),
  otherPoints: z.number().int().min(0).max(10_000),
});
export type AmiralSettings = z.infer<typeof amiralSettingsSchema>;

export const AMIRAL_DEFAULT_SETTINGS: AmiralSettings = {
  mode: 'teams',
  fleet: 'classic',
  extraShotOnHit: false,
  placementMs: 90_000,
  shotMs: 20_000,
  bots: true,
  botDelayMs: 1_500,
  winPoints: 1_000,
  losePoints: 300,
  championPoints: 1_000,
  finalistPoints: 600,
  semifinalPoints: 400,
  otherPoints: 200,
};

const coordinate = z.number().int().min(0).max(9);

/** A ship's top-left cell and direction; its length comes from its place in the fleet. */
export const placementSchema = z.strictObject({
  x: coordinate,
  y: coordinate,
  vertical: z.boolean(),
});
export type Placement = z.infer<typeof placementSchema>;

export const amiralInputSchema = z.discriminatedUnion('type', [
  /** The whole fleet, ships in fleet order (longest first). */
  z.strictObject({ type: z.literal('place'), ships: z.array(placementSchema).min(1).max(5) }),
  z.strictObject({ type: z.literal('shoot'), x: coordinate, y: coordinate }),
]);
export type AmiralInput = z.infer<typeof amiralInputSchema>;

const playerIdSchema = z.string().min(1).max(64);

export const sunkShipSchema = placementSchema.extend({ size: z.number().int().min(2).max(5) });
export type SunkShip = z.infer<typeof sunkShipSchema>;

/** A shot as recorded when fired: views never look at the fleet itself. */
export const shotSchema = z.strictObject({
  x: coordinate,
  y: coordinate,
  hit: z.boolean(),
  /** The ship this shot sank, revealed to everyone. */
  sunk: sunkShipSchema.nullable(),
});
export type Shot = z.infer<typeof shotSchema>;

const sideSchema = z.strictObject({
  side: z.number().int().nonnegative(),
  members: z.array(playerIdSchema),
  /** Places the fleet: the first member. */
  captain: playerIdSchema,
  ready: z.boolean(),
});

const duelSideSchema = z.strictObject({
  side: z.number().int().nonnegative(),
  /** Shots fired at this side's board. */
  shotsTaken: z.array(shotSchema),
  shipsLeft: z.number().int().nonnegative(),
});

const duelSchema = z.strictObject({
  id: z.string(),
  round: z.number().int().positive(),
  a: duelSideSchema,
  /** Null for a bye. */
  b: duelSideSchema.nullable(),
  turn: z.enum(['a', 'b']),
  /** Who fires next for the side to move. */
  shooter: playerIdSchema.nullable(),
  /** The side to move has not fired in this step yet. */
  waiting: z.boolean(),
  winner: z.enum(['a', 'b']).nullable(),
});
export type DuelView = z.infer<typeof duelSchema>;

const common = {
  title: z.string(),
  mode: amiralModeSchema,
  grid: z.number().int().positive(),
  ships: z.array(z.number().int()),
  sides: z.array(sideSchema),
  /** Duels of the current round (all of them for teams: one). */
  duels: z.array(duelSchema),
  bracketRound: z.number().int().positive(),
  bot: z.boolean(),
};
const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};
const ended = {
  title: z.string(),
  mode: amiralModeSchema,
  sides: z.array(sideSchema),
  duels: z.array(duelSchema),
  /** Players in final order (tournament) or the winning team first. */
  ranking: z.array(
    z.strictObject({ playerId: playerIdSchema, place: z.number().int().positive() }),
  ),
  winners: z.array(playerIdSchema),
};

export const amiralHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('PLACE'), ...common }),
  z.strictObject({ phase: z.literal('BATTLE'), ...common }),
  z.strictObject({ phase: z.literal('END'), ...ended }),
  z.strictObject(skipped),
]);
export type AmiralHostView = z.infer<typeof amiralHostViewSchema>;

const mine = {
  /** This player's side; null for a spectator. */
  mySide: z.number().int().nonnegative().nullable(),
  /** The own (team's) fleet; only its members ever get it. */
  fleet: z.array(placementSchema).nullable(),
  canPlace: z.boolean(),
  /** The id of this player's duel this round (null when out or watching). */
  myDuel: z.string().nullable(),
  canShoot: z.boolean(),
};

export const amiralPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('PLACE'), ...common, ...mine }),
  z.strictObject({ phase: z.literal('BATTLE'), ...common, ...mine }),
  z.strictObject({ phase: z.literal('END'), ...ended, mySide: mine.mySide }),
  z.strictObject(skipped),
]);
export type AmiralPlayerView = z.infer<typeof amiralPlayerViewSchema>;
