import {
  createRandom,
  type AnyGameModule,
  type GamePlayer,
  type Moderation,
  type PlayerStats,
  type RoundContext,
} from '@loudroom/game-sdk';
import type { StoredPlayer } from '../room/room.store.js';
import type { GameRecord, PlannedRound } from './game.record.js';
import { findGameModule } from './registry.js';

export function toGamePlayer(player: StoredPlayer): GamePlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    color: player.color,
    connected: player.connected,
  };
}

export const ZERO_STATS: PlayerStats = { score: 0, streak: 0, correctCount: 0, totalAnswerMs: 0 };

export function statsOf(game: GameRecord, playerId: string): PlayerStats {
  return game.stats[playerId] ?? ZERO_STATS;
}

export function currentRound(game: GameRecord): PlannedRound | null {
  return game.rounds[game.roundIndex] ?? null;
}

export function moduleFor(round: PlannedRound): AnyGameModule {
  const module = findGameModule(round.gameType);
  if (!module) throw new Error(`No game module for "${round.gameType}"`);
  return module;
}

/**
 * Moderation for view projections: views only show what inputs already stored, so they must
 * never check text themselves.
 */
export const NO_MODERATION_IN_VIEWS: Moderation = {
  isBlocked() {
    throw new Error('Moderation is checked on input, not in views');
  },
};

/** What a module sees for the current round (SPEC §5 RoundContext). */
export function roundContext(
  game: GameRecord,
  round: PlannedRound,
  players: readonly StoredPlayer[],
  now: number,
  moderation: Moderation,
): RoundContext<unknown, unknown> {
  return {
    roundId: round.roundId,
    roundIndex: game.roundIndex,
    content: round.content,
    settings: round.settings,
    scoreMultiplier: round.scoreMultiplier,
    players: players.map(toGamePlayer),
    stats: Object.fromEntries(players.map((player) => [player.id, statsOf(game, player.id)])),
    phase: game.phase,
    now,
    random: createRandom(round.seed),
    media: round.media ?? {},
    moderation,
  };
}
