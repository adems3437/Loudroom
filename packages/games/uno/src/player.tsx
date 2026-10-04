'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { HandStrip } from '@loudroom/table-kit/client';
import { useState } from 'react';
import { UnoCardFace, colorClass } from './card.js';
import {
  UNO_COLORS,
  isWild,
  type UnoCard,
  type UnoColor,
  type UnoInput,
  type UnoPlayerView,
} from './schema.js';

type Props = PlayerRendererProps<UnoPlayerView>;

const button =
  'min-h-touch rounded-2xl px-4 py-3 font-bold transition-transform active:scale-95 disabled:opacity-40';

/** Phone of an UNO player: the hand, play / draw / pass, "UNO!" and "Yakala!". */
export function UnoPlayer({ view, players, playerId, submit, haptic, describeError, t }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => players.find((player) => player.id === id)?.nickname ?? '?';

  const send = async (input: UnoInput) => {
    if (busy) return;
    haptic();
    setBusy(true);
    setError(null);
    const outcome = await submit(input);
    setBusy(false);
    if (outcome.ok) setSelected(null);
    // A missed catch: everyone with one card had said "UNO!".
    else if (input.type === 'catch' && outcome.code === 'INVALID_INPUT') {
      setError(t('nothingToCatch'));
    } else setError(describeError(outcome.code));
  };

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="uno-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'END') {
    const place = view.ranking.findIndex((row) => row.playerId === playerId);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="uno-player-end"
        data-place={place + 1}
      >
        <p className="font-display text-3xl font-extrabold">
          {view.winner === playerId ? t('youWon') : t('won', { name: name(view.winner) })}
        </p>
        {place >= 0 && <p className="text-muted">{t('yourPlace', { place: place + 1 })}</p>}
      </div>
    );
  }

  const myTurn = view.turn === playerId;
  const hand = view.hand;
  const chosen = hand?.find((card) => card.id === selected) ?? null;
  const canPlayChosen = chosen !== null && view.playable.includes(chosen.id);
  const play = (card: UnoCard, color?: UnoColor) =>
    void send({ type: 'play', cardId: card.id, ...(color ? { color } : {}) });

  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="uno-player"
      data-phase={view.phase}
      data-my-turn={myTurn}
      data-hand-count={hand?.length ?? 0}
    >
      <div className="flex items-center gap-4">
        <UnoCardFace card={view.top} size="sm" />
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm">
            <span className={`size-4 rounded-full ${colorClass(view.color)}`} />
            {t(`color.${view.color}`)}
            {view.pending > 0 && (
              <span className="text-danger font-bold">{t('pending', { count: view.pending })}</span>
            )}
          </span>
          <span
            className={`font-display text-xl font-bold ${myTurn ? 'text-accent' : ''}`}
            data-testid="uno-turn-info"
          >
            {myTurn ? t('yourTurn') : t('turnOf', { name: name(view.turn) })}
          </span>
        </span>
      </div>

      {hand === null ? (
        <p className="bg-surface rounded-2xl px-4 py-4 text-center" data-testid="uno-spectator">
          {t('watching')}
        </p>
      ) : (
        <>
          <HandStrip
            cards={hand}
            selected={selected}
            label={t('hand')}
            playable={(card) => view.playable.includes(card.id)}
            onSelect={(card) => {
              setError(null);
              setSelected(card.id === selected ? null : card.id);
            }}
            renderCard={(card) => <UnoCardFace card={card} size="md" />}
          />

          {chosen && canPlayChosen && isWild(chosen) && (
            <div className="grid grid-cols-4 gap-2" data-testid="uno-colors">
              {UNO_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  data-testid="uno-color"
                  data-color={color}
                  aria-label={t(`color.${color}`)}
                  disabled={busy}
                  onClick={() => {
                    play(chosen, color);
                  }}
                  className={`min-h-touch rounded-2xl ${colorClass(color)} disabled:opacity-40`}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {chosen && canPlayChosen && !isWild(chosen) && (
              <button
                type="button"
                data-testid="uno-play"
                disabled={busy}
                onClick={() => {
                  play(chosen);
                }}
                className={`${button} bg-brand text-ink col-span-2`}
              >
                {t('play')}
              </button>
            )}
            {chosen && !canPlayChosen && (
              <p className="text-muted col-span-2 text-center text-sm">
                {myTurn ? t('cannotPlay') : t('notYourTurn')}
              </p>
            )}
            {myTurn && view.drawn === null && (
              <button
                type="button"
                data-testid="uno-draw"
                disabled={busy}
                onClick={() => void send({ type: 'draw' })}
                className={`${button} border-line border`}
              >
                {view.pending > 0 ? t('drawPending', { count: view.pending }) : t('draw')}
              </button>
            )}
            {myTurn && view.drawn !== null && (
              <button
                type="button"
                data-testid="uno-pass"
                disabled={busy}
                onClick={() => void send({ type: 'pass' })}
                className={`${button} border-line border`}
              >
                {t('pass')}
              </button>
            )}
            {hand.length <= 2 && !view.called && (
              <button
                type="button"
                data-testid="uno-say"
                disabled={busy}
                onClick={() => void send({ type: 'uno' })}
                className={`${button} bg-danger text-ink`}
              >
                {t('sayUno')}
              </button>
            )}
            {view.canCatch && (
              <button
                type="button"
                data-testid="uno-catch"
                disabled={busy}
                onClick={() => void send({ type: 'catch' })}
                className={`${button} bg-warning text-canvas`}
              >
                {t('catch')}
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          data-testid="uno-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
