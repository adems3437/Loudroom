import type { GameStatus, HostGameState, PlayerGameState, Standing } from '@loudroom/shared';
import type { RoomSnapshot } from '../room/room.store.js';
import {
  currentRound,
  moduleFor,
  NO_MODERATION_IN_VIEWS,
  publicClock,
  roundContext,
  statsOf,
} from './game.context.js';
import type { GameRecord } from './game.record.js';

/**
 * Leaderboard: by score, ties by total answer time (faster first, SPEC §7), then join order.
 */
export function standingsOf({ players, game }: RoomSnapshot): Standing[] {
  if (!game) return [];
  const delta = new Map(game.lastResults.map((result) => [result.playerId, result.points]));
  return [...players]
    .sort(
      (a, b) =>
        b.score - a.score ||
        statsOf(game, a.id).totalAnswerMs - statsOf(game, b.id).totalAnswerMs ||
        a.joinedAt - b.joinedAt,
    )
    .map((player, index) => ({
      playerId: player.id,
      score: player.score,
      rank: index + 1,
      delta: delta.get(player.id) ?? 0,
    }));
}

/** The status the game is in, looking through a pause. */
function effectiveStatus(status: GameStatus, game: GameRecord): GameStatus {
  return status === 'PAUSED' && game.paused ? game.paused.resumeStatus : status;
}

function commonState(snapshot: RoomSnapshot, game: GameRecord) {
  const status = snapshot.room.status as GameStatus;
  const effective = effectiveStatus(status, game);
  return {
    status,
    effective,
    base: {
      status,
      roundIndex: game.roundIndex,
      roundCount: game.rounds.length,
      countdown: effective === 'STARTING' ? game.countdown : null,
      // A hidden phase clock stays hidden while paused too.
      pausedRemainingMs:
        status === 'PAUSED' && !game.phase?.hidden ? (game.paused?.remainingMs ?? null) : null,
      standings: standingsOf(snapshot),
    },
  };
}

/** Module view for the round on screen, or null between rounds. */
function roundView(
  snapshot: RoomSnapshot,
  game: GameRecord,
  effective: GameStatus,
  view: (ctx: ReturnType<typeof roundContext>) => unknown,
) {
  const round = currentRound(game);
  if (!round || game.moduleState == null) return null;
  if (effective !== 'PLAYING' && effective !== 'ROUND_RESULT') return null;
  const ctx = roundContext(game, round, snapshot.players, Date.now(), NO_MODERATION_IN_VIEWS);
  return {
    roundId: round.roundId,
    gameType: round.gameType,
    phase: game.phase ? publicClock(game.phase) : null,
    view: view(ctx),
  };
}

export function hostGameState(snapshot: RoomSnapshot, game: GameRecord): HostGameState {
  const { effective, base, status } = commonState(snapshot, game);
  const round = currentRound(game);
  return {
    role: 'host',
    ...base,
    round: roundView(snapshot, game, effective, (ctx) =>
      round ? moduleFor(round).getHostView(game.moduleState, ctx) : null,
    ),
    canAdvance: status === 'ROUND_RESULT' || status === 'SCOREBOARD',
  };
}

export function playerGameState(
  snapshot: RoomSnapshot,
  game: GameRecord,
  playerId: string,
): PlayerGameState {
  const { effective, base } = commonState(snapshot, game);
  const round = currentRound(game);
  const last = game.lastResults.find((result) => result.playerId === playerId);
  return {
    role: 'player',
    ...base,
    round: roundView(snapshot, game, effective, (ctx) =>
      round ? moduleFor(round).getPlayerView(game.moduleState, playerId, ctx) : null,
    ),
    lastRound: last ? { points: last.points, correct: last.correct } : null,
  };
}
