'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { BLUFF_MAX_TEXT, type BluffPlayerView } from './schema.js';

type Write = Extract<BluffPlayerView, { phase: 'WRITE' }>;

function LieForm({
  view,
  submit,
  haptic,
  describeError,
  t,
}: Pick<PlayerRendererProps<Write>, 'view' | 'submit' | 'haptic' | 'describeError' | 't'>) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim() || sending) return;
    haptic();
    setSending(true);
    setError(null);
    const outcome = await submit({ type: 'lie', text });
    setSending(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      data-testid="bluff-player-write"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="font-display text-xl leading-tight font-bold">{view.question}</p>
      <label className="flex flex-col gap-2">
        <span className="text-muted">{t('yourLie')}</span>
        <input
          data-testid="bluff-input"
          className="bg-surface border-line focus:border-brand min-h-touch rounded-3xl border-2 px-5 py-4 text-2xl font-bold focus:outline-none"
          maxLength={BLUFF_MAX_TEXT}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="send"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
      </label>
      <p className="text-muted text-sm">{t('lieHint')}</p>
      <button
        type="submit"
        data-testid="bluff-submit"
        disabled={!text.trim() || sending}
        className="bg-brand min-h-touch rounded-3xl px-6 py-4 text-2xl font-extrabold text-white transition-transform active:scale-95 disabled:opacity-40"
      >
        {t('send')}
      </button>
      {error && (
        <p
          role="alert"
          data-testid="bluff-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </form>
  );
}

/** Phone controller for Bluff: write a lie, then find the truth among everyone's lies. */
export function BluffPlayer({
  view,
  players,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<BluffPlayerView>) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = (ids: readonly string[]) =>
    ids.map((id) => players.find((player) => player.id === id)?.nickname ?? '?').join(', ');

  if (view.phase === 'INTRO') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="bluff-player-intro"
      >
        <p className="text-muted">{t('lookAtScreen')}</p>
        <p className="font-display text-2xl font-bold">{view.question}</p>
      </div>
    );
  }

  if (view.phase === 'WRITE') {
    if (view.lie === null) {
      return (
        <LieForm view={view} submit={submit} haptic={haptic} describeError={describeError} t={t} />
      );
    }
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="bluff-player-written"
      >
        <p className="text-muted">{t('lieAccepted')}</p>
        <p className="font-display text-3xl font-extrabold">«{view.lie}»</p>
        <p className="text-muted">{t('waitForOthers')}</p>
      </div>
    );
  }

  if (view.phase === 'VOTE') {
    if (view.vote) {
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          data-testid="bluff-player-voted"
        >
          <p className="font-display text-2xl font-bold">{t('voteLocked')}</p>
          <p className="text-3xl font-extrabold">
            {view.options.find((option) => option.id === view.vote)?.text}
          </p>
          <p className="text-muted">{t('waitForOthers')}</p>
        </div>
      );
    }
    const choose = async (optionId: string) => {
      if (sending) return;
      haptic();
      setSending(optionId);
      setError(null);
      const outcome = await submit({ type: 'vote', optionId });
      setSending(null);
      if (!outcome.ok) setError(describeError(outcome.code));
    };
    return (
      <div className="flex flex-1 flex-col gap-3" data-testid="bluff-player-vote">
        <p className="font-display text-lg leading-tight font-bold">{t('findTruth')}</p>
        <ul className="flex flex-col gap-2">
          {view.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                data-testid="bluff-option"
                data-option-id={option.id}
                data-own={option.own}
                disabled={option.own || sending !== null}
                onClick={() => void choose(option.id)}
                className={`bg-surface min-h-touch flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3 text-left text-xl font-bold transition-transform active:scale-95 disabled:opacity-40 ${
                  sending === option.id ? 'ring-ink ring-4' : ''
                }`}
              >
                <span>{option.text}</span>
                {option.own && <span className="text-muted text-sm">{t('ownLie')}</span>}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p
            role="alert"
            data-testid="bluff-error"
            className="bg-danger/15 text-danger rounded-xl px-4 py-3"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!view.done) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="bluff-player-revealing"
      >
        <p className="font-display text-3xl font-extrabold">{t('lookAtScreen')}</p>
      </div>
    );
  }

  const verdict =
    view.correct === null
      ? t('noVote')
      : view.correct
        ? t('foundTruth')
        : view.pickedDecoy
          ? t('fooledByHouse')
          : t('fooledBy', { names: names(view.fooledBy) });
  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="bluff-player-reveal"
      data-correct={String(view.correct)}
    >
      <p
        className={`font-display rounded-3xl px-6 py-6 text-center text-3xl font-extrabold ${
          view.correct ? 'bg-success text-canvas' : 'bg-surface-raised'
        }`}
      >
        {verdict}
      </p>
      <p className="text-center text-lg">{t('truthWas', { truth: view.truth })}</p>
      {view.lie !== null && (
        <p className="text-muted text-center" data-testid="bluff-fooled">
          {view.fooled.length > 0
            ? t('youFooled', { names: names(view.fooled) })
            : t('nobodyFooled')}
        </p>
      )}
    </div>
  );
}
