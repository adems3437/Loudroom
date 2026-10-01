import { z } from 'zod';

/** Error codes of the REST API. HTTP status carries the class, `code` the exact reason. */
export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_FAILED',
  'INVALID_CREDENTIALS',
  'RATE_LIMITED',
  'NOT_FOUND',
  /** The record is used elsewhere (SPEC §15 Phase 4: content and media in use are kept). */
  'IN_USE',
  'EMAIL_TAKEN',
  'SLUG_TAKEN',
  'CONTENT_INVALID',
  'PACK_INVALID',
  'MEDIA_UNSUPPORTED',
  'MEDIA_TOO_LARGE',
  'LAST_ADMIN',
  'SELF_CHANGE',
  'WRONG_PASSWORD',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** One problem in a request body; `path` points at the field. */
export const apiIssueSchema = z.strictObject({
  path: z.array(z.union([z.string(), z.number()])),
  /** Machine-readable reason, e.g. a pack check (`NOT_ENOUGH_CONTENT`) or a zod issue code. */
  code: z.string(),
  message: z.string(),
});
export type ApiIssue = z.infer<typeof apiIssueSchema>;

/** Body of every failed REST response. */
export const apiErrorSchema = z.strictObject({
  code: apiErrorCodeSchema,
  message: z.string(),
  issues: z.array(apiIssueSchema).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Unsafe admin requests repeat the session's CSRF token in this header (SPEC §9). */
export const CSRF_HEADER = 'x-csrf-token';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}
