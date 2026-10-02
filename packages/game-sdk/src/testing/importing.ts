import type { AnyGameModule } from '../module.js';
import { headerKey, type ImportRow } from '../importer.js';

/** A spreadsheet row from header → value pairs, as the server builds it. */
export function importRow(cells: Record<string, string>): ImportRow {
  const byKey = new Map(
    Object.entries(cells).map(([header, value]) => [headerKey(header), value.trim()]),
  );
  return { get: (key) => byKey.get(key) ?? '' };
}

/**
 * Runs a row through a game's importer and content schema: the content when valid, otherwise
 * the columns the issues point at (each once).
 */
export function importThrough(
  module: AnyGameModule,
  cells: Record<string, string>,
): { ok: true; content: unknown } | { ok: false; columns: (string | null)[] } {
  const importer = module.importer;
  if (!importer) throw new Error(`${module.id} has no importer`);
  const candidate = importer.toContent(importRow(cells));
  const parsed = module.contentSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, content: parsed.data };
  const columns = parsed.error.issues.map((issue) =>
    importer.columnFor(
      issue.path.filter((key): key is string | number => typeof key !== 'symbol'),
      candidate,
    ),
  );
  return { ok: false, columns: [...new Set(columns)] };
}
