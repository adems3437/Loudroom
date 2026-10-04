import { foldText } from '@loudroom/game-sdk';
import { z } from 'zod';

export const SPY_GAME_TYPE = 'spy';
/** Fewer players leave the spy nowhere to hide (SPEC §7.11). */
export const SPY_MIN_PLAYERS = 4;
export const SPY_MIN_LOCATIONS = 8;
export const SPY_MAX_LOCATIONS = 30;

const locationIdSchema = z.string().min(1).max(32);

export const spyLocationSchema = z.strictObject({
  id: locationIdSchema,
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(16).optional(),
});
export type SpyLocation = z.infer<typeof spyLocationSchema>;

/**
 * A set of places (SPEC §7.11: locations are content). Each round picks one; the whole set is
 * everyone's list, which is also what the spy guesses from.
 */
export const spyContentSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(60),
    locations: z.array(spyLocationSchema).min(SPY_MIN_LOCATIONS).max(SPY_MAX_LOCATIONS),
  })
  .superRefine((content, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    content.locations.forEach((location, index) => {
      if (ids.has(location.id)) {
        ctx.addIssue({ code: 'custom', path: ['locations', index, 'id'], message: 'Duplicate id' });
      }
      const name = foldText(location.name);
      if (names.has(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['locations', index, 'name'],
          message: 'Duplicate name',
        });
      }
      ids.add(location.id);
      names.add(name);
    });
  });
export type SpyContent = z.infer<typeof spyContentSchema>;

export const spySettingsSchema = z.strictObject({
  /** Phones show each player's role card. */
  introMs: z.number().int().min(0).max(30_000),
  discussionMs: z.number().int().min(60_000).max(900_000),
  voteMs: z.number().int().min(10_000).max(120_000),
  /** From this many players there are two spies; 0: always one. */
  twoSpiesFrom: z.number().int().min(0).max(20),
  /** Each non-spy when the spy is caught or guesses wrong. */
  townPoints: z.number().int().min(0).max(10_000),
  /** Extra for having voted for a spy, when the spy is caught. */
  voterBonus: z.number().int().min(0).max(10_000),
  /** Each spy when not caught. */
  spyEscapePoints: z.number().int().min(0).max(10_000),
  /** The spy who names the place. */
  spyGuessPoints: z.number().int().min(0).max(10_000),
});
export type SpySettings = z.infer<typeof spySettingsSchema>;

export const SPY_DEFAULT_SETTINGS: SpySettings = {
  introMs: 10_000,
  discussionMs: 300_000,
  voteMs: 30_000,
  twoSpiesFrom: 8,
  townPoints: 500,
  voterBonus: 250,
  spyEscapePoints: 1_000,
  spyGuessPoints: 1_500,
};

const playerIdSchema = z.string().min(1).max(64);

export const spyInputSchema = z.discriminatedUnion('type', [
  /** The asking player names who they ask (the question itself is spoken). */
  z.strictObject({ type: z.literal('ask'), playerId: playerIdSchema }),
  /** Asks (or no longer asks) to vote before the time is up. */
  z.strictObject({ type: z.literal('requestVote'), value: z.boolean() }),
  z.strictObject({ type: z.literal('vote'), playerId: playerIdSchema }),
  /** A spy names the place; right or wrong, the round ends. */
  z.strictObject({ type: z.literal('guess'), locationId: locationIdSchema }),
]);
export type SpyInput = z.infer<typeof spyInputSchema>;

export const spyOutcomeSchema = z.enum([
  /** The most voted player was a spy. */
  'caught',
  /** The vote missed (or tied): the spies win. */
  'escaped',
  /** A spy named the place. */
  'guessed',
  /** A spy named the wrong place. */
  'wrongGuess',
]);
export type SpyOutcome = z.infer<typeof spyOutcomeSchema>;

const askSchema = z.strictObject({ from: playerIdSchema, to: playerIdSchema });

const table = {
  title: z.string(),
  /** The whole set in alphabetical order: it never tells which place was picked. */
  locations: z.array(spyLocationSchema),
  spyCount: z.number().int().positive(),
  /** Players in the round (connected when it began), in join order. */
  roster: z.array(playerIdSchema),
};
const discussion = {
  asker: playerIdSchema,
  /** Who asked the asker; they may not be asked straight back. */
  askedBy: playerIdSchema.nullable(),
  lastAsk: askSchema.nullable(),
  voteRequests: z.number().int().nonnegative(),
  /** Requests that start the vote early: more than half of the connected players. */
  votesNeeded: z.number().int().positive(),
};
const voting = {
  votedCount: z.number().int().nonnegative(),
  playerCount: z.number().int().nonnegative(),
};
const result = {
  location: spyLocationSchema,
  spies: z.array(playerIdSchema),
  outcome: spyOutcomeSchema,
  /** Votes per player, most first. Who voted for whom is never sent. */
  distribution: z.array(
    z.strictObject({ playerId: playerIdSchema, count: z.number().int().nonnegative() }),
  ),
  guess: z
    .strictObject({ playerId: playerIdSchema, locationId: locationIdSchema, correct: z.boolean() })
    .nullable(),
};
const skipped = {
  phase: z.literal('SKIPPED'),
  title: z.string(),
  minPlayers: z.number().int().positive(),
};

export const spyHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), ...table }),
  z.strictObject({ phase: z.literal('DISCUSS'), ...table, ...discussion }),
  z.strictObject({ phase: z.literal('VOTE'), ...table, ...voting }),
  z.strictObject({ phase: z.literal('REVEAL'), ...table, ...result }),
  z.strictObject(skipped),
]);
export type SpyHostView = z.infer<typeof spyHostViewSchema>;

/**
 * A player's secret: the place, or being a spy. Null for someone who joined during the round:
 * they watch.
 */
export const spyRoleSchema = z
  .discriminatedUnion('spy', [
    z.strictObject({ spy: z.literal(true) }),
    z.strictObject({ spy: z.literal(false), location: spyLocationSchema }),
  ])
  .nullable();
export type SpyRole = z.infer<typeof spyRoleSchema>;

export const spyPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), ...table, role: spyRoleSchema }),
  z.strictObject({
    phase: z.literal('DISCUSS'),
    ...table,
    ...discussion,
    role: spyRoleSchema,
    requestedVote: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal('VOTE'),
    ...table,
    ...voting,
    role: spyRoleSchema,
    /** Votes are final. */
    votedFor: playerIdSchema.nullable(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    ...table,
    ...result,
    role: spyRoleSchema,
    votedFor: playerIdSchema.nullable(),
    /** On the winning side; null for someone who watched. */
    won: z.boolean().nullable(),
  }),
  z.strictObject(skipped),
]);
export type SpyPlayerView = z.infer<typeof spyPlayerViewSchema>;
