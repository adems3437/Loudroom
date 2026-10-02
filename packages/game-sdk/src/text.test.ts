import { describe, expect, it } from 'vitest';
import { cleanText, editDistance, foldText, isNearMatch, typoTolerance } from './text.js';

describe('cleanText', () => {
  it('normalizes, drops invisible characters and collapses spaces', () => {
    expect(cleanText('  Ayşe​   Teyze \n')).toBe('Ayşe Teyze');
    expect(cleanText('é')).toBe('é');
  });
});

describe('foldText', () => {
  it.each([
    ['İSTANBUL', 'istanbul'],
    ['ISPARTA', 'isparta'],
    ['Işık', 'isik'],
    ['Çağrı Güneş', 'cagri gunes'],
    ["Ankara'ya!", 'ankaraya'],
    ['Crème brûlée', 'creme brulee'],
    ['3 kalp', '3 kalp'],
  ])('%s → %s', (text, folded) => {
    expect(foldText(text)).toBe(folded);
  });
});

describe('editDistance', () => {
  it.each([
    ['kitap', 'kitap', 0],
    ['kitap', 'kitab', 1],
    ['kitap', 'kiatp', 1],
    ['kitap', 'kitaplar', 3],
    ['', 'abc', 3],
  ])('%s ↔ %s = %i', (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance);
  });
});

describe('isNearMatch', () => {
  it('ignores case, Turkish letters, accents, spaces and punctuation', () => {
    expect(isNearMatch('Ağrı Dağı', 'AGRI DAGI')).toBe(true);
    expect(isNearMatch('New York', 'newyork')).toBe(true);
    expect(isNearMatch('Üç', 'uc')).toBe(true);
  });

  it('allows one typo from 4 letters and two from 9', () => {
    expect(typoTolerance(3)).toBe(0);
    expect(isNearMatch('kedi', 'kedı')).toBe(true);
    expect(isNearMatch('kedi', 'kedim')).toBe(true);
    expect(isNearMatch('kedi', 'kendim')).toBe(false);
    expect(isNearMatch('üç', 'iç')).toBe(false);
    expect(isNearMatch('kaplumbağa', 'kaplumbaa')).toBe(true);
    expect(isNearMatch('kaplumbağa', 'kaplmbaa')).toBe(true);
    expect(isNearMatch('kaplumbağa', 'kplmbaa')).toBe(false);
  });

  it('never matches empty text with something', () => {
    expect(isNearMatch('', 'a')).toBe(false);
    expect(isNearMatch('!!', '??')).toBe(true);
  });
});
