'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import type { WhoWouldPlayerView } from './schema.js';

/** Phone controller for "Kim Yapar?": tap a player to vote; votes stay anonymous. */
export function WhoWouldPlayer({
  view,
  players,
  playerId,
  submit,
  haptic,
  describeError,
  t,
  Avatar,
}: PlayerRendererProps<WhoWouldPlayerView>) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(players.map((player) => [player.id, player]));

  if (view.phase === 'INTRO' || view.phase === 'SKIPPED') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid={view.phase === 'INTRO' ? 'who-player-intro' : 'who-player-skipped'}
      >
        <p className="text-muted">
          {view.phase === 'INTRO'
            ? t('lookAtScreen')
            : t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
        <p className="font-display text-2xl font-bold">{view.question}</p>
      </div>
    );
  }

  if (view.phase === 'REVEAL') {
    const iWon = view.winners.includes(playerId);
    const verdict =
      view.correct === null ? t('noVote') : view.correct ? t('withMajority') : t('notWithMajority');
    const names = view.winners.map((id) => byId.get(id)?.nickname ?? '?').join(', ');
    return (
      <div
        className="flex flex-1 flex-col gap-5"
        data-testid="who-player-reveal"
        data-correct={String(view.correct)}
      >
        <p
          className={`font-display rounded-3xl px-6 py-8 text-center text-3xl font-extrabold ${
            view.correct ? 'bg-success text-canvas' : 'bg-surface-raised'
          }`}
        >
          {verdict}
        </p>
        {view.winners.length > 0 && (
          <p className="text-center text-lg">
            {view.title
              ? t('titleGoesTo', { title: view.title, names })
              : t('mostVoted', { names })}
          </p>
        )}
        {iWon && view.title && (
          <p
            className="bg-accent text-canvas rounded-2xl px-4 py-3 text-center font-bold"
            data-testid="who-my-title"
          >
            {t('youGotTitle', { title: view.title })}
          </p>
        )}
      </div>
    );
  }

  const vote = async (target: string) => {
    if (view.votedFor || sending) return;
    haptic();
    setSending(target);
    setError(null);
    const outcome = await submit({ playerId: target });
    setSending(null);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  if (view.votedFor) {
    const chosen = byId.get(view.votedFor);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="who-player-locked"
      >
        {chosen && <Avatar avatar={chosen.avatar} color={chosen.color} size={112} />}
        <p className="font-display text-2xl font-bold">{t('voteLocked')}</p>
        <p className="text-muted">{t('anonymous')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="font-display text-xl leading-tight font-bold">{view.question}</p>
      <ul className="grid grid-cols-2 gap-3">
        {view.candidates.map((id) => {
          const player = byId.get(id);
          if (!player) return null;
          const self = id === playerId;
          return (
            <li key={id} className="flex">
              <button
                type="button"
                data-testid="who-candidate"
                data-player-id={id}
                disabled={sending !== null || (self && !view.allowSelfVote)}
                aria-pressed={sending === id}
                onClick={() => void vote(id)}
                className={`bg-surface flex min-h-[112px] flex-1 flex-col items-center justify-center gap-2 rounded-3xl px-2 py-3 transition-transform active:scale-95 disabled:opacity-40 ${
                  sending === id ? 'ring-ink ring-4' : ''
                }`}
              >
                <Avatar avatar={player.avatar} color={player.color} size={56} />
                <span className="max-w-full truncate font-semibold">
                  {self ? t('me', { nickname: player.nickname }) : player.nickname}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p
          role="alert"
          data-testid="who-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
