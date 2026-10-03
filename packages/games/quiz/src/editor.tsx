'use client';

import { OptionShape, optionStyle, type ContentEditorProps } from '@loudroom/game-sdk/client';
import { QUIZ_MAX_OPTIONS, QUIZ_MIN_OPTIONS, type QuizContent } from './schema.js';

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export function emptyQuizContent(): QuizContent {
  return {
    question: '',
    options: [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
      { id: 'c', text: '' },
      { id: 'd', text: '' },
    ],
    correctOptionId: 'a',
  };
}

export function summarizeQuiz(content: QuizContent): string {
  return content.question;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for one quiz question: text, optional image, 2–6 options with one correct. */
export function QuizEditor({
  value,
  onChange,
  t,
  MediaField,
  issues,
}: ContentEditorProps<QuizContent>) {
  const hasIssue = (...path: (string | number)[]) =>
    issues.some(
      (issue) =>
        issue.path.length >= path.length && path.every((key, index) => issue.path[index] === key),
    );
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;

  /** `mediaId: null` removes the option's image. */
  const setOption = (index: number, patch: { text?: string; mediaId?: string | null }) => {
    onChange({
      ...value,
      options: value.options.map((option, i) => {
        if (i !== index) return option;
        const next = { ...option };
        if (patch.text !== undefined) next.text = patch.text;
        if (patch.mediaId) next.mediaId = patch.mediaId;
        else if (patch.mediaId === null) delete next.mediaId;
        return next;
      }),
    });
  };

  const addOption = () => {
    const id = OPTION_IDS.find((candidate) => !value.options.some((o) => o.id === candidate));
    if (!id) return;
    onChange({ ...value, options: [...value.options, { id, text: '' }] });
  };

  const removeOption = (index: number) => {
    const removed = value.options[index];
    const options = value.options.filter((_, i) => i !== index);
    const correctOptionId =
      removed?.id === value.correctOptionId ? (options[0]?.id ?? '') : value.correctOptionId;
    onChange({ ...value, options, correctOptionId });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="quiz-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.question')}</span>
        <textarea
          data-testid="quiz-editor-question"
          className={`${inputClass} min-h-24`}
          maxLength={300}
          value={value.question}
          aria-invalid={hasIssue('question')}
          onChange={(event) => {
            onChange({ ...value, question: event.target.value });
          }}
        />
        {hasIssue('question') && invalidText}
      </label>

      <MediaField
        label={t('editor.questionMedia')}
        testId="quiz-editor-question-image"
        accept="any"
        value={value.media?.mediaId ?? null}
        onChange={(mediaId, kind) => {
          const next = { ...value };
          if (mediaId) next.media = { type: kind ?? 'image', mediaId };
          else delete next.media;
          onChange(next);
        }}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">{t('editor.options')}</legend>
        <p className="text-muted text-sm">{t('editor.correctHint')}</p>
        {value.options.map((option, index) => (
          <div
            key={option.id}
            data-testid="quiz-editor-option-row"
            className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-3"
          >
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: optionStyle(index).color }}
            >
              <OptionShape slot={index} size={22} />
            </span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="quiz-correct"
                data-testid="quiz-editor-correct"
                className="accent-success size-5"
                checked={value.correctOptionId === option.id}
                onChange={() => {
                  onChange({ ...value, correctOptionId: option.id });
                }}
              />
              {t('editor.correct')}
            </label>
            <input
              data-testid="quiz-editor-option"
              className={`${inputClass} min-w-48 flex-1`}
              maxLength={120}
              placeholder={t('editor.optionPlaceholder', { number: index + 1 })}
              value={option.text}
              aria-invalid={hasIssue('options', index)}
              onChange={(event) => {
                setOption(index, { text: event.target.value });
              }}
            />
            <MediaField
              label={t('editor.optionImage')}
              testId="quiz-editor-option-image"
              value={option.mediaId ?? null}
              onChange={(mediaId) => {
                setOption(index, { mediaId });
              }}
            />
            <button
              type="button"
              data-testid="quiz-editor-remove-option"
              className="border-line text-muted hover:bg-danger hover:text-ink rounded-xl border px-3 py-2 text-sm disabled:opacity-40"
              disabled={value.options.length <= QUIZ_MIN_OPTIONS}
              onClick={() => {
                removeOption(index);
              }}
            >
              {t('editor.removeOption')}
            </button>
          </div>
        ))}
        {(hasIssue('options') || hasIssue('correctOptionId')) && invalidText}
        <button
          type="button"
          data-testid="quiz-editor-add-option"
          className="border-line hover:bg-surface-raised self-start rounded-xl border px-4 py-2 disabled:opacity-40"
          disabled={value.options.length >= QUIZ_MAX_OPTIONS}
          onClick={addOption}
        >
          {t('editor.addOption')}
        </button>
      </fieldset>
    </div>
  );
}
