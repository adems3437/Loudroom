import { randomBytes, randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  collectMediaIds,
  createRandom,
  mediaFormatOf,
  seedFromString,
  type AnyGameModule,
  type MediaInfo,
} from '@loudroom/game-sdk';
import { contentSelectionSchema, type ContentSelection } from '@loudroom/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommandError } from '../realtime/command-error.js';
import type { PlannedRound } from './game.record.js';
import { findGameModule } from './registry.js';

const logger = new Logger('PackLoader');

export interface GamePlan {
  packId: string;
  packName: string;
  /** Stored as GameSession.packSnapshot: the pack as it was when the game started. */
  packSnapshot: unknown;
  rounds: PlannedRound[];
  minPlayers: number;
}

const objectSchema = z.record(z.string(), z.unknown());

/** Settings for one pack round: module defaults ← pack settings ← round settings. */
function roundSettings(
  module: AnyGameModule,
  packSettings: unknown,
  round: { settings: unknown; timeLimitMs: number | null },
): unknown {
  const fromPack = objectSchema.safeParse(packSettings).data?.[module.id];
  const defaults = objectSchema.parse(module.defaultSettings);
  return module.settingsSchema.parse({
    ...defaults,
    ...objectSchema.safeParse(fromPack).data,
    ...objectSchema.safeParse(round.settings).data,
    ...(round.timeLimitMs !== null && 'timeLimitMs' in defaults
      ? { timeLimitMs: round.timeLimitMs }
      : {}),
  });
}

/**
 * Turns a game pack into the concrete list of rounds to play: picks content, validates it with
 * the module's schema and snapshots it, so later edits to the pack never touch this game.
 */
@Injectable()
export class PackLoader {
  constructor(private readonly prisma: PrismaService) {}

  async plan(packId?: string): Promise<GamePlan> {
    const pack = await this.prisma.gamePack.findFirst({
      // Hosts only ever get published packs (SPEC §15 Phase 4).
      where: { status: 'PUBLISHED', ...(packId ? { id: packId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { rounds: { orderBy: { order: 'asc' } } },
    });
    if (!pack) throw new CommandError('PACK_NOT_FOUND', 'Game pack not found');

    const random = createRandom(randomInt(0, 2 ** 31));
    const rounds: PlannedRound[] = [];
    const segments: unknown[] = [];
    let minPlayers = 1;

    for (const [segmentIndex, packRound] of pack.rounds.entries()) {
      const module = findGameModule(packRound.gameType);
      const selection = contentSelectionSchema.safeParse(packRound.contentSelection);
      if (!module || !selection.success) {
        logger.warn(
          `Pack ${pack.id}: skipping round ${packRound.order} (unknown game or selection)`,
        );
        continue;
      }
      minPlayers = Math.max(minPlayers, module.capabilities.minPlayers);
      const settings = roundSettings(module, pack.settings, packRound);
      const items = await this.pickContent(module, selection.data, packRound.questionCount, random);

      const sizes = await this.mediaSizes(items.flatMap((item) => collectMediaIds(item.content)));

      items.forEach((item, index) => {
        const roundId = `r${rounds.length + 1}-${randomBytes(4).toString('hex')}`;
        rounds.push({
          roundId,
          segmentIndex,
          gameType: module.id,
          contentItemId: item.id,
          content: item.content,
          settings,
          scoreMultiplier: packRound.scoreMultiplier,
          showScoreboardAfter: packRound.showScoreboardAfter,
          lastInSegment: index === items.length - 1,
          seed: seedFromString(roundId),
          media: Object.fromEntries(
            collectMediaIds(item.content).flatMap((id) => {
              const size = sizes.get(id);
              return size ? [[id, size]] : [];
            }),
          ),
        });
      });
      segments.push({
        order: packRound.order,
        gameType: packRound.gameType,
        contentSelection: packRound.contentSelection,
        questionCount: packRound.questionCount,
        timeLimitMs: packRound.timeLimitMs,
        scoreMultiplier: packRound.scoreMultiplier,
        showScoreboardAfter: packRound.showScoreboardAfter,
        settings,
        contentItemIds: items.map((item) => item.id),
      });
    }

    if (rounds.length === 0) {
      throw new CommandError('PACK_NOT_FOUND', 'The game pack has no playable content');
    }
    return {
      packId: pack.id,
      packName: pack.name,
      packSnapshot: {
        id: pack.id,
        name: pack.name,
        description: pack.description,
        settings: pack.settings,
        rounds: segments,
      },
      rounds,
      minPlayers,
    };
  }

  /**
   * Media info from Media: image proportions (SPEC §7.4) and video lengths (quiz video
   * questions), with the stored format for building URLs.
   */
  private async mediaSizes(ids: string[]): Promise<Map<string, MediaInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.media.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, type: true, mimeType: true, width: true, height: true, durationMs: true },
    });
    return new Map(
      rows.flatMap((row): [string, MediaInfo][] =>
        row.width && row.height && row.type !== 'AUDIO'
          ? [
              [
                row.id,
                {
                  type: row.type === 'VIDEO' ? 'video' : 'image',
                  format: mediaFormatOf(row.mimeType),
                  width: row.width,
                  height: row.height,
                  durationMs: row.durationMs,
                },
              ],
            ]
          : [],
      ),
    );
  }

  private async pickContent(
    module: AnyGameModule,
    selection: ContentSelection,
    count: number,
    random: ReturnType<typeof createRandom>,
  ): Promise<{ id: string; content: unknown }[]> {
    const where = {
      gameType: module.id,
      status: 'PUBLISHED' as const,
      ...(selection.mode === 'fixed'
        ? { id: { in: selection.contentIds } }
        : {
            ...(selection.categoryId ? { categoryId: selection.categoryId } : {}),
            ...(selection.difficulty ? { difficulty: selection.difficulty } : {}),
          }),
    };
    const rows = await this.prisma.contentItem.findMany({
      where,
      select: { id: true, data: true },
    });
    const ordered =
      selection.mode === 'fixed'
        ? selection.contentIds.flatMap((id) => rows.filter((row) => row.id === id))
        : random.shuffle(rows);

    const valid: { id: string; content: unknown }[] = [];
    for (const row of ordered) {
      const parsed = module.contentSchema.safeParse(row.data);
      if (parsed.success) valid.push({ id: row.id, content: parsed.data });
      else logger.warn(`Content ${row.id} does not match the ${module.id} schema; skipped`);
      if (valid.length === count) break;
    }
    return valid;
  }
}
