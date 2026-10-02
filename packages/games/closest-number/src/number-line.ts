/** A guess placed on the reveal's number line. */
export interface PlacedGuess<T> {
  item: T;
  /** 0..1 across the line. */
  x: number;
  /** Row above the line, so that nearby avatars do not cover each other. */
  level: number;
  /** Too far off for the line: drawn at the edge with an arrow. */
  offscale: 'left' | 'right' | null;
}

const MIN_GAP = 0.06;

/**
 * Lays out the reveal's number line: it spans the answer and the guesses that still scored
 * (closer than `zeroPointDistance`); guesses farther away sit at the edge with an arrow.
 */
export function layoutNumberLine<T extends { value: number }>(
  answer: number,
  zeroPointDistance: number,
  guesses: readonly T[],
): { answerX: number; placed: PlacedGuess<T>[] } {
  const near = guesses.filter((guess) => Math.abs(guess.value - answer) < zeroPointDistance);
  let low = Math.min(answer, ...near.map((guess) => guess.value));
  let high = Math.max(answer, ...near.map((guess) => guess.value));
  const pad = high > low ? (high - low) * 0.1 : zeroPointDistance * 0.1;
  low -= pad;
  high += pad;
  const toX = (value: number) => (value - low) / (high - low);

  const lastXByLevel: number[] = [];
  const placed = [...guesses]
    .map((item) => {
      const raw = toX(item.value);
      const offscale = raw < 0 ? ('left' as const) : raw > 1 ? ('right' as const) : null;
      return { item, x: Math.min(1, Math.max(0, raw)), offscale };
    })
    .sort((a, b) => a.x - b.x)
    .map((entry) => {
      let level = lastXByLevel.findIndex((lastX) => entry.x - lastX >= MIN_GAP);
      if (level === -1) level = lastXByLevel.length;
      lastXByLevel[level] = entry.x;
      return { ...entry, level };
    });
  return { answerX: toX(answer), placed };
}
