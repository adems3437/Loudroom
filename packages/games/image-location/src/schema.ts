import { mediaIdSchema } from '@loudroom/game-sdk';
import { z } from 'zod';

export const IMAGE_LOCATION_GAME_TYPE = 'imageLocation';

/** A point on the image, 0..1 across its natural width and height (SPEC §7.4). */
export const imagePointSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type ImagePointValue = z.infer<typeof imagePointSchema>;

/**
 * Content of one question: an uploaded image and the point to find. Distances are measured in
 * fractions of the image's longer side; `radius` widens the full-score area for big targets.
 */
export const imageLocationContentSchema = z.strictObject({
  question: z.string().trim().min(1).max(300),
  mediaId: mediaIdSchema,
  target: imagePointSchema,
  radius: z.number().min(0.005).max(0.5).optional(),
});
export type ImageLocationContent = z.infer<typeof imageLocationContentSchema>;

export const imageLocationSettingsSchema = z.strictObject({
  introMs: z.number().int().min(0).max(15_000),
  timeLimitMs: z.number().int().min(3_000).max(120_000),
  baseScore: z.number().int().min(0).max(10_000),
  /** Within this distance (of the longer side) a pin gets the full score. */
  fullScoreRadius: z.number().min(0.005).max(0.3),
  /** From this distance on a pin gets nothing; in between the score eases off. */
  zeroScoreDistance: z.number().min(0.02).max(1),
});
export type ImageLocationSettings = z.infer<typeof imageLocationSettingsSchema>;

export const IMAGE_LOCATION_DEFAULT_SETTINGS: ImageLocationSettings = {
  introMs: 3_000,
  timeLimitMs: 25_000,
  baseScore: 1_000,
  fullScoreRadius: 0.03,
  zeroScoreDistance: 0.3,
};

export const imageLocationInputSchema = z.strictObject({ point: imagePointSchema });
export type ImageLocationInput = z.infer<typeof imageLocationInputSchema>;

/** The image with its natural size, so screens can place pins before it has loaded. */
const imageViewSchema = z.strictObject({
  mediaId: mediaIdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImageView = z.infer<typeof imageViewSchema>;

const counts = {
  answeredCount: z.number().int().nonnegative(),
  /** Connected players who can answer. */
  playerCount: z.number().int().nonnegative(),
};
const answer = {
  target: imagePointSchema,
  /** Full-score radius in fractions of the longer side (for the ring around the target). */
  radius: z.number().positive(),
};

/** Host views per phase. The target and the pins exist only in REVEAL (SPEC §3, §9). */
export const imageLocationHostViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string(), image: imageViewSchema }),
  z.strictObject({
    phase: z.literal('ANSWERING'),
    question: z.string(),
    image: imageViewSchema,
    ...counts,
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    question: z.string(),
    image: imageViewSchema,
    ...counts,
    ...answer,
    /** Closest first; ties by answer time. */
    pins: z.array(
      z.strictObject({
        playerId: z.string(),
        point: imagePointSchema,
        /** In fractions of the longer side. */
        distance: z.number().nonnegative(),
        /** Within the full-score radius. */
        inside: z.boolean(),
      }),
    ),
  }),
]);
export type ImageLocationHostView = z.infer<typeof imageLocationHostViewSchema>;

export const imageLocationPlayerViewSchema = z.discriminatedUnion('phase', [
  z.strictObject({ phase: z.literal('INTRO'), question: z.string() }),
  z.strictObject({
    phase: z.literal('ANSWERING'),
    question: z.string(),
    image: imageViewSchema,
    /** The player's sent pin; once sent it is final. */
    pin: imagePointSchema.nullable(),
  }),
  z.strictObject({
    phase: z.literal('REVEAL'),
    question: z.string(),
    image: imageViewSchema,
    ...answer,
    pin: imagePointSchema.nullable(),
    distance: z.number().nonnegative().nullable(),
    /** Within the full-score radius; null without a pin. */
    correct: z.boolean().nullable(),
    rank: z.number().int().positive().nullable(),
    answeredCount: z.number().int().nonnegative(),
  }),
]);
export type ImageLocationPlayerView = z.infer<typeof imageLocationPlayerViewSchema>;
