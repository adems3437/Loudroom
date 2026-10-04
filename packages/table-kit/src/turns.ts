import type { Effect, GamePlayer } from '@loudroom/game-sdk';
import { isAway } from './seats.js';

export type Direction = 1 | -1;

/** The seat `steps` turns after `seat`, going round in `direction`. */
export function nextSeat(seat: number, seatCount: number, direction: Direction = 1, steps = 1) {
  return (((seat + direction * steps) % seatCount) + seatCount) % seatCount;
}

export interface TurnTiming {
  /** A present player's time for the turn; when it runs out the game moves for them. */
  turnMs: number;
  /** A bot plays an away player's turn after this pause (SPEC: a bot may replace them). */
  bots: boolean;
  botDelayMs: number;
}

/** The phase for a seat's turn, and whether a bot will play it when it ends. */
export function turnPhase(
  phase: string,
  playerId: string,
  players: readonly GamePlayer[],
  timing: TurnTiming,
): { effect: Effect; bot: boolean } {
  const bot = timing.bots && isAway(playerId, players);
  return {
    effect: { type: 'phase', phase, durationMs: bot ? timing.botDelayMs : timing.turnMs },
    bot,
  };
}
