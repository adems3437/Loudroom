import { editDistance, foldText } from '@loudroom/game-sdk';

export type GuessResult = 'correct' | 'close' | 'wrong';

const compact = (text: string) => foldText(text).replace(/ /g, '');

/**
 * Judges a guess against the word and its alternatives (SPEC §7.5): equal after Turkish
 * folding is right, and so is one typo in a word of 6+ letters. One letter off a shorter word,
 * or two off a long one, is "close" — told only to the guesser.
 */
export function judgeGuess(guess: string, answers: readonly string[]): GuessResult {
  const typed = compact(guess);
  if (typed.length === 0) return 'wrong';
  let result: GuessResult = 'wrong';
  for (const answer of answers) {
    const target = compact(answer);
    if (typed === target) return 'correct';
    const length = Array.from(target).length;
    const distance = editDistance(typed, target);
    if (length >= 6 && distance <= 1) return 'correct';
    if (length >= 3 && distance <= (length >= 6 ? 2 : 1)) result = 'close';
  }
  return result;
}

/** Letters per word, for the empty boxes ("buz dolabı" → [3, 6]). */
export function letterSlots(word: string): number[] {
  const graphemes = new Intl.Segmenter('tr', { granularity: 'grapheme' });
  return word
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => [...graphemes.segment(part)].length);
}
