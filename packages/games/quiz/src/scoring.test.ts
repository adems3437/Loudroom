import { describe, expect, it } from 'vitest';
import { QUIZ_DEFAULT_SETTINGS } from './schema.js';
import { answerPoints, streakBonus } from './scoring.js';

describe('answerPoints', () => {
  it.each([
    [20_000, 20_000, 1, 1000],
    [0, 20_000, 1, 500],
    [10_000, 20_000, 1, 750],
    [15_000, 20_000, 1, 875],
    [10_000, 20_000, 2, 1500],
    [10_000, 20_000, 1.5, 1125],
    [30_000, 20_000, 1, 1000],
    [-5, 20_000, 1, 500],
  ])('remaining %i of %i ms ×%f → %i', (remaining, total, multiplier, expected) => {
    expect(answerPoints(1000, remaining, total, multiplier)).toBe(expected);
  });
});

describe('streakBonus', () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 100],
    [4, 200],
    [7, 500],
    [12, 500],
  ])('streak %i → +%i', (streak, bonus) => {
    expect(streakBonus(streak, QUIZ_DEFAULT_SETTINGS.streakBonus)).toBe(bonus);
  });
});
