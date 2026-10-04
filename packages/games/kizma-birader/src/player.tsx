'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { BoardView, Die } from './board-view.js';
import type { KizmaInput, KizmaPlayerView } from './schema.js';

type Props = PlayerRendererProps<KizmaPlayerView>;

/** Phone of a Kızma Birader player: roll the die, then pick the pawn to move. */
export function KizmaPlayer({ view, players, playerId, submit, haptic, describeError, t }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => players.find((player) => player.id === id)?.nickname ?? '?';

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="kizma-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'END') {
    const place = view.ranking.findIndex((row) => row.playerId === playerId);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="kizma-player-end"
        data-place={place + 1}
      >
        <p className="font-display text-3xl font-extrabold">
          {place === 0 ? t('youWon') : t('won', { name: name(view.ranking[0]?.playerId ?? '') })}
        </p>
        {place >= 0 && <p className="text-muted">{t('yourPlace', { place: place + 1 })}</p>}
      </div>
    );
  }

  const send = async (input: KizmaInput) => {
    if (busy) return;
    haptic();
    setBusy(true);
    setError(null);
    const outcome = await submit(input);
    setBusy(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  const myTurn = view.turn === playerId;
  const me = view.board.players.find((p) => p.playerId === playerId);
  const pawnLabel = (progress: number) =>
    progress < 0
      ? t('pawnYard')
      : progress >= view.board.track
        ? t('pawnHome')
        : t('pawnTrack', { steps: progress + 1, total: view.board.track });

  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="kizma-player"
      data-phase={view.phase}
      data-my-turn={myTurn}
    >
      <div className="flex items-center gap-4">
        <Die value={view.die} size={72} />
        <span className="flex flex-col">
          <span
            className={`font-display text-xl font-bold ${myTurn ? 'text-accent' : ''}`}
            data-testid="kizma-turn-info"
          >
            {myTurn ? t('yourTurn') : t('turnOf', { name: name(view.turn) })}
          </span>
          {myTurn && view.phase === 'MOVE' && (
            <span className="text-muted text-sm">{t('pickPawn')}</span>
          )}
          {myTurn && view.phase === 'ROLL' && view.triesLeft > 1 && (
            <span className="text-muted text-sm">{t('tries', { count: view.triesLeft })}</span>
          )}
        </span>
      </div>

      <div className="mx-auto aspect-square w-full max-w-[340px]">
        <BoardView
          board={view.board}
          players={players}
          movable={myTurn ? view.movable : []}
          turn={view.turn}
          onPawn={
            myTurn && view.phase === 'MOVE'
              ? (pawn) => void send({ type: 'move', pawn })
              : undefined
          }
        />
      </div>

      {!view.seated ? (
        <p className="bg-surface rounded-2xl px-4 py-4 text-center" data-testid="kizma-spectator">
          {t('watching')}
        </p>
      ) : (
        <>
          {myTurn && view.phase === 'ROLL' && (
            <button
              type="button"
              data-testid="kizma-roll"
              disabled={busy}
              onClick={() => void send({ type: 'roll' })}
              className="bg-brand text-ink font-display min-h-touch rounded-3xl px-6 py-4 text-2xl font-extrabold transition-transform active:scale-95 disabled:opacity-40"
            >
              {t('roll')}
            </button>
          )}
          <ul className="grid grid-cols-2 gap-2">
            {me?.pawns.map((progress, pawn) => {
              const canMove = myTurn && view.phase === 'MOVE' && view.movable.includes(pawn);
              return (
                <li key={pawn} className="flex">
                  <button
                    type="button"
                    data-testid="kizma-pawn"
                    data-pawn={pawn}
                    data-movable={canMove}
                    disabled={!canMove || busy}
                    onClick={() => void send({ type: 'move', pawn })}
                    className={`min-h-touch flex-1 rounded-2xl px-3 py-2 text-left disabled:opacity-50 ${
                      canMove ? 'bg-accent text-canvas font-bold' : 'bg-surface'
                    }`}
                  >
                    {t('pawn', { number: pawn + 1 })} · {pawnLabel(progress)}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error && (
        <p
          role="alert"
          data-testid="kizma-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
