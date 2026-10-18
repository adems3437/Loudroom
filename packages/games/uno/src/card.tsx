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

/** The four colours as a 2×2 grid of squares (wild cards, the card back). */
function ColorTiles({ className }: { className: string }) {
  return (
    <span className={`grid grid-cols-2 overflow-hidden ${className}`}>
      <span className="bg-uno-red" />
      <span className="bg-uno-blue" />
      <span className="bg-uno-yellow" />
      <span className="bg-uno-green" />
    </span>
  );
}

/**
 * An original card face: colour, an upright rounded square holding the symbol, and the
 * symbol again in two corners. Wild cards show the four colours behind a dark square.
 */
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
      {!card.color && <ColorTiles className="absolute inset-0" />}
      <span
        className={`relative grid aspect-square w-[64%] place-items-center rounded-[24%] leading-none ${
          card.color ? 'bg-card-face/90 text-card-ink' : 'bg-card-ink text-card-face'
        }`}
      >
        {symbol}
      </span>
      <span className="text-card-face absolute top-[5%] left-[9%] text-[0.36em] leading-none [text-shadow:0_1px_0_rgb(0_0_0/0.25)]">
        {symbol}
      </span>
      <span className="text-card-face absolute right-[9%] bottom-[5%] rotate-180 text-[0.36em] leading-none [text-shadow:0_1px_0_rgb(0_0_0/0.25)]">
        {symbol}
      </span>
    </span>
  );
}

/** The back of a card (draw pile, other players' hands): the four colours as a diamond. */
export function UnoCardBack({ size }: { size: CardSize }) {
  return (
    <span
      className={`border-card-face bg-card-ink relative grid shrink-0 place-items-center shadow-lg ${SIZE[size]}`}
    >
      <span className="border-card-face/25 absolute inset-[7%] rounded-[inherit] border" />
      <ColorTiles className="relative aspect-square w-[46%] rotate-45 gap-[6%] rounded-[14%]" />
    </span>
  );
}
