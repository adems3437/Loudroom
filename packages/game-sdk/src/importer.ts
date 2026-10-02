import { foldText } from './text.js';

/**
 * CSV/XLSX import of a game's content (SPEC §15 Phase 9): each game names its columns and
 * turns a row into a content candidate; the server validates it with the game's schema.
 */
export interface ImportColumn {
  /** Header as written in templates; matched after Turkish folding ("Doğru" → "dogru"). */
  key: string;
  required: boolean;
  /** Example value for the template's sample row. */
  example: string;
}

/** A spreadsheet row: cell text by column key ('' when the column or cell is missing). */
export interface ImportRow {
  get(key: string): string;
}

export interface ContentImporter {
  columns: readonly ImportColumn[];
  /** Builds the content from a row; the result is checked with the content schema. */
  toContent(row: ImportRow): unknown;
  /** The column an issue at this content path comes from, for messages; null if unclear. */
  columnFor(path: readonly (string | number)[], content: unknown): string | null;
}

/** Column key of a header cell: Turkish-folded, words joined with `_` ("Gorsel Id" → "gorsel_id"). */
export function headerKey(header: string): string {
  return foldText(header.replace(/[-_]+/g, ' ')).replace(/ /g, '_');
}

/** A cell holding a list ("a | b | c"). */
export function splitList(value: string, separator = '|'): string[] {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * A number written the Turkish way: dot for thousands, comma for decimals ("1.234,5"). Plain
 * digits are fine too. Null when it is not a number.
 */
export function parseLocaleNumber(value: string): number | null {
  const text = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
