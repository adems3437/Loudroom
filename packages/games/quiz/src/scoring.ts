import type { QuizSettings } from './schema.js';

/**
 * Points for a correct answer (SPEC §7.1): half the base score for answering at all, the other
 * half scaled by the time left; then the pack's multiplier.
 */
export function answerPoints(
  baseScore: number,
  remainingMs: number,
  totalMs: number,
  multiplier: number,
): number {
  const share = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  return Math.round(Math.round(baseScore * (0.5 + 0.5 * share)) * multiplier);
}

/** Bonus for the `streak`-th correct answer in a row; 0 below the threshold, capped. */
export function streakBonus(streak: number, rule: QuizSettings['streakBonus']): number {
  if (streak < rule.fromStreak) return 0;
  return Math.min(rule.max, (streak - rule.fromStreak + 1) * rule.step);
}
