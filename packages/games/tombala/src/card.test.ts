import { createRandom } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import { cardNumbers, columnRange, completeRows, createCard, dealCards } from './card.js';

describe('tombala cards', () => {
  it('follow the Turkish card rules for many seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const card = createCard(createRandom(seed));
      expect(card).toHaveLength(3);
      expect(cardNumbers(card)).toHaveLength(15);
      expect(new Set(cardNumbers(card)).size).toBe(15);
      for (const row of card) {
        expect(row).toHaveLength(9);
        expect(row.filter((cell) => cell !== null)).toHaveLength(5);
      }
      for (let column = 0; column < 9; column++) {
        const [low, high] = columnRange(column);
        const cells = card.map((row) => row[column]).filter((cell) => cell != null);
        expect(cells.length).toBeGreaterThanOrEqual(1);
        expect(cells.length).toBeLessThanOrEqual(3);
        for (const number of cells) {
          expect(number).toBeGreaterThanOrEqual(low);
          expect(number).toBeLessThanOrEqual(high);
        }
        expect([...cells].sort((a, b) => a - b)).toEqual(cells);
      }
    }
  });

  it('covers 1–90 with its column ranges', () => {
    expect(columnRange(0)).toEqual([1, 9]);
    expect(columnRange(4)).toEqual([40, 49]);
    expect(columnRange(8)).toEqual([80, 90]);
  });

  it('deals different cards, the same again for the same seed and player', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const cards = dealCards(7, ids);
    expect(new Set(Object.values(cards).map((card) => cardNumbers(card).join())).size).toBe(40);
    expect(dealCards(7, ['p3'])).toEqual({ p3: cards.p3 });
    // Dealt later next to others: still unique.
    const late = dealCards(7, ['late'], Object.values(cards));
    expect(Object.values(cards).map((card) => cardNumbers(card).join())).not.toContain(
      cardNumbers(late.late ?? []).join(),
    );
  });

  it('counts the rows whose numbers were all drawn', () => {
    const card = createCard(createRandom(3));
    const firstRow = (card[0] ?? []).filter((cell): cell is number => cell !== null);
    expect(completeRows(card, new Set(firstRow.slice(0, 4)))).toBe(0);
    expect(completeRows(card, new Set(firstRow))).toBe(1);
    expect(completeRows(card, new Set(cardNumbers(card)))).toBe(3);
  });
});
