import { describe, expect, it } from 'vitest';
import { correctPositions, pairShare, pointsFor } from './scoring.js';

const right = ['a', 'b', 'c', 'd'];

describe('correctPositions', () => {
  it.each([
    [['a', 'b', 'c', 'd'], 4],
    [['b', 'a', 'c', 'd'], 2],
    [['d', 'c', 'b', 'a'], 0],
    [['b', 'c', 'd', 'a'], 0],
  ])('%j → %i', (order, count) => {
    expect(correctPositions(order, right)).toBe(count);
  });
});

describe('pairShare (Kendall)', () => {
  it('is 1 for the right order and 0 for the reversed one', () => {
    expect(pairShare(right, right)).toBe(1);
    expect(pairShare(['d', 'c', 'b', 'a'], right)).toBe(0);
  });

  it('gives partial credit where positions give none', () => {
    // Everything shifted by one: no item in place, but 3 of 6 pairs still the right way round.
    expect(correctPositions(['b', 'c', 'd', 'a'], right)).toBe(0);
    expect(pairShare(['b', 'c', 'd', 'a'], right)).toBe(0.5);
    expect(pairShare(['b', 'a', 'c', 'd'], right)).toBeCloseTo(5 / 6, 12);
  });
});

describe('pointsFor', () => {
  it('rounds to whole points and applies the multiplier', () => {
    expect(pointsFor(1000, 5 / 6, 1)).toBe(833);
    expect(pointsFor(1000, 0.5, 2)).toBe(1000);
  });
});
