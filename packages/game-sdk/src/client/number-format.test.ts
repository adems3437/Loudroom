import { describe, expect, it } from 'vitest';
import { formatNumber } from './number-format.js';

describe('formatNumber', () => {
  it.each([
    [1234567, '1.234.567'],
    [1234.5, '1.234,5'],
    [-8848, '-8.848'],
    [0.125, '0,125'],
    [0, '0'],
  ])('%f → %s', (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });

  it('writes years without separators', () => {
    expect(formatNumber(1923, { grouping: false })).toBe('1923');
    expect(formatNumber(-480, { grouping: false })).toBe('-480');
  });
});
