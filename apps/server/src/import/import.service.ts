import { Injectable } from '@nestjs/common';
import {
  collectMediaIds,
  foldText,
  headerKey,
  type AnyGameModule,
  type ContentImporter,
} from '@loudroom/game-sdk';
import {
  IMPORT_COMMON_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  tagSchema,
  type ContentItemInput,
  type ContentStatus,
  type Difficulty,
  type ImportIssueCode,
  type ImportPreview,
  type ImportRow,
} from '@loudroom/shared';
import writeXlsxFile from 'write-excel-file/node';
import { ContentService } from '../admin/content.service.js';
import { findGameModule } from '../game/registry.js';
import { ApiException } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readSpreadsheet, SpreadsheetError } from './spreadsheet.js';

const DIFFICULTIES: Record<string, Difficulty> = {
  kolay: 'EASY',
  orta: 'MEDIUM',
  zor: 'HARD',
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
};
const STATUSES: Record<string, ContentStatus> = {
  taslak: 'DRAFT',
  yayinda: 'PUBLISHED',
  draft: 'DRAFT',
  published: 'PUBLISHED',
};
const COMMON_EXAMPLES: Record<(typeof IMPORT_COMMON_COLUMNS)[number], string> = {
  kategori: 'genel-kultur',
  zorluk: 'orta',
  etiketler: 'örnek, ilk',
  durum: 'taslak',
};

function invalidFile(problem: string): ApiException {
  return new ApiException(400, 'IMPORT_INVALID', 'The file cannot be imported', [
    { path: ['file'], code: problem, message: problem },
  ]);
}

/** The game's module and importer, or a 404 for games without import. */
function importerFor(gameType: string): { module: AnyGameModule; importer: ContentImporter } {
  const module = findGameModule(gameType);
  if (!module?.importer) {
    throw new ApiException(404, 'NOT_FOUND', 'No import for this game type');
  }
  return { module, importer: module.importer };
}

