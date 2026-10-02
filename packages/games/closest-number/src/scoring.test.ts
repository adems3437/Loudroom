import { describe, expect, it } from 'vitest';
import { CLOSEST_NUMBER_DEFAULT_SETTINGS } from './schema.js';
import { errorScale, pointsFor, rankShare, relativeShare } from './scoring.js';

const share = (guess: number, answer: number, maxError = 1) =>
  relativeShare(guess, answer, Math.abs(answer) || 1, maxError);

describe('relativeShare', () => {
  it('gives everything for an exact guess and nothing from the maximum error on', () => {
    expect(share(8849, 8849)).toBe(1);
    expect(share(2 * 8849, 8849)).toBe(0);
    expect(share(0, 8849)).toBe(0);
    expect(share(-5000, 8849)).toBe(0);
  });

  it('judges big and small numbers by the same relative error', () => {
    expect(share(110, 100)).toBeCloseTo(share(1_100_000_000, 1_000_000_000), 12);
    expect(share(110, 100)).toBeCloseTo(1 - Math.log(1.1) / Math.log(2), 12);
  });

  it('falls faster for the first errors (log curve)', () => {
    expect(share(110, 100)).toBeLessThan(0.9);
    expect(share(150, 100)).toBeGreaterThan(0.4);
    expect(share(150, 100)).toBeLessThan(share(110, 100));
  });

  it('handles zero and negative answers', () => {
    expect(share(0, 0)).toBe(1);
    expect(share(0.5, 0)).toBeGreaterThan(0);
    expect(share(1, 0)).toBe(0);
    expect(share(-40, -40)).toBe(1);
    expect(share(-44, -40)).toBeCloseTo(share(-36, -40), 12);
  });

  it('accepts a wider maximum error', () => {
    expect(share(300, 100, 3)).toBeGreaterThan(0);
    expect(share(400, 100, 3)).toBe(0);
  });
});

describe('errorScale', () => {
  it('measures numbers relative to the answer and years in years', () => {
    expect(
      errorScale({ answer: -250, displayFormat: 'number' }, CLOSEST_NUMBER_DEFAULT_SETTINGS),
    ).toEqual({ scale: 250, maxError: 1 });
    expect(
      errorScale({ answer: 0, displayFormat: 'number' }, CLOSEST_NUMBER_DEFAULT_SETTINGS),
    ).toEqual({ scale: 1, maxError: 1 });
    expect(
      errorScale({ answer: 1923, displayFormat: 'year' }, CLOSEST_NUMBER_DEFAULT_SETTINGS),
    ).toEqual({ scale: 1, maxError: 100 });
  });

  it('makes 100 years off worth nothing by default, 1 year off most', () => {
    const { scale, maxError } = errorScale(
      { answer: 1923, displayFormat: 'year' },
      CLOSEST_NUMBER_DEFAULT_SETTINGS,
    );
    expect(relativeShare(2023, 1923, scale, maxError)).toBe(0);
    expect(relativeShare(1924, 1923, scale, maxError)).toBeGreaterThan(0.8);
  });
});

describe('rankShare and pointsFor', () => {
  it('shares by rank: first all, last 1/count', () => {
    expect([0, 1, 2, 3].map((index) => rankShare(index, 4))).toEqual([1, 0.75, 0.5, 0.25]);
  });

  it('rounds to whole points and applies the multiplier', () => {
    expect(pointsFor(1000, 0.8625, 1)).toBe(863);
    expect(pointsFor(1000, 0.8625, 1.5)).toBe(1295);
  });
});
