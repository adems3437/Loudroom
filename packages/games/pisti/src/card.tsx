'use client';

import { JACK, type PlayingCard, type Suit } from './cards.js';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

const SIZE = {
  sm: 'h-[84px] w-[60px] rounded-lg text-xl',
  md: 'h-[112px] w-[80px] rounded-xl text-2xl',
  lg: 'h-[260px] w-[186px] rounded-[24px] text-[56px]',
} as const;

export type CardSize = keyof typeof SIZE;

export const rankLabel = (rank: number) => RANK_LABEL[rank] ?? String(rank);
export const suitSymbol = (suit: Suit) => SUIT_SYMBOL[suit];

/** An original playing card face: rank and suit in the corners, the suit large in the middle. */
export function PlayingCardFace({ card, size }: { card: PlayingCard; size: CardSize }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const label = rankLabel(card.rank);
  return (
    <span
      className={`bg-card-face relative grid shrink-0 place-items-center font-extrabold shadow-lg ${SIZE[size]} ${
        red ? 'text-card-red' : 'text-card-ink'
      }`}
      data-suit={card.suit}
      data-rank={card.rank}
    >
      <span className="absolute top-[5%] left-[9%] flex flex-col items-center leading-none">
        <span>{label}</span>
        <span className="text-[0.8em]">{suitSymbol(card.suit)}</span>
      </span>
      <span className={`leading-none ${card.rank >= JACK ? 'text-[1.9em]' : 'text-[2.3em]'}`}>
        {card.rank >= JACK ? label : suitSymbol(card.suit)}
      </span>
      <span className="absolute right-[9%] bottom-[5%] flex rotate-180 flex-col items-center leading-none">
        <span>{label}</span>
        <span className="text-[0.8em]">{suitSymbol(card.suit)}</span>
      </span>
    </span>
  );
}

/** The back of a card (deck, face-down table cards). */
export function PlayingCardBack({ size }: { size: CardSize }) {
  return (
    <span
      className={`border-card-face bg-brand relative grid shrink-0 place-items-center border-4 shadow-lg ${SIZE[size]}`}
    >
      <span className="border-card-face/60 absolute inset-[12%] rounded-[inherit] border-2" />
      <span className="text-card-face/80 text-[1.4em]">♣</span>
    </span>
  );
}
