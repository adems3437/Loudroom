'use client';

import type { UnoCard, UnoColor } from './cards.js';

const BG: Record<UnoColor, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
};

const SIZE = {
  sm: 'h-[84px] w-[58px] rounded-lg border-[3px] text-2xl',
  md: 'h-[112px] w-[78px] rounded-xl border-4 text-4xl',
  lg: 'h-[300px] w-[210px] rounded-[28px] border-8 text-[110px]',
} as const;

export type CardSize = keyof typeof SIZE;

export function colorClass(color: UnoColor): string {
  return BG[color];
}

/** The symbol in a card's middle. */
export function cardSymbol(card: UnoCard): string {
  switch (card.kind) {
    case 'number':
      return String(card.value ?? 0);
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return '✱';
    case 'wild4':
      return '+4';
  }
}

/** An original card face: colour, a tilted oval, the symbol in the middle and the corner. */
export function UnoCardFace({ card, size }: { card: UnoCard; size: CardSize }) {
  const symbol = cardSymbol(card);
  return (
    <span
      className={`border-card-face relative grid shrink-0 place-items-center overflow-hidden font-extrabold shadow-lg ${SIZE[size]} ${
        card.color ? BG[card.color] : 'bg-card-ink'
      }`}
      data-color={card.color ?? 'wild'}
      data-kind={card.kind}
    >
      {!card.color && (
        <span className="absolute inset-[18%] grid -rotate-12 grid-cols-2 overflow-hidden rounded-[50%]">
          <span className="bg-uno-red" />
          <span className="bg-uno-blue" />
          <span className="bg-uno-yellow" />
          <span className="bg-uno-green" />
        </span>
      )}
      {card.color && (
        <span className="bg-card-face/90 absolute inset-x-[12%] inset-y-[22%] -rotate-12 rounded-[50%]" />
      )}
      <span
        className={`relative leading-none ${card.color ? 'text-card-ink' : 'text-card-face'} [text-shadow:0_2px_0_rgb(0_0_0/0.15)]`}
      >
        {symbol}
      </span>
      <span className="text-card-face absolute top-[6%] left-[10%] text-[0.4em] leading-none">
        {symbol}
      </span>
    </span>
  );
}

/** The back of a card (draw pile, other players' hands). */
export function UnoCardBack({ size }: { size: CardSize }) {
  return (
    <span
      className={`border-card-face bg-card-ink relative grid shrink-0 place-items-center shadow-lg ${SIZE[size]}`}
    >
      <span className="bg-uno-red absolute inset-[18%] -rotate-12 rounded-[50%]" />
      <span className="bg-uno-yellow relative size-[30%] rotate-45 rounded-md" />
    </span>
  );
}
