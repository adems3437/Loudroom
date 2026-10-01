import { describe, expect, it } from 'vitest';
import { graphemeLength, nicknameKey, nicknameSchema, normalizeNickname } from './nickname.js';

describe('normalizeNickname', () => {
  it('composes to NFC', () => {
    // "Ş" written as S + combining cedilla becomes the single precomposed letter.
    expect(normalizeNickname('Şule')).toBe('Şule');
  });

  it('removes zero-width, bidi-override and control characters', () => {
    expect(normalizeNickname('A​h‍m⁠e﻿t')).toBe('Ahmet');
    expect(normalizeNickname('‮abc‬')).toBe('abc');
    expect(normalizeNickname('a\u0000b\u0007c­d')).toBe('abcd');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeNickname('  Ali \t\n  Veli  ')).toBe('Ali Veli');
  });
});

describe('graphemeLength', () => {
  it('counts what a person sees as one character', () => {
    expect(graphemeLength('Çağrı')).toBe(5);
    expect(graphemeLength('🎉🎉')).toBe(2);
    expect(graphemeLength('👍🏽')).toBe(1);
  });
});

describe('nicknameKey', () => {
  it('uses Turkish case rules', () => {
    expect(nicknameKey('İREM')).toBe(nicknameKey('irem'));
    expect(nicknameKey('IŞIK')).toBe('ışık');
    expect(nicknameKey('Isık')).not.toBe(nicknameKey('isık'));
  });
});

describe('nicknameSchema', () => {
  it('returns the normalized nickname', () => {
    expect(nicknameSchema.parse('  Zeynep​ ')).toBe('Zeynep');
  });

  it.each(['A', ' a ', '​​', 'x'.repeat(17), 'y'.repeat(65)])('rejects %j', (value) => {
    expect(nicknameSchema.safeParse(value).success).toBe(false);
  });

  it('accepts 2 and 16 characters, counting emoji as one', () => {
    expect(nicknameSchema.safeParse('Al').success).toBe(true);
    expect(nicknameSchema.safeParse('x'.repeat(16)).success).toBe(true);
    expect(nicknameSchema.safeParse(`${'x'.repeat(15)}👍🏽`).success).toBe(true);
  });
});
