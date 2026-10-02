/**
 * Text helpers for answers players type (Bluff now, Drawing guesses later): cleaning, a
 * Turkish-aware comparison form and typo-tolerant matching.
 */

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** NFC, without control and zero-width characters, single spaces, trimmed (SPEC §9). */
export function cleanText(raw: string): string {
  return raw.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
}

/**
 * Comparison form: Turkish lower case ("I" → "ı", "İ" → "i"), then dotless ı and every accent
 * folded away (ş → s, ğ → g, é → e), punctuation dropped. "İSTANBUL'a" → "istanbula".
 */
export function foldText(text: string): string {
  return cleanText(text)
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Edits (insert, delete, replace, swap of neighbours) that turn `a` into `b`, counted in code
 * points (folded text has no combining marks left).
 */
export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const rows: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => rows[i]?.[j] ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      const row = rows[i];
      if (row) row[j] = best;
    }
  }
  return at(x.length, y.length);
}

/** Typos allowed for a word of this many letters: none below 4, one from 4, two from 9. */
export function typoTolerance(length: number): number {
  return length >= 9 ? 2 : length >= 4 ? 1 : 0;
}

/**
 * Whether two answers mean the same written word: equal after folding (spaces ignored), or
 * within the typo tolerance of the longer one.
 */
export function isNearMatch(a: string, b: string): boolean {
  const left = foldText(a).replace(/ /g, '');
  const right = foldText(b).replace(/ /g, '');
  if (left.length === 0 || right.length === 0) return left === right;
  if (left === right) return true;
  const longer = Math.max(Array.from(left).length, Array.from(right).length);
  return editDistance(left, right) <= typoTolerance(longer);
}
