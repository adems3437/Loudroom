/** Median of a non-empty list (mean of the middle two for an even count), rounded. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return Math.round(value);
}

/**
 * Plausibility of a tap (SPEC §7.7): the phone's measured time must be humanly possible, the
 * phone must have reported drawing the target soon after GO, and the gap between its two
 * messages arriving must match the measured time (both travel the same connection).
 */
export function plausibleTap(input: {
  reactionMs: number;
  goAt: number;
  shownAt: number | null;
  tapAt: number;
  minReactionMs: number;
  maxReactionMs: number;
}): 'ok' | 'invalid' | 'missed' {
  const { reactionMs, goAt, shownAt, tapAt } = input;
  if (shownAt === null) return 'invalid';
  if (shownAt - goAt > MAX_SHOW_DELAY_MS) return 'invalid';
  if (reactionMs < input.minReactionMs) return 'invalid';
  if (Math.abs(tapAt - shownAt - reactionMs) > ARRIVAL_TOLERANCE_MS) return 'invalid';
  if (reactionMs > input.maxReactionMs) return 'missed';
  return 'ok';
}

/** The phone must report the target drawn within this long after GO. */
export const MAX_SHOW_DELAY_MS = 1_500;
/** Allowed difference between the measured time and the gap between the two messages. */
export const ARRIVAL_TOLERANCE_MS = 300;