/** "a;b" quoting for CSV cells (Turkish Excel opens semicolon-separated files). */
function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV/XLSX import of content (SPEC §15 Phase 9): a preview that checks every row with the
 * game's importer and schema and saves nothing, then the save of the valid rows.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
  ) {}

  async preview(gameType: string, file: Buffer): Promise<ImportPreview> {
    const { module, importer } = importerFor(gameType);
    if (file.length > IMPORT_MAX_BYTES) throw invalidFile('TOO_LARGE');
    let table: string[][];
    try {
      table = await readSpreadsheet(file);
    } catch (error) {
      if (error instanceof SpreadsheetError) throw invalidFile(error.problem);
      throw error;
    }
    const [header = [], ...body] = table;
    if (body.length > IMPORT_MAX_ROWS) throw invalidFile('TOO_MANY_ROWS');

    const keys = header.map(headerKey);
    const known = new Set<string>([
      ...importer.columns.map((c) => c.key),
      ...IMPORT_COMMON_COLUMNS,
    ]);
    const categories = await this.categoryLookup();
    const existingMedia = await this.existingMedia(body, keys);

    const rows = body.map((cells, index): ImportRow => {
      const get = (key: string) => {
        const column = keys.indexOf(key);
        return column < 0 ? '' : (cells[column] ?? '').trim();
      };
      const issues: { column: string | null; code: ImportIssueCode }[] = [];
      const flag = (column: string | null, code: ImportIssueCode) => {
        if (!issues.some((issue) => issue.column === column)) issues.push({ column, code });
      };
      for (const column of importer.columns) {
        if (column.required && get(column.key) === '') flag(column.key, 'REQUIRED');
      }
      const candidate = importer.toContent({ get });
      const parsed = module.contentSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path.filter((key): key is string | number => typeof key !== 'symbol');
          flag(importer.columnFor(path, candidate), 'INVALID');
        }
      } else {
        const mediaColumn = importer.columns.some((c) => c.key === 'gorsel_id')
          ? 'gorsel_id'
          : null;
        if (collectMediaIds(parsed.data).some((id) => !existingMedia.has(id))) {
          flag(mediaColumn, 'MEDIA_MISSING');
        }
      }

      const categoryText = get('kategori');
      const categoryId = categoryText ? (categories.get(foldText(categoryText)) ?? null) : null;
      if (categoryText && !categoryId) flag('kategori', 'CATEGORY_UNKNOWN');
      const difficultyText = foldText(get('zorluk'));
      const difficulty = difficultyText ? DIFFICULTIES[difficultyText] : 'MEDIUM';
      if (!difficulty) flag('zorluk', 'DIFFICULTY_INVALID');
      const statusText = foldText(get('durum')).replace(/ /g, '');
      const status = statusText ? STATUSES[statusText] : 'DRAFT';
      if (!status) flag('durum', 'STATUS_INVALID');
      const tags = get('etiketler')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const parsedTags = tags.map((tag) => tagSchema.safeParse(tag));
      if (tags.length > 20 || parsedTags.some((tag) => !tag.success))
        flag('etiketler', 'TAGS_INVALID');

      const ok = issues.length === 0 && parsed.success && difficulty && status;
      const input: ContentItemInput | null = ok
        ? {
            gameType: module.id,
            data: parsed.data,
            categoryId,
            difficulty,
            tags: parsedTags.flatMap((tag) => (tag.success ? [tag.data] : [])),
            locale: 'tr',
            status,
            defaultTimeLimitMs: null,
            baseScore: 1000,
          }
        : null;
      return {
        row: index + 2,
        ok: input !== null,
        preview: cells.filter(Boolean).slice(0, 3).join(' · ').slice(0, 80),
        issues,
        input,
      };
    });

    return {
      gameType: module.id,
      rows,
      unknownColumns: header.filter((_, index) => !known.has(keys[index] ?? '')),
      missingColumns: importer.columns
        .filter((column) => column.required && !keys.includes(column.key))
        .map((column) => column.key),
    };
  }

  /** Saves the valid rows of a preview; everything is checked again, all or nothing. */
  async commit(gameType: string, items: readonly ContentItemInput[], userId: string) {
    importerFor(gameType);
    if (items.some((item) => item.gameType !== gameType)) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Items of another game type', [
        { path: ['items'], code: 'GAME_TYPE', message: 'All items must be of this game type' },
      ]);
    }
    return { created: await this.content.createMany(items, userId) };
  }

  /** A template with the columns and one example row (CSV with ";" and a BOM, or XLSX). */
  async template(gameType: string, format: 'csv' | 'xlsx'): Promise<Buffer> {
    const { importer } = importerFor(gameType);
    const header = [...importer.columns.map((c) => c.key), ...IMPORT_COMMON_COLUMNS];
    const example = [
      ...importer.columns.map((c) => c.example),
      ...IMPORT_COMMON_COLUMNS.map((key) => COMMON_EXAMPLES[key]),
    ];
    if (format === 'csv') {
      const lines = [header, example].map((row) => row.map(csvCell).join(';'));
      return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
    }
    return writeXlsxFile([
      header.map((value) => ({ value, fontWeight: 'bold' as const })),
      example.map((value) => ({ value })),
    ]).toBuffer();
  }

  /** Categories by folded slug and name ("Genel Kültür" = "genel-kultur" = "genel kultur"). */
  private async categoryLookup(): Promise<Map<string, string>> {
    const rows = await this.prisma.category.findMany({
      select: { id: true, slug: true, name: true },
    });
    const lookup = new Map<string, string>();
    for (const row of rows) {
      lookup.set(foldText(row.slug.replace(/-/g, ' ')), row.id);
      lookup.set(foldText(row.slug), row.id);
      lookup.set(foldText(row.name), row.id);
    }
    return lookup;
  }

  /** Media ids named in the file that exist (images). */
  private async existingMedia(body: string[][], keys: string[]): Promise<Set<string>> {
    const column = keys.indexOf('gorsel_id');
    if (column < 0) return new Set();
    const ids = body
      .map((cells) => (cells[column] ?? '').trim())
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.media.findMany({
      where: { id: { in: [...new Set(ids)] }, type: 'IMAGE' },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
