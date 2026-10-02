import type { ClosestNumberContent, ClosestNumberSettings } from './schema.js';

/**
 * The yardstick for errors: numbers are judged relative to the answer's size (fair for big and
 * small numbers alike, SPEC §7.2), years in years. A zero answer is judged in plain units.
 */
export function errorScale(
  content: Pick<ClosestNumberContent, 'answer' | 'displayFormat'>,
  settings: Pick<ClosestNumberSettings, 'maxRelativeError' | 'maxYearError'>,
): { scale: number; maxError: number } {
  if (content.displayFormat === 'year') return { scale: 1, maxError: settings.maxYearError };
  return { scale: Math.abs(content.answer) || 1, maxError: settings.maxRelativeError };
}

/**
 * Share of the base score in relative mode: 1 for an exact guess, falling along a log curve
 * of the relative error to 0 at `maxError`. Works for zero and negative answers too.
 */
export function relativeShare(
  guess: number,
  answer: number,
  scale: number,
  maxError: number,
): number {
  const error = Math.abs(guess - answer) / scale;
  return Math.max(0, 1 - Math.log1p(error) / Math.log1p(maxError));
}

/** Share of the base score in rank mode: the closest gets all, the last 1/count. */
export function rankShare(index: number, count: number): number {
  return count > 0 ? (count - index) / count : 0;
}

export function pointsFor(baseScore: number, share: number, multiplier: number): number {
  return Math.round(Math.round(baseScore * share) * multiplier);
}
