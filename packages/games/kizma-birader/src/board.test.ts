import { describe, expect, it } from 'vitest';
import {
  isHome,
  moveOf,
  onlySixHelps,
  slotsFor,
  squareOf,
  trackLength,
  type Seat,
} from './board.js';

const seat = (playerId: string, slot: number, pawns: number[]): Seat => ({ playerId, slot, pawns });

describe('kizma birader board', () => {
  it('has 40 squares for four, 48 for six, and seats players apart', () => {
    expect([trackLength(4), trackLength(6)]).toEqual([40, 48]);
    expect(slotsFor(2, 4)).toEqual([0, 2]);
    expect(slotsFor(3, 4)).toEqual([0, 1, 2]);
    expect(slotsFor(3, 6)).toEqual([0, 2, 4]);
    expect(slotsFor(6, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    // Slot 2 starts at square 20; 25 steps later it is at square 5.
    expect([squareOf(2, 0, 4), squareOf(2, 25, 4), squareOf(2, -1, 4), squareOf(2, 40, 4)]).toEqual(
      [20, 5, null, null],
    );
  });

  it('brings a pawn out only with a 6 and onto a start without an own pawn', () => {
    const me = seat('a', 0, [-1, -1]);
    expect(moveOf([me], me, 0, 5, 4)).toBeNull();
    expect(moveOf([me], me, 0, 6, 4)).toEqual({ pawn: 0, from: -1, to: 0, captured: null });
    const blocked = seat('a', 0, [-1, 0]);
    expect(moveOf([blocked], blocked, 0, 6, 4)).toBeNull();
  });

  it('sends another player’s pawn home, never lands on an own pawn', () => {
    const me = seat('a', 0, [3, 7]);
    // b sits at slot 2 (start 20); its progress 30 is square 10.
    const other = seat('b', 2, [30]);
    expect(moveOf([me, other], me, 1, 3, 4)).toMatchObject({
      to: 10,
      captured: { playerId: 'b', pawn: 0 },
    });
    expect(moveOf([me, other], me, 0, 4, 4)).toBeNull();
  });

  it('enters the goal by the exact count without jumping an own pawn', () => {
    const me = seat('a', 0, [38, 42]);
    expect(moveOf([me], me, 0, 2, 4)).toEqual({ pawn: 0, from: 38, to: 40, captured: null });
    // Square 42 is taken: no landing on it, no jumping it.
    expect(moveOf([me], me, 0, 4, 4)).toBeNull();
    expect(moveOf([me], me, 0, 5, 4)).toBeNull();
    // Past the last goal square.
    expect(moveOf([me], me, 1, 2, 4)).toBeNull();
    expect(moveOf([me], me, 1, 1, 4)).toMatchObject({ to: 43 });
  });

  it('knows when only a 6 helps and when everyone is home', () => {
    expect(onlySixHelps(seat('a', 0, [-1, -1]), 4)).toBe(true);
    expect(onlySixHelps(seat('a', 0, [-1, 43]), 4)).toBe(true);
    expect(onlySixHelps(seat('a', 0, [-1, 40]), 4)).toBe(false);
    expect(onlySixHelps(seat('a', 0, [-1, 12]), 4)).toBe(false);
    expect([isHome(seat('a', 0, [40, 43]), 4), isHome(seat('a', 0, [40, 39]), 4)]).toEqual([
      true,
      false,
    ]);
  });
});
