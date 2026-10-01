'use client';

import {
  mediaUrl,
  OptionShape,
  optionStyle,
  type PlayerRendererProps,
} from '@loudroom/game-sdk/client';
import { useState } from 'react';
import type { QuizPlayerView } from './schema.js';

/** Phone controller for a quiz question: big color + shape buttons, then the verdict. */
export function QuizPlayer({
  view,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<QuizPlayerView>) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (view.phase === 'INTRO') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="quiz-player-intro"
      >
        <p className="text-muted">{t('lookAtScreen')}</p>
        <p className="font-display text-2xl font-bold">{view.question}</p>
      </div>
    );
  }

  if (view.phase === 'REVEAL') {
    const verdict =
      view.correct === null ? t('noAnswer') : view.correct ? t('correct') : t('wrong');
    const tone =
      view.correct === null
        ? 'bg-surface-raised'
        : view.correct
          ? 'bg-success text-canvas'
          : 'bg-danger';
    const right = view.options.find((option) => option.id === view.correctOptionId);
    return (
      <div
        className="flex flex-1 flex-col gap-6"
        data-testid="quiz-player-reveal"
        data-correct={String(view.correct)}
      >
        <p
          className={`font-display rounded-3xl px-6 py-8 text-center text-4xl font-extrabold ${tone}`}
        >
          {verdict}
        </p>
        {right && (
          <div
            className="flex items-center gap-4 rounded-2xl px-5 py-4 text-white"
            style={{ backgroundColor: optionStyle(right.slot).color }}
          >
            <OptionShape slot={right.slot} size={36} />
            <span className="text-lg font-semibold">
              {t('correctAnswer', { answer: right.text })}
            </span>
          </div>
        )}
      </div>
    );
  }

  const choose = async (optionId: string) => {
    if (view.locked || sending) return;
    haptic();
    setSending(optionId);
    setError(null);
    const outcome = await submit({ optionId });
    setSending(null);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  if (view.locked) {
    const chosen = view.options.find((option) => option.id === view.selectedOptionId);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
        data-testid="quiz-player-locked"
      >
        {chosen && (
          <span
            className="grid size-32 place-items-center rounded-3xl"
            style={{ backgroundColor: optionStyle(chosen.slot).color }}
          >
            <OptionShape slot={chosen.slot} size={72} />
          </span>
        )}
        <p className="font-display text-2xl font-bold">{t('answerLocked')}</p>
        <p className="text-muted">{t('waitForOthers')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ul className="grid flex-1 grid-cols-2 gap-3">
        {view.options.map((option) => {
          const style = optionStyle(option.slot);
          const selected = view.selectedOptionId === option.id || sending === option.id;
          return (
            <li key={option.id} className="flex">
              <button
                type="button"
                data-testid="quiz-answer"
                data-option-id={option.id}
                aria-pressed={selected}
                disabled={sending !== null}
                onClick={() => void choose(option.id)}
                className={`flex min-h-[120px] flex-1 flex-col items-center justify-center gap-2 rounded-3xl px-3 py-4 text-white transition-transform active:scale-95 ${
                  selected ? 'ring-ink ring-4' : ''
                }`}
                style={{ backgroundColor: style.color }}
              >
                {option.mediaId ? (
                  <img
                    src={mediaUrl(option.mediaId)}
                    alt=""
                    className="h-20 w-full rounded-2xl bg-black/20 object-cover"
                  />
                ) : (
                  <OptionShape slot={option.slot} size={44} />
                )}
                <span className="text-base leading-tight font-semibold">{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p
          role="alert"
          data-testid="quiz-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
