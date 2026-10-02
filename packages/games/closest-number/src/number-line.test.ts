import { describe, expect, it } from 'vitest';
import { layoutNumberLine } from './number-line.js';

describe('layoutNumberLine', () => {
  it('spans the answer and the scoring guesses, with a margin', () => {
    const { answerX, placed } = layoutNumberLine(100, 100, [{ value: 80 }, { value: 120 }]);
    expect(answerX).toBeCloseTo(0.5);
    expect(placed.map((entry) => entry.x)).toEqual([
      expect.closeTo(1 / 12, 6),
      expect.closeTo(11 / 12, 6),
    ]);
    expect(placed.every((entry) => entry.offscale === null && entry.level === 0)).toBe(true);
  });

  it('puts far-off guesses at the edges with an arrow', () => {
    const { placed } = layoutNumberLine(100, 100, [{ value: 1_000_000 }, { value: -5000 }]);
    expect(placed.map((entry) => [entry.x, entry.offscale])).toEqual([
      [0, 'left'],
      [1, 'right'],
    ]);
  });

  it('stacks guesses that would overlap', () => {
    const { placed } = layoutNumberLine(100, 100, [
      { value: 100 },
      { value: 100 },
      { value: 101 },
      { value: 60 },
    ]);
    expect(placed.map((entry) => entry.level)).toEqual([0, 0, 1, 2]);
  });
});
