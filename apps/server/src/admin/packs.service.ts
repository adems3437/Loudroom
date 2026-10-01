import { Injectable } from '@nestjs/common';
import {
  contentSelectionSchema,
  type ApiIssue,
  type Pack,
  type PackInput,
  type PackIssueCode,
  type PackRoundInput,
  type PackSummary,
  type PublicPack,
} from '@loudroom/shared';
import { findGameModule } from '../game/registry.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiException, notFound } from '../http/api-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const packInclude = { rounds: { orderBy: { order: 'asc' } } } satisfies Prisma.GamePackInclude;
type PackRow = Prisma.GamePackGetPayload<{ include: typeof packInclude }>;
type RoundRow = PackRow['rounds'][number];

function toRound(row: RoundRow): Pack['rounds'][number] {
  return {
    id: row.id,
    order: row.order,
    gameType: row.gameType,
    // Rows written before the schema existed fall back to an empty random draw.
    contentSelection: contentSelectionSchema.safeParse(row.contentSelection).data ?? {
      mode: 'random',
    },
    questionCount: row.questionCount,
    timeLimitMs: row.timeLimitMs,
    scoreMultiplier: row.scoreMultiplier,
    showScoreboardAfter: row.showScoreboardAfter,
  };
}

function toPack(row: PackRow): Pack {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    rounds: row.rounds.map(toRound),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const questionCount = (row: PackRow) =>
  row.rounds.reduce((sum, round) => sum + round.questionCount, 0);

function toSummary(row: PackRow): PackSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    roundCount: row.rounds.length,
    questionCount: questionCount(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A fixed list plays exactly its items, so its count is derived rather than trusted. */
function normalizeRound(round: PackRoundInput): PackRoundInput {
  const selection = round.contentSelection;
  if (selection.mode !== 'fixed') return round;
  const contentIds = [...new Set(selection.contentIds)];
  return {
    ...round,
    contentSelection: { mode: 'fixed', contentIds },
    questionCount: contentIds.length,
  };
}

const issue = (path: ApiIssue['path'], code: PackIssueCode, message: string): ApiIssue => ({
  path,
  code,
  message,
});

/**
 * Game packs (SPEC §6). Drafts may be incomplete; publishing checks that every round can be
 * played, and only published packs reach hosts.
 */
@Injectable()
export class PacksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PackSummary[]> {
    const rows = await this.prisma.gamePack.findMany({
      include: packInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toSummary);
  }

  /** Published packs for the host's lobby, newest first. */
  async listPublished(): Promise<PublicPack[]> {
    const rows = await this.prisma.gamePack.findMany({
      where: { status: 'PUBLISHED' },
      include: packInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      questionCount: questionCount(row),
      gameTypes: [...new Set(row.rounds.map((round) => round.gameType))],
    }));
  }

  async get(id: string): Promise<Pack> {
    const row = await this.prisma.gamePack.findUnique({ where: { id }, include: packInclude });
    if (!row) throw notFound('Game pack');
    return toPack(row);
  }

  async create(input: PackInput, userId: string): Promise<Pack> {
    const rounds = await this.prepare(input);
    const row = await this.prisma.gamePack.create({
      data: {
        name: input.name,
        description: input.description,
        status: input.status,
        createdById: userId,
        rounds: { create: rounds },
      },
      include: packInclude,
    });
    return toPack(row);
  }

  /** Replaces the pack and its rounds. Games already running keep their own snapshot. */
  async update(id: string, input: PackInput): Promise<Pack> {
    await this.get(id);
    const rounds = await this.prepare(input);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.gamePackRound.deleteMany({ where: { gamePackId: id } });
      return tx.gamePack.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          rounds: { create: rounds },
        },
        include: packInclude,
      });
    });
    return toPack(row);
  }

  /** Past games keep their pack snapshot, so a pack can always be deleted. */
  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.prisma.gamePack.delete({ where: { id } });
  }

  private async prepare(input: PackInput) {
    const rounds = input.rounds.map(normalizeRound);
    if (input.status === 'PUBLISHED') {
      const issues = await this.check(rounds);
      if (issues.length > 0) {
        throw new ApiException(400, 'PACK_INVALID', 'The pack cannot be published yet', issues);
      }
    }
    return rounds.map((round, index) => ({ ...round, order: index + 1, settings: {} }));
  }

  /** Every round must be playable with published content when the pack is published. */
  private async check(rounds: PackRoundInput[]): Promise<ApiIssue[]> {
    const issues: ApiIssue[] = [];
    if (rounds.length === 0) issues.push(issue(['rounds'], 'NO_ROUNDS', 'A pack needs a round'));

    for (const [index, round] of rounds.entries()) {
      if (!findGameModule(round.gameType)) {
        issues.push(issue(['rounds', index, 'gameType'], 'UNKNOWN_GAME', round.gameType));
        continue;
      }
      const selection = round.contentSelection;
      if (selection.mode === 'fixed') {
        const items = await this.prisma.contentItem.findMany({
          where: { id: { in: selection.contentIds }, gameType: round.gameType },
          select: { id: true, status: true },
        });
        selection.contentIds.forEach((contentId, position) => {
          const item = items.find((candidate) => candidate.id === contentId);
          const path = ['rounds', index, 'contentSelection', 'contentIds', position];
          if (!item) issues.push(issue(path, 'CONTENT_MISSING', contentId));
          else if (item.status !== 'PUBLISHED') {
            issues.push(issue(path, 'CONTENT_NOT_PUBLISHED', contentId));
          }
        });
      } else {
        const available = await this.prisma.contentItem.count({
          where: {
            gameType: round.gameType,
            status: 'PUBLISHED',
            ...(selection.categoryId ? { categoryId: selection.categoryId } : {}),
            ...(selection.difficulty ? { difficulty: selection.difficulty } : {}),
          },
        });
        if (available < round.questionCount) {
          issues.push(
            issue(['rounds', index, 'questionCount'], 'NOT_ENOUGH_CONTENT', String(available)),
          );
        }
      }
    }
    return issues;
  }
}
