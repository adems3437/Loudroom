import type { GamePlayer } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import {
  dealRound,
  isAway,
  nextSeat,
  seatPlayers,
  shuffleWith,
  sideOf,
  sideSeats,
  take,
  turnPhase,
} from './index.js';

const player = (id: string, connected = true): GamePlayer => ({
  id,
  nickname: id,
  avatar: 'star',
  color: '#fff',
  connected,
});

describe('seats', () => {
  it('seats connected players in join order; the rest and the offline watch', () => {
    const players = [player('a'), player('b', false), player('c'), player('d'), player('e')];
    expect(seatPlayers(players, 3)).toEqual({ seats: ['a', 'c', 'd'], spectators: ['b', 'e'] });
  });

  it('knows who is away and which side a seat plays for', () => {
    const players = [player('a'), player('b', false)];
    expect([isAway('a', players), isAway('b', players), isAway('gone', players)]).toEqual([
      false,
      true,
      true,
    ]);
    expect([0, 1, 2, 3].map((seat) => sideOf(seat, true))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2].map((seat) => sideOf(seat, false))).toEqual([0, 1, 2]);
    expect(sideSeats(4, true)).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(sideSeats(3, false)).toEqual([[0], [1], [2]]);
  });
});

describe('turns', () => {
  it('goes round both ways and skips', () => {
    expect(nextSeat(3, 4)).toBe(0);
    expect(nextSeat(0, 4, -1)).toBe(3);
    expect(nextSeat(1, 4, 1, 2)).toBe(3);
    expect(nextSeat(1, 2, -1, 2)).toBe(1);
  });

  it('gives an away player a bot after a short pause, a present one the full time', () => {
    const players = [player('a'), player('b', false)];
    const timing = { turnMs: 30_000, bots: true, botDelayMs: 1_500 };
    expect(turnPhase('TURN', 'a', players, timing)).toEqual({
      effect: { type: 'phase', phase: 'TURN', durationMs: 30_000 },
      bot: false,
    });
    expect(turnPhase('TURN', 'b', players, timing)).toMatchObject({
      effect: { durationMs: 1_500 },
      bot: true,
    });
    expect(turnPhase('TURN', 'b', players, { ...timing, bots: false })).toMatchObject({
      effect: { durationMs: 30_000 },
      bot: false,
    });
  });
});

describe('decks', () => {
  it('shuffles the same way for the same seed and label only', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffleWith(7, 'deal:1', items)).toEqual(shuffleWith(7, 'deal:1', items));
    expect(shuffleWith(7, 'deal:2', items)).not.toEqual(shuffleWith(7, 'deal:1', items));
    expect([...shuffleWith(7, 'deal:1', items)].sort((a, b) => a - b)).toEqual(items);
  });

  it('takes from the top and deals one card per seat at a time', () => {
    expect(take([1, 2, 3, 4], 3)).toEqual({ taken: [1, 2, 3], rest: [4] });
    expect(dealRound([1, 2, 3, 4, 5, 6, 7], 3, 2)).toEqual({
      hands: [
        [1, 4],
        [2, 5],
        [3, 6],
      ],
      rest: [7],
    });
  });
});
