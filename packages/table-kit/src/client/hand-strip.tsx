'use client';

import type { ReactNode } from 'react';

/**
 * A phone's hand: cards side by side, scrolling sideways when they do not fit. A tap selects;
 * the selected card lifts. Cards that cannot be played now are dimmed.
 */
export function HandStrip<Card extends { id: number }>({
  cards,
  selected,
  playable,
  onSelect,
  renderCard,
  label,
  disabled = false,
}: {
  cards: readonly Card[];
  selected: number | null;
  playable: (card: Card) => boolean;
  onSelect: (card: Card) => void;
  renderCard: (card: Card) => ReactNode;
  /** Accessible name of the hand (from the game's texts). */
  label: string;
  disabled?: boolean;
}) {
  return (
    <ul
      className="-mx-2 flex snap-x gap-1.5 overflow-x-auto px-2 pt-5 pb-2"
      data-testid="hand"
      aria-label={label}
    >
      {cards.map((card) => {
        const canPlay = playable(card);
        return (
          <li key={card.id} className="shrink-0 snap-start">
            <button
              type="button"
              data-testid="hand-card"
              data-card-id={card.id}
              data-playable={canPlay}
              aria-pressed={selected === card.id}
              disabled={disabled}
              onClick={() => {
                onSelect(card);
              }}
              className={`block transition-[transform,opacity] duration-150 ${
                selected === card.id ? '-translate-y-4' : ''
              } ${canPlay ? '' : 'opacity-45'}`}
            >
              {renderCard(card)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
