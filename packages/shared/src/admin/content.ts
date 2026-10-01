import { z } from 'zod';
import { paginationQuerySchema } from './api.js';

export const contentStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const gameTypeSchema = z.string().min(1).max(32);

// ── Categories ──────────────────────────────────────────────────────────────

export const categorySlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const categoryInputSchema = z.strictObject({
  slug: categorySlugSchema,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).nullable(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categorySchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  contentCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof categorySchema>;

// ── Content items (SPEC §6) ─────────────────────────────────────────────────

export const TIME_LIMIT_MIN_MS = 3_000;
export const TIME_LIMIT_MAX_MS = 120_000;
const timeLimitMsSchema = z.number().int().min(TIME_LIMIT_MIN_MS).max(TIME_LIMIT_MAX_MS);

export const tagSchema = z.string().trim().toLowerCase().min(1).max(32);

export const contentItemInputSchema = z.strictObject({
  gameType: gameTypeSchema,
  /** Validated by the game module's contentSchema on the server. */
  data: z.unknown(),
  categoryId: z.uuid().nullable(),
  difficulty: difficultySchema,
  tags: z.array(tagSchema).max(20),
  locale: z.string().regex(/^[a-z]{2}$/),
  status: contentStatusSchema,
  defaultTimeLimitMs: timeLimitMsSchema.nullable(),
  baseScore: z.number().int().min(0).max(10_000),
});
export type ContentItemInput = z.infer<typeof contentItemInputSchema>;

export const contentItemSchema = z.strictObject({
  id: z.uuid(),
  gameType: z.string(),
  data: z.unknown(),
  categoryId: z.uuid().nullable(),
  difficulty: difficultySchema,
  tags: z.array(z.string()),
  locale: z.string(),
  status: contentStatusSchema,
  defaultTimeLimitMs: z.number().int().nullable(),
  baseScore: z.number().int(),
  /** Media the content refers to (kept in sync with `data` on every save). */
  mediaIds: z.array(z.uuid()),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ContentItem = z.infer<typeof contentItemSchema>;

export const contentListQuerySchema = paginationQuerySchema.extend({
  gameType: gameTypeSchema.optional(),
  status: contentStatusSchema.optional(),
  categoryId: z.uuid().optional(),
  difficulty: difficultySchema.optional(),
  /** Free text, matched anywhere in the content. */
  q: z.string().trim().min(1).max(100).optional(),
});
export type ContentListQuery = z.infer<typeof contentListQuerySchema>;

// ── Media ───────────────────────────────────────────────────────────────────

export const mediaTypeSchema = z.enum(['IMAGE', 'VIDEO', 'AUDIO']);

export const mediaItemSchema = z.strictObject({
  id: z.uuid(),
  type: mediaTypeSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  altText: z.string().nullable(),
  originalName: z.string().nullable(),
  /** Content items using this file; media in use cannot be deleted. */
  usageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const altTextSchema = z.string().trim().max(200);

export const mediaUpdateSchema = z.strictObject({ altText: altTextSchema.nullable() });
export type MediaUpdate = z.infer<typeof mediaUpdateSchema>;

/** Accepted upload formats; every image is re-encoded to WebP without metadata (SPEC §9). */
export const UPLOAD_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ── Game packs (SPEC §6) ────────────────────────────────────────────────────

/** GamePackRound.contentSelection: fixed content ids, or a random draw by filters. */
export const contentSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('fixed'), contentIds: z.array(z.uuid()).min(1).max(50) }),
  z.strictObject({
    mode: z.literal('random'),
    categoryId: z.uuid().optional(),
    difficulty: difficultySchema.optional(),
  }),
]);
export type ContentSelection = z.infer<typeof contentSelectionSchema>;

export const packRoundInputSchema = z.strictObject({
  gameType: gameTypeSchema,
  contentSelection: contentSelectionSchema,
  /** For a fixed selection the server uses the number of listed items. */
  questionCount: z.number().int().min(1).max(50),
  timeLimitMs: timeLimitMsSchema.nullable(),
  scoreMultiplier: z.number().min(0.5).max(5),
  showScoreboardAfter: z.boolean(),
});
export type PackRoundInput = z.infer<typeof packRoundInputSchema>;

export const packInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable(),
  /** Publishing runs the pack checks; a draft may be incomplete. */
  status: contentStatusSchema,
  rounds: z.array(packRoundInputSchema).max(20),
});
export type PackInput = z.infer<typeof packInputSchema>;

export const packSchema = packInputSchema.extend({
  id: z.uuid(),
  rounds: z.array(packRoundInputSchema.extend({ id: z.uuid(), order: z.number().int() })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Pack = z.infer<typeof packSchema>;

export const packSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: contentStatusSchema,
  roundCount: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type PackSummary = z.infer<typeof packSummarySchema>;

/** What hosts see when picking a pack in the lobby (`GET /api/packs`, published only). */
export const publicPackSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  questionCount: z.number().int().nonnegative(),
  gameTypes: z.array(z.string()),
});
export type PublicPack = z.infer<typeof publicPackSchema>;

/** Pack checks run on publish; each failure is reported as an issue with one of these codes. */
export const packIssueCodeSchema = z.enum([
  'NO_ROUNDS',
  'UNKNOWN_GAME',
  'CONTENT_MISSING',
  'CONTENT_NOT_PUBLISHED',
  'NOT_ENOUGH_CONTENT',
]);
export type PackIssueCode = z.infer<typeof packIssueCodeSchema>;

// ── Dashboard ───────────────────────────────────────────────────────────────

export const adminOverviewSchema = z.strictObject({
  content: z.strictObject({ total: z.number().int(), published: z.number().int() }),
  categories: z.number().int(),
  media: z.number().int(),
  packs: z.strictObject({ total: z.number().int(), published: z.number().int() }),
  users: z.number().int(),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
