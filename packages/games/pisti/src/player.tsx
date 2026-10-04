'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { HandStrip } from '@loudroom/table-kit/client';
import { useState } from 'react';
import { PlayingCardFace } from './card.js';
import type { PistiPlayerView } from './schema.js';

type Props = PlayerRendererProps<PistiPlayerView>;

/** Phone of a Pişti player: the hand; tap a card, then throw it. */
export function PistiPlayer({ view, players, playerId, submit, haptic, describeError, t }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => players.find((player) => player.id === id)?.nickname ?? '?';

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="pisti-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'END') {
    const won = view.mySide !== null && view.winners.includes(view.mySide);
    const mine = view.sides.find((side) => side.side === view.mySide);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="pisti-player-end"
        data-won={view.mySide === null ? 'null' : String(won)}
      >
        <p className="font-display text-3xl font-extrabold">
          {view.mySide === null ? t('over') : won ? t('youWon') : t('youLost')}
        </p>
        {mine && <p className="text-muted">{t('points', { count: mine.score })}</p>}
      </div>
    );
  }

  const myTurn = view.phase === 'TURN' && view.turn === playerId;
  const top = view.pile.visible.at(-1);
  const throwCard = async (cardId: number) => {
    if (busy) return;
    haptic();
    setBusy(true);
    setError(null);
    const outcome = await submit({ type: 'play', cardId });
    setBusy(false);
    if (outcome.ok) setSelected(null);
    else setError(describeError(outcome.code));
  };
  const mine = view.sides.find((side) => side.side === view.mySide);

  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="pisti-player"
      data-phase={view.phase}
      data-my-turn={myTurn}
      data-hand-count={view.hand?.length ?? 0}
    >
      <div className="flex items-center gap-4">
        {top ? (
          <PlayingCardFace card={top} size="sm" />
        ) : (
          <span className="border-line grid h-[84px] w-[60px] place-items-center rounded-lg border-2 border-dashed" />
        )}
        <span className="flex flex-col gap-1">
          <span className="text-muted text-sm">{t('pileCount', { count: view.pile.count })}</span>
          <span
            className={`font-display text-xl font-bold ${myTurn ? 'text-accent' : ''}`}
            data-testid="pisti-turn-info"
          >
            {view.phase === 'TALLY'
              ? t('dealOver', { deal: view.deal })
              : myTurn
                ? t('yourTurn')
                : t('turnOf', { name: name(view.turn) })}
          </span>
          {mine && (
            <span className="text-sm" data-testid="pisti-my-score" data-score={mine.score}>
              {t('scoreLine', { score: mine.score, cards: mine.captured })}
            </span>
          )}
        </span>
      </div>

      {view.last?.pisti && (
        <p className="bg-accent text-canvas rounded-2xl px-4 py-2 text-center font-extrabold">
          {t(view.last.pisti === 'jack' ? 'jackPisti' : 'pisti', {
            name: name(view.last.playerId),
          })}
        </p>
      )}

      {view.hand === null ? (
        <p className="bg-surface rounded-2xl px-4 py-4 text-center" data-testid="pisti-spectator">
          {t('watching')}
        </p>
      ) : (
        <>
          <HandStrip
            cards={view.hand}
            selected={selected}
            label={t('hand')}
            playable={() => myTurn}
            onSelect={(card) => {
              setError(null);
              setSelected(card.id === selected ? null : card.id);
            }}
            renderCard={(card) => <PlayingCardFace card={card} size="md" />}
          />
          {myTurn && selected !== null && (
            <button
              type="button"
              data-testid="pisti-throw"
              disabled={busy}
              onClick={() => void throwCard(selected)}
              className="bg-brand text-ink min-h-touch rounded-2xl px-4 py-3 font-bold transition-transform active:scale-95 disabled:opacity-40"
            >
              {t('throw')}
            </button>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          data-testid="pisti-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
