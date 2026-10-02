import { describe, expect, it } from 'vitest';
import { headerKey, parseLocaleNumber, splitList } from './importer.js';

describe('import helpers', () => {
  it('turns headers into column keys', () => {
    expect(headerKey('Doğru')).toBe('dogru');
    expect(headerKey('  Görsel ID ')).toBe('gorsel_id');
    expect(headerKey('İlk-Etiket')).toBe('ilk_etiket');
    expect(headerKey('gorsel_id')).toBe('gorsel_id');
  });

  it('splits lists', () => {
    expect(splitList(' a | b ||c ')).toEqual(['a', 'b', 'c']);
    expect(splitList('')).toEqual([]);
  });

  it.each([
    ['1.234.567', 1234567],
    ['1.234,5', 1234.5],
    ['-8848', -8848],
    ['0,25', 0.25],
    ['1 234', 1234],
  ])('reads %s as %f', (text, value) => {
    expect(parseLocaleNumber(text)).toBe(value);
  });

  it.each(['', 'abc', '1,2,3', '1e5'])('refuses %s', (text) => {
    expect(parseLocaleNumber(text)).toBeNull();
  });
});
