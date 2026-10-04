import { z } from 'zod';

export const UNO_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export const unoColorSchema = z.enum(UNO_COLORS);
export type UnoColor = z.infer<typeof unoColorSchema>;

export const unoKindSchema = z.enum(['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4']);
export type UnoKind = z.infer<typeof unoKindSchema>;

export const UNO_DECK_SIZE = 108;

export const unoCardSchema = z.strictObject({
  id: z
    .number()
    .int()
    .min(0)
    .max(UNO_DECK_SIZE - 1),
  /** Null for the wild cards, whose colour is chosen when played. */
  color: unoColorSchema.nullable(),
  kind: unoKindSchema,
  /** 0–9 for number cards. */
  value: z.number().int().min(0).max(9).nullable(),
});
export type UnoCard = z.infer<typeof unoCardSchema>;

/**
 * The 108 cards (SPEC §7.14): per colour one 0, two of each 1–9, Skip, Reverse and +2; four
 * wild colour changers and four wild +4. A card's id is its index here.
 */
export const UNO_DECK: readonly UnoCard[] = (() => {
  const cards: Omit<UnoCard, 'id'>[] = [];
  for (const color of UNO_COLORS) {
    cards.push({ color, kind: 'number', value: 0 });
    for (let copy = 0; copy < 2; copy++) {
      for (let value = 1; value <= 9; value++) cards.push({ color, kind: 'number', value });
      for (const kind of ['skip', 'reverse', 'draw2'] as const) {
        cards.push({ color, kind, value: null });
      }
    }
  }
  for (let copy = 0; copy < 4; copy++) cards.push({ color: null, kind: 'wild', value: null });
  for (let copy = 0; copy < 4; copy++) cards.push({ color: null, kind: 'wild4', value: null });
  return cards.map((card, id) => ({ id, ...card }));
})();

export function cardOf(id: number): UnoCard {
  const card = UNO_DECK[id];
  if (!card) throw new Error(`No UNO card ${id}`);
  return card;
}

export const isWild = (card: UnoCard) => card.kind === 'wild' || card.kind === 'wild4';

/** Points a card left in hand is worth (classic: number = face, action 20, wild 50). */
export function cardPoints(card: UnoCard): number {
  if (card.kind === 'number') return card.value ?? 0;
  return isWild(card) ? 50 : 20;
}

const KIND_ORDER: UnoKind[] = ['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];

/** Hand order: by colour, then numbers before actions, wilds last. */
export function compareCards(a: UnoCard, b: UnoCard): number {
  const color = (card: UnoCard) => (card.color ? UNO_COLORS.indexOf(card.color) : 9);
  return (
    color(a) - color(b) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    (a.value ?? 0) - (b.value ?? 0) ||
    a.id - b.id
  );
}
