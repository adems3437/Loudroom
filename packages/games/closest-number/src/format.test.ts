import { describe, expect, it } from 'vitest';
import { formatTyping, formatValue, parseTyped } from './format.js';

describe('formatValue', () => {
  it('writes numbers the Turkish way, years plainly, with the unit', () => {
    expect(formatValue(8849, 'number', 'm')).toBe('8.849 m');
    expect(formatValue(1234567.5, 'number')).toBe('1.234.567,5');
    expect(formatValue(1923, 'year')).toBe('1923');
  });
});

describe('formatTyping', () => {
  it.each([
    ['1234567', '1.234.567'],
    ['1.234', '1.234'],
    ['12345,67', '12.345,67'],
    ['0,5', '0,5'],
    [',5', '0,5'],
    ['-8848', '-8.848'],
    ['007', '7'],
    ['12a3', '123'],
    ['1,2345', '1,234'],
    ['', ''],
  ])('number: %s → %s', (raw, shown) => {
    expect(formatTyping(raw, 'number')).toBe(shown);
  });

  it('keeps years whole and ungrouped', () => {
    expect(formatTyping('19235', 'year')).toBe('19235');
    expect(formatTyping('1923,5', 'year')).toBe('1923');
    expect(formatTyping('-480', 'year')).toBe('-480');
  });
});

describe('parseTyped', () => {
  it.each([
    ['1.234.567', 1234567],
    ['12.345,67', 12345.67],
    ['-8.848', -8848],
    ['0,5', 0.5],
    ['1923', 1923],
  ])('%s → %f', (text, value) => {
    expect(parseTyped(text)).toBe(value);
  });

  it.each(['', '-', 'abc', '1,2,3'])('%s → null', (text) => {
    expect(parseTyped(text)).toBeNull();
  });
});
