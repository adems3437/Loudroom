import { describe, expect, it } from 'vitest';
import { judgeGuess, letterSlots } from './guess.js';

describe('judgeGuess', () => {
  it('accepts the word whatever the case, Turkish letters, accents or spaces', () => {
    expect(judgeGuess('KEDİ', ['kedi'])).toBe('correct');
    expect(judgeGuess('Işık', ['ışık'])).toBe('correct');
    expect(judgeGuess('buzdolabi', ['buz dolabı'])).toBe('correct');
    expect(judgeGuess('  kedi! ', ['Kedi'])).toBe('correct');
  });

  it('forgives one typo in long words only', () => {
    expect(judgeGuess('zürafs', ['zürafa'])).toBe('correct');
    expect(judgeGuess('zurfaa', ['zürafa'])).toBe('correct');
    expect(judgeGuess('kedu', ['kedi'])).toBe('close');
    expect(judgeGuess('zürfs', ['zürafa'])).toBe('close');
    expect(judgeGuess('zebra', ['zürafa'])).toBe('wrong');
  });

  it('accepts alternatives and keeps very short words strict', () => {
    expect(judgeGuess('buz dolabi', ['buzdolabı', 'buz dolabı'])).toBe('correct');
    expect(judgeGuess('et', ['at'])).toBe('wrong');
    expect(judgeGuess('', ['at'])).toBe('wrong');
  });
});

describe('letterSlots', () => {
  it('counts letters per word', () => {
    expect(letterSlots('buz dolabı')).toEqual([3, 6]);
    expect(letterSlots('Çağrı')).toEqual([5]);
  });
});
