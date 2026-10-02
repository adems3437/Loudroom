import { z } from 'zod';
import { contentItemInputSchema } from './content.js';

/** Largest file and number of data rows one import takes (SPEC §15 Phase 9). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 1_000;

/** Columns every game's import file may have, next to the game's own. */
export const IMPORT_COMMON_COLUMNS = ['kategori', 'zorluk', 'etiketler', 'durum'] as const;

/**
 * Why a row cannot be imported. `REQUIRED`: a required column is empty; `INVALID`: the game's
 * content rules refuse the value; the others concern the common columns or uploaded media.
 */
export const importIssueCodeSchema = z.enum([
  'REQUIRED',
  'INVALID',
  'CATEGORY_UNKNOWN',
  'DIFFICULTY_INVALID',
  'STATUS_INVALID',
  'TAGS_INVALID',
  'MEDIA_MISSING',
]);
export type ImportIssueCode = z.infer<typeof importIssueCodeSchema>;

export const importRowSchema = z.strictObject({
  /** Row number in the spreadsheet (the header is row 1). */
  row: z.number().int().positive(),
  ok: z.boolean(),
  /** The first cells, so the row can be recognised. */
  preview: z.string(),
  issues: z.array(z.strictObject({ column: z.string().nullable(), code: importIssueCodeSchema })),
  /** What would be saved; only for valid rows. */
  input: contentItemInputSchema.nullable(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importPreviewSchema = z.strictObject({
  gameType: z.string(),
  rows: z.array(importRowSchema),
  /** Headers that are neither the game's nor common columns (ignored). */
  unknownColumns: z.array(z.string()),
  /** Required columns missing from the header row. */
  missingColumns: z.array(z.string()),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

/** The valid rows of a preview, sent back to be saved (checked again on the server). */
export const importCommitSchema = z.strictObject({
  items: z.array(contentItemInputSchema).min(1).max(IMPORT_MAX_ROWS),
});
export type ImportCommit = z.infer<typeof importCommitSchema>;

export const importCommitResultSchema = z.strictObject({
  created: z.number().int().nonnegative(),
});

export const importTemplateQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
});
