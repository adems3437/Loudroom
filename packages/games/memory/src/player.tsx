'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { ItemCard } from './item-card.js';
import { questionText } from './question-text.js';
import type { MemoryPlayerView } from './schema.js';

/** Phone controller for Memory: watch the TV, then answer the questions one by one. */
export function MemoryPlayer({
  view,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<MemoryPlayerView>) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view.phase === 'INTRO' || view.phase === 'SHOW') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="memory-player-watch"
      >
        <p className="font-display text-3xl font-extrabold">{t('lookAtScreen')}</p>
        <p className="text-muted">{t('memorizeHint')}</p>
      </div>
    );
  }

  if (view.phase === 'REVEAL') {
    return (
      <div className="flex flex-1 flex-col gap-3" data-testid="memory-player-reveal">
        <p className="font-display text-center text-3xl font-extrabold">
          {t('score', { count: view.correctCount, total: view.questions.length })}
        </p>
        <ol className="flex flex-col gap-2">
          {view.questions.map((question, index) => {
            const mine = view.answers[String(index)];
            const right = question.options.find((o) => o.id === question.correctOptionId);
            const ok = mine === question.correctOptionId;
            return (
              <li
                key={index}
                data-testid="memory-player-answer"
                data-right={ok}
                className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
                  ok ? 'bg-success/20' : 'bg-surface'
                }`}
              >
                <span>{questionText(question, t)}</span>
                <span className="font-bold">
                  {right?.item?.label ?? right?.number} {ok ? '✓' : '✗'}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const index = view.questions.findIndex((_, i) => view.answers[String(i)] === undefined);
  const question = view.questions[index];
  if (!question) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="memory-player-done"
      >
        <p className="font-display text-3xl font-extrabold">{t('allAnswered')}</p>
        <p className="text-muted">{t('waitForOthers')}</p>
      </div>
    );
  }

  const choose = async (optionId: string) => {
    if (sending) return;
    haptic();
    setSending(true);
    setError(null);
    const outcome = await submit({ question: index, optionId });
    setSending(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="memory-player-question"
      data-index={index}
    >
      <p className="text-muted text-center">
        {t('questionOf', { current: index + 1, total: view.questions.length })}
      </p>
      <p className="font-display text-center text-2xl font-bold">{questionText(question, t)}</p>
      {question.subject && (
        <div className="flex justify-center">
          <ItemCard item={question.subject} size={72} />
        </div>
      )}
      <ul className="grid flex-1 grid-cols-2 gap-3">
        {question.options.map((option) => (
          <li key={option.id} className="flex">
            <button
              type="button"
              data-testid="memory-option"
              data-option-id={option.id}
              disabled={sending}
              onClick={() => void choose(option.id)}
              className="bg-surface min-h-[120px] flex-1 rounded-3xl p-3 transition-transform active:scale-95"
            >
              {option.item ? (
                <ItemCard item={option.item} size={56} />
              ) : (
                <span className="font-display text-5xl font-extrabold">{option.number}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="bg-danger/15 text-danger rounded-xl px-4 py-3">
          {error}
        </p>
      )}
    </div>
  );
}
