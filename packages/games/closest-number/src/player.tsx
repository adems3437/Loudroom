'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { formatTyping, formatValue, parseTyped } from './format.js';
import type { ClosestNumberPlayerView } from './schema.js';

type Answering = Extract<ClosestNumberPlayerView, { phase: 'ANSWERING' }>;

/** Number pad entry with Turkish grouping while typing, then one send. */
function GuessForm({
  view,
  submit,
  haptic,
  describeError,
  t,
}: Pick<PlayerRendererProps<Answering>, 'view' | 'submit' | 'haptic' | 'describeError' | 't'>) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parseTyped(text);

  const send = async () => {
    if (value === null || sending) return;
    haptic();
    setSending(true);
    setError(null);
    const outcome = await submit({ value });
    setSending(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="font-display text-xl font-bold">{view.question}</p>
      <label className="flex flex-col gap-2">
        <span className="text-muted">
          {view.displayFormat === 'year' ? t('yourYear') : t('yourGuess')}
        </span>
        <span className="bg-surface border-line focus-within:border-brand flex items-center gap-3 rounded-3xl border-2 px-5">
          <input
            data-testid="closest-input"
            className="min-h-touch w-full min-w-0 bg-transparent py-4 text-4xl font-extrabold tabular-nums focus:outline-none"
            inputMode={view.displayFormat === 'year' ? 'numeric' : 'decimal'}
            autoComplete="off"
            enterKeyHint="send"
            maxLength={20}
            value={text}
            onChange={(event) => {
              setText(formatTyping(event.target.value, view.displayFormat));
            }}
          />
          {view.unit && <span className="text-muted text-2xl font-bold">{view.unit}</span>}
        </span>
      </label>
      <button
        type="submit"
        data-testid="closest-submit"
        disabled={value === null || sending}
        className="bg-brand min-h-touch rounded-3xl px-6 py-5 text-2xl font-extrabold text-white transition-transform active:scale-95 disabled:opacity-40"
      >
        {t('send')}
      </button>
      {error && (
        <p
          role="alert"
          data-testid="closest-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </form>
  );
}

/** Phone controller for a Closest Number question (SPEC §7.2). */
export function ClosestNumberPlayer({
  view,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<ClosestNumberPlayerView>) {
  if (view.phase === 'INTRO') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="closest-player-intro"
      >
        <p className="text-muted">{t('lookAtScreen')}</p>
        <p className="font-display text-2xl font-bold">{view.question}</p>
      </div>
    );
  }

  if (view.phase === 'ANSWERING') {
    if (view.guess === null) {
      return (
        <GuessForm
          view={view}
          submit={submit}
          haptic={haptic}
          describeError={describeError}
          t={t}
        />
      );
    }
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="closest-player-locked"
      >
        <p className="text-muted">{t('yourGuessWas')}</p>
        <p className="font-display text-5xl font-extrabold tabular-nums">
          {formatValue(view.guess, view.displayFormat, view.unit)}
        </p>
        <p className="text-muted">{t('waitForOthers')}</p>
      </div>
    );
  }

  const verdict =
    view.correct === null
      ? t('noAnswer')
      : view.correct
        ? t('closest')
        : t('rankOf', {
            rank: view.rank ?? 0,
            total: view.answeredCount,
          });
  const tone =
    view.correct === null
      ? 'bg-surface-raised'
      : view.correct
        ? 'bg-success text-canvas'
        : 'bg-surface-raised';
  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="closest-player-reveal"
      data-correct={String(view.correct)}
    >
      <p
        className={`font-display rounded-3xl px-6 py-8 text-center text-4xl font-extrabold ${tone}`}
      >
        {verdict}
      </p>
      <p className="text-center text-lg">
        {t('correctAnswer', { answer: formatValue(view.answer, view.displayFormat, view.unit) })}
      </p>
      {view.guess !== null && (
        <p className="text-muted text-center">
          {t('yourGuessIs', { guess: formatValue(view.guess, view.displayFormat, view.unit) })}
        </p>
      )}
    </div>
  );
}
