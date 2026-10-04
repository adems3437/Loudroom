'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import type { TombalaCard, TombalaPlayerView, TombalaPrize } from './schema.js';

const PRIZE_KEY: Record<TombalaPrize, string> = {
  firstLine: 'prize.firstLine',
  secondLine: 'prize.secondLine',
  tombala: 'prize.tombala',
};

function Card({
  card,
  marked,
  drawn,
  onTap,
}: {
  card: TombalaCard;
  marked: readonly number[];
  drawn: readonly number[];
  onTap: ((number: number) => void) | null;
}) {
  const markedSet = new Set(marked);
  const last = drawn.at(-1);
  return (
    <div
      data-testid="tombala-card"
      className="bg-surface grid grid-cols-9 gap-1 rounded-2xl p-2"
      role="grid"
    >
      {card.flatMap((row, rowIndex) =>
        row.map((number, column) =>
          number === null ? (
            <span key={`${rowIndex}-${column}`} className="bg-canvas/40 h-12 rounded-md" />
          ) : (
            <button
              key={`${rowIndex}-${column}`}
              type="button"
              data-testid="tombala-cell"
              data-number={number}
              data-row={rowIndex}
              data-marked={markedSet.has(number)}
              disabled={onTap === null}
              onClick={() => onTap?.(number)}
              className={`grid h-12 place-items-center rounded-md text-lg font-extrabold tabular-nums transition-colors ${
                markedSet.has(number)
                  ? 'bg-brand text-ink'
                  : number === last
                    ? 'bg-accent/30 text-ink ring-accent ring-2'
                    : 'bg-surface-raised text-ink'
              }`}
            >
              {number}
            </button>
          ),
        ),
      )}
    </div>
  );
}

/** Phone of a Tombala player: their card, marking, and the "Çinko!" / "Tombala!" button. */
export function TombalaPlayer({
  view,
  players,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<TombalaPlayerView>) {
  const [notice, setNotice] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="tombala-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'INTRO') {
    return (
      <div className="flex flex-1 flex-col gap-4" data-testid="tombala-player" data-phase="INTRO">
        <p className="font-display text-center text-2xl font-bold">{t('yourCard')}</p>
        {view.card ? (
          <Card card={view.card} marked={[]} drawn={[]} onTap={null} />
        ) : (
          <p className="text-muted text-center">{t('cardComing')}</p>
        )}
        <p className="text-muted text-center text-sm">
          {view.autoMark ? t('autoMarkHint') : t('markHint')}
        </p>
      </div>
    );
  }

  const last = view.drawn.at(-1) ?? null;
  const nicknames = (ids: readonly string[]) =>
    ids.map((id) => players.find((player) => player.id === id)?.nickname ?? '?').join(', ');
  const open = view.phase !== 'REVEAL';

  const mark = async (number: number) => {
    if (!view.drawn.includes(number)) {
      setNotice(t('notDrawn', { number }));
      return;
    }
    haptic();
    setNotice(null);
    const outcome = await submit({
      type: 'mark',
      number,
      marked: !view.marked.includes(number),
    });
    if (!outcome.ok) setNotice(describeError(outcome.code));
  };

  const claim = async () => {
    if (claiming) return;
    haptic();
    setClaiming(true);
    setNotice(null);
    // A right call shows up as a prize, a wrong one as a lock; both arrive with the view.
    const outcome = await submit({ type: 'claim' });
    setClaiming(false);
    if (!outcome.ok) {
      setNotice(outcome.code === 'ROUND_CLOSED' ? t('tooLate') : describeError(outcome.code));
    }
  };

  const locked = view.lockedDraws > 0;
  const claimLabel =
    view.nextPrize === 'tombala' ? t('shoutTombala') : view.nextPrize ? t('shoutLine') : '';

  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="tombala-player"
      data-phase={view.phase}
      data-drawn-count={view.drawn.length}
    >
      <div className="flex items-center gap-4">
        <span
          data-testid="tombala-last"
          data-number={last ?? ''}
          className="bg-accent text-canvas grid size-20 shrink-0 place-items-center rounded-full text-4xl font-extrabold tabular-nums"
        >
          {last ?? '–'}
        </span>
        <span className="flex flex-col">
          <span className="text-muted text-sm">{t('remaining', { count: view.remaining })}</span>
          <span className="font-semibold">
            {view.nextPrize ? t('nextPrize', { prize: t(PRIZE_KEY[view.nextPrize]) }) : t('allWon')}
          </span>
        </span>
      </div>

      {view.phase === 'CLAIM' && (
        <p
          className="bg-success text-canvas rounded-2xl px-4 py-3 text-center font-bold"
          data-testid="tombala-claim-news"
        >
          {t('wonBy', {
            prize: t(PRIZE_KEY[view.claim.prize]),
            names: nicknames(view.claim.winners),
          })}
        </p>
      )}

      {view.card ? (
        <Card
          card={view.card}
          marked={view.marked}
          drawn={view.drawn}
          onTap={open && !view.autoMark ? (number) => void mark(number) : null}
        />
      ) : (
        <p className="text-muted text-center" data-testid="tombala-card-coming">
          {t('cardComing')}
        </p>
      )}

      {view.myPrizes.length > 0 && (
        <p
          className="bg-success/20 rounded-2xl px-4 py-3 text-center font-bold"
          data-testid="tombala-my-prizes"
          data-prizes={view.myPrizes.join(',')}
        >
          {t('youWon', { prizes: view.myPrizes.map((prize) => t(PRIZE_KEY[prize])).join(', ') })}
        </p>
      )}

      {open && view.card && view.nextPrize && (
        <button
          type="button"
          data-testid="tombala-claim"
          data-prize={view.nextPrize}
          disabled={locked || claiming}
          onClick={() => void claim()}
          className="bg-danger text-ink font-display min-h-touch rounded-3xl px-6 py-5 text-3xl font-extrabold transition-transform active:scale-95 disabled:opacity-40"
        >
          {locked ? t('lockedFor', { count: view.lockedDraws }) : claimLabel}
        </button>
      )}

      {locked && (
        <p className="text-danger text-center" data-testid="tombala-locked" role="status">
          {t('wrongCall', { count: view.lockedDraws })}
        </p>
      )}

      {notice && (
        <p
          role="alert"
          data-testid="tombala-notice"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {notice}
        </p>
      )}

      {view.phase === 'REVEAL' && (
        <p className="text-muted text-center" data-testid="tombala-over">
          {view.falseClaims > 0 ? t('overWithWrongCalls', { count: view.falseClaims }) : t('over')}
        </p>
      )}
    </div>
  );
}
