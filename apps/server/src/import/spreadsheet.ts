import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';

export type SpreadsheetProblem = 'NOT_UTF8' | 'UNREADABLE' | 'EMPTY';

/** A file the importer cannot read; `problem` tells the admin why. */
export class SpreadsheetError extends Error {
  constructor(readonly problem: SpreadsheetProblem) {
    super(`Spreadsheet problem: ${problem}`);
  }
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function isXlsx(buffer: Buffer): boolean {
  return ZIP_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

/** A cell as text; numbers are written the Turkish way, so "8849,5" and 8849.5 read alike. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value).replace('.', ',');
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

/** The delimiter used in the header line: Turkish Excel writes ";", others "," or a tab. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const outsideQuotes = firstLine.replace(/"[^"]*"/g, '');
  const counts = [';', ',', '\t'].map((delimiter) => ({
    delimiter,
    count: outsideQuotes.split(delimiter).length - 1,
  }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function readCsv(buffer: Buffer): string[][] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Excel's "CSV" in a Turkish locale is Windows-1254: refused with a clear reason.
    throw new SpreadsheetError('NOT_UTF8');
  }
  text = text.replace(/^\uFEFF/, '');
  try {
    const rows: unknown = parse(text, {
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    });
    return (rows as unknown[][]).map((row) => row.map(cellText));
  } catch {
    throw new SpreadsheetError('UNREADABLE');
  }
}

/**
 * The first sheet of an XLSX file, or a CSV file, as rows of trimmed text cells; empty rows
 * are dropped. The first row is the header.
 */
export async function readSpreadsheet(buffer: Buffer): Promise<string[][]> {
  let rows: string[][];
  if (isXlsx(buffer)) {
    try {
      rows = (await readSheet(buffer)).map((row) => row.map(cellText));
    } catch {
      throw new SpreadsheetError('UNREADABLE');
    }
  } else {
    rows = readCsv(buffer);
  }
  const filled = rows.filter((row) => row.some((cell) => cell !== ''));
  if (filled.length === 0) throw new SpreadsheetError('EMPTY');
  return filled;
}
