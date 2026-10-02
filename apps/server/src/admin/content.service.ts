import { Injectable } from '@nestjs/common';
import { collectMediaIds } from '@loudroom/game-sdk';
import type {
  ApiIssue,
  ContentItem,
  ContentItemInput,
  ContentListQuery,
  ContentStatus,
} from '@loudroom/shared';
import { findGameModule } from '../game/registry.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiException, notFound, zodIssues } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const contentInclude = {
  media: { select: { id: true } },
  createdBy: { select: { displayName: true } },
} satisfies Prisma.ContentItemInclude;

type ContentRow = Prisma.ContentItemGetPayload<{ include: typeof contentInclude }>;

function toContentItem(row: ContentRow): ContentItem {
  return {
    id: row.id,
    gameType: row.gameType,
    data: row.data,
    categoryId: row.categoryId,
    difficulty: row.difficulty,
    tags: row.tags,
    locale: row.locale,
    status: row.status,
    defaultTimeLimitMs: row.defaultTimeLimitMs,
    baseScore: row.baseScore,
    mediaIds: row.media.map((media) => media.id),
    createdBy: row.createdBy?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Packs whose fixed content list contains `contentId`. */
export function packsWithContent(contentId: string, status?: ContentStatus) {
  return {
    rounds: {
      some: { contentSelection: { path: ['contentIds'], array_contains: [contentId] } },
    },
    ...(status ? { status } : {}),
  } satisfies Prisma.GamePackWhereInput;
}

/** Escapes LIKE wildcards so user text matches literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Game content (SPEC §6). `data` is validated with the game module's contentSchema on every
 * write, referenced media must exist, and content used by a pack cannot be deleted (or taken
 * out of a published pack by unpublishing it).
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ContentListQuery) {
    let ids: string[] | undefined;
    if (query.q) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "ContentItem" WHERE "data"::text ILIKE ${likePattern(query.q)}`,
      );
      ids = rows.map((row) => row.id);
    }
    const where: Prisma.ContentItemWhereInput = {
      ...(query.gameType ? { gameType: query.gameType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(ids ? { id: { in: ids } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contentItem.count({ where }),
      this.prisma.contentItem.findMany({
        where,
        include: contentInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toContentItem), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<ContentItem> {
    const row = await this.prisma.contentItem.findUnique({
      where: { id },
      include: contentInclude,
    });
    if (!row) throw notFound('Content');
    return toContentItem(row);
  }

  async create(input: ContentItemInput, userId: string): Promise<ContentItem> {
    const { data, mediaIds } = await this.validate(input);
    await this.assertCategory(input.categoryId);
    const row = await this.prisma.contentItem.create({
      data: {
        ...this.fields(input),
        data,
        createdById: userId,
        media: { connect: mediaIds.map((id) => ({ id })) },
      },
      include: contentInclude,
    });
    return toContentItem(row);
  }

  /**
   * Creates many items at once (import): every item is checked first, and if any is refused
   * nothing is saved. Issue paths start with `items.<index>`.
   */
  async createMany(inputs: readonly ContentItemInput[], userId: string): Promise<number> {
    const prepared: { input: ContentItemInput; data: Prisma.InputJsonValue; mediaIds: string[] }[] =
      [];
    const issues: ApiIssue[] = [];
    for (const [index, input] of inputs.entries()) {
      try {
        const checked = await this.validate(input);
        await this.assertCategory(input.categoryId);
        prepared.push({ input, ...checked });
      } catch (error) {
        if (!(error instanceof ApiException)) throw error;
        const own = error.issues ?? [{ path: [], code: error.code, message: error.message }];
        issues.push(...own.map((issue) => ({ ...issue, path: ['items', index, ...issue.path] })));
      }
    }
    if (issues.length > 0) {
      throw new ApiException(400, 'CONTENT_INVALID', 'Some items are invalid', issues);
    }
    await this.prisma.$transaction(
      prepared.map(({ input, data, mediaIds }) =>
        this.prisma.contentItem.create({
          data: {
            ...this.fields(input),
            data,
            createdById: userId,
            media: { connect: mediaIds.map((id) => ({ id })) },
          },
        }),
      ),
    );
    return prepared.length;
  }

  async update(id: string, input: ContentItemInput): Promise<ContentItem> {
    const existing = await this.prisma.contentItem.findUnique({ where: { id } });
    if (!existing) throw notFound('Content');
    if (existing.gameType !== input.gameType) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'The game type of content cannot change', [
        { path: ['gameType'], code: 'IMMUTABLE', message: 'The game type cannot change' },
      ]);
    }
    if (input.status === 'DRAFT' && existing.status === 'PUBLISHED') {
      const published = await this.prisma.gamePack.count({
        where: packsWithContent(id, 'PUBLISHED'),
      });
      if (published > 0) {
        throw new ApiException(409, 'IN_USE', 'Content in a published pack must stay published');
      }
    }
    const { data, mediaIds } = await this.validate(input);
    await this.assertCategory(input.categoryId);
    const row = await this.prisma.contentItem.update({
      where: { id },
      data: {
        ...this.fields(input),
        data,
        media: { set: mediaIds.map((mediaId) => ({ id: mediaId })) },
      },
      include: contentInclude,
    });
    return toContentItem(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.contentItem.findUnique({ where: { id } });
    if (!existing) throw notFound('Content');
    if ((await this.prisma.gamePack.count({ where: packsWithContent(id) })) > 0) {
      throw new ApiException(409, 'IN_USE', 'Content used by a game pack cannot be deleted');
    }
    // Played history keeps its own snapshot (SessionRound.contentSnapshot).
    await this.prisma.contentItem.delete({ where: { id } });
  }

  private fields(input: ContentItemInput) {
    return {
      gameType: input.gameType,
      categoryId: input.categoryId,
      difficulty: input.difficulty,
      tags: [...new Set(input.tags)],
      locale: input.locale,
      status: input.status,
      defaultTimeLimitMs: input.defaultTimeLimitMs,
      baseScore: input.baseScore,
    };
  }

  private async assertCategory(categoryId: string | null): Promise<void> {
    if (categoryId === null) return;
    if ((await this.prisma.category.count({ where: { id: categoryId } })) === 0) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Unknown category', [
        { path: ['categoryId'], code: 'NOT_FOUND', message: 'Unknown category' },
      ]);
    }
  }

  /** Module schema check, then every referenced media file must exist and be an image. */
  private async validate(
    input: ContentItemInput,
  ): Promise<{ data: Prisma.InputJsonValue; mediaIds: string[] }> {
    const module = findGameModule(input.gameType);
    if (!module) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Unknown game type', [
        { path: ['gameType'], code: 'UNKNOWN_GAME', message: 'Unknown game type' },
      ]);
    }
    const parsed = module.contentSchema.safeParse(input.data);
    if (!parsed.success) {
      throw new ApiException(
        400,
        'CONTENT_INVALID',
        'The content does not match the game',
        zodIssues(parsed.error, ['data']),
      );
    }
    const mediaIds = collectMediaIds(parsed.data);
    const found = await this.prisma.media.findMany({
      where: { id: { in: mediaIds }, type: 'IMAGE' },
      select: { id: true },
    });
    const missing = mediaIds.filter((id) => !found.some((media) => media.id === id));
    if (missing.length > 0) {
      throw new ApiException(
        400,
        'CONTENT_INVALID',
        'Referenced media not found',
        missing.map((id) => ({ path: ['data'], code: 'MEDIA_MISSING', message: id })),
      );
    }
    return { data: parsed.data as Prisma.InputJsonValue, mediaIds };
  }
}
