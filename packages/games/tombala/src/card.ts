import { createRandom, seedFromString, type Random } from '@loudroom/game-sdk';
import {
  TOMBALA_COLUMNS,
  TOMBALA_MAX_NUMBER,
  TOMBALA_ROW_NUMBERS,
  TOMBALA_ROWS,
  type TombalaCard,
} from './schema.js';

/** Column c holds c×10 … c×10+9 (the first 1–9, the last 80–90). */
export function columnRange(column: number): [number, number] {
  const low = column === 0 ? 1 : column * 10;
  const high = column === TOMBALA_COLUMNS - 1 ? TOMBALA_MAX_NUMBER : column * 10 + 9;
  return [low, high];
}

/** How many numbers each column gets: at least 1, at most 3, 15 in all. */
function columnCounts(random: Random): number[] {
  const counts = Array.from({ length: TOMBALA_COLUMNS }, () => 1);
  let extra = TOMBALA_ROWS * TOMBALA_ROW_NUMBERS - TOMBALA_COLUMNS;
  while (extra > 0) {
    const open = counts.flatMap((count, column) => (count < TOMBALA_ROWS ? [column] : []));
    const column = open[random.int(0, open.length - 1)] ?? 0;
    counts[column] = (counts[column] ?? 0) + 1;
    extra--;
  }
  return counts;
}

/**
 * Which rows each column's numbers sit in, so that every row gets exactly 5. Columns are
 * placed fullest first, each into the emptiest rows (random among equals); a dead end starts
 * over, which is rare and stays deterministic.
 */
function rowsPerColumn(counts: number[], random: Random): number[][] | null {
  const filled = Array.from({ length: TOMBALA_ROWS }, () => 0);
  const placement: number[][] = counts.map(() => []);
  const order = random
    .shuffle(counts.map((count, column) => ({ count, column })))
    .sort((a, b) => b.count - a.count);
  for (const { count, column } of order) {
    const rows = random
      .shuffle(filled.flatMap((used, row) => (used < TOMBALA_ROW_NUMBERS ? [{ row, used }] : [])))
      .sort((a, b) => a.used - b.used)
      .slice(0, count);
    if (rows.length < count) return null;
    for (const { row } of rows) filled[row] = (filled[row] ?? 0) + 1;
    placement[column] = rows.map(({ row }) => row).sort((a, b) => a - b);
  }
  return filled.every((used) => used === TOMBALA_ROW_NUMBERS) ? placement : null;
}

/**
 * A Turkish tombala card (SPEC §7.10): 3 rows × 9 columns, 5 numbers per row, every column
 * from its own range with 1–3 numbers that grow from top to bottom.
 */
export function createCard(random: Random): TombalaCard {
  for (;;) {
    const counts = columnCounts(random);
    const placement = rowsPerColumn(counts, random);
    if (!placement) continue;
    const card: TombalaCard = Array.from({ length: TOMBALA_ROWS }, () =>
      Array.from({ length: TOMBALA_COLUMNS }, () => null),
    );
    placement.forEach((rows, column) => {
      const [low, high] = columnRange(column);
      const pool = Array.from({ length: high - low + 1 }, (_, i) => low + i);
      const numbers = random
        .shuffle(pool)
        .slice(0, rows.length)
        .sort((a, b) => a - b);
      rows.forEach((row, index) => {
        const cells = card[row];
        if (cells) cells[column] = numbers[index] ?? null;
      });
    });
    return card;
  }
}

export function cardNumbers(card: TombalaCard): number[] {
  return card.flatMap((row) => row.filter((cell): cell is number => cell !== null));
}

/** Rows whose numbers have all been drawn. */
export function completeRows(card: TombalaCard, drawn: ReadonlySet<number>): number {
  return card.filter((row) => row.every((cell) => cell === null || drawn.has(cell))).length;
}

const cardKey = (card: TombalaCard) => cardNumbers(card).join(',');

/**
 * Cards for the given players, none the same as another (or as `taken`). A player's card
 * depends only on the round's card seed and their id, so a late joiner's card is the same
 * whenever it is dealt.
 */
export function dealCards(
  cardSeed: number,
  playerIds: readonly string[],
  taken: readonly TombalaCard[] = [],
): Record<string, TombalaCard> {
  const used = new Set(taken.map(cardKey));
  const cards: Record<string, TombalaCard> = {};
  for (const playerId of playerIds) {
    const random = createRandom(seedFromString(`${cardSeed}:${playerId}`));
    let card = createCard(random);
    while (used.has(cardKey(card))) card = createCard(random);
    used.add(cardKey(card));
    cards[playerId] = card;
  }
  return cards;
}
