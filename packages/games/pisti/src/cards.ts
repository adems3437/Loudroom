import { z } from 'zod';

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const suitSchema = z.enum(SUITS);
export type Suit = z.infer<typeof suitSchema>;

export const DECK_SIZE = 52;
export const JACK = 11;

export const playingCardSchema = z.strictObject({
  id: z
    .number()
    .int()
    .min(0)
    .max(DECK_SIZE - 1),
  suit: suitSchema,
  /** 1 = Ace, 2–10, 11 = Jack, 12 = Queen, 13 = King. */
  rank: z.number().int().min(1).max(13),
});
export type PlayingCard = z.infer<typeof playingCardSchema>;

/** Card ids 0–51: suit = id ÷ 13 (♠ ♥ ♦ ♣), rank = id mod 13 + 1. */
export function cardOf(id: number): PlayingCard {
  return { id, suit: SUITS[Math.floor(id / 13)] ?? 'S', rank: (id % 13) + 1 };
}

export const ALL_CARDS: readonly number[] = Array.from({ length: DECK_SIZE }, (_, id) => id);

/** Classic card points: every Ace and Jack 1, ♣2 2, ♦10 3. */
export function cardPoints(card: PlayingCard): number {
  if (card.rank === 1 || card.rank === JACK) return 1;
  if (card.suit === 'C' && card.rank === 2) return 2;
  if (card.suit === 'D' && card.rank === 10) return 3;
  return 0;
}

/** Hand order: by suit, then rank. */
export function compareCards(a: PlayingCard, b: PlayingCard): number {
  return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank;
}
