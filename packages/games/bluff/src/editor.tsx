'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import {
  BLUFF_MAX_ACCEPTED,
  BLUFF_MAX_DECOYS,
  BLUFF_MAX_TEXT,
  BLUFF_MIN_DECOYS,
  type BluffContent,
} from './schema.js';

export function emptyBluffContent(): BluffContent {
  return { question: '', answer: '', decoys: ['', ''] };
}

export function summarizeBluff(content: BluffContent): string {
  return `${content.question} → ${content.answer}`;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';
const smallButton =
  'rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-raised disabled:opacity-40';

/** A growable list of short texts (accepted spellings, decoys). */
function TextList({
  label,
  hint,
  values,
  min,
  max,
  onChange,
  invalid,
  testId,
  addLabel,
  removeLabel,
}: {
  label: string;
  hint: string;
  values: readonly string[];
  min: number;
  max: number;
  onChange: (values: string[]) => void;
  invalid: (index: number) => boolean;
  testId: string;
  addLabel: string;
  removeLabel: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{label}</legend>
      <p className="text-muted text-sm">{hint}</p>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            data-testid={testId}
            className={inputClass}
            maxLength={BLUFF_MAX_TEXT}
            value={value}
            aria-invalid={invalid(index)}
            onChange={(event) => {
              onChange(values.map((other, i) => (i === index ? event.target.value : other)));
            }}
          />
          <button
            type="button"
            className={smallButton}
            disabled={values.length <= min}
            onClick={() => {
              onChange(values.filter((_, i) => i !== index));
            }}
          >
            {removeLabel}
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid={`${testId}-add`}
        className={`${smallButton} self-start px-4`}
        disabled={values.length >= max}
        onClick={() => {
          onChange([...values, '']);
        }}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}

/** Admin form for one Bluff question: the answer, its other spellings and the decoys. */
export function BluffEditor({ value, onChange, t, issues }: ContentEditorProps<BluffContent>) {
  const hasIssue = (...path: (string | number)[]) =>
    issues.some(
      (issue) =>
        issue.path.length >= path.length && path.every((key, index) => issue.path[index] === key),
    );
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;

  return (
    <div className="flex flex-col gap-6" data-testid="bluff-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.question')}</span>
        <textarea
          data-testid="bluff-editor-question"
          className={`${inputClass} min-h-24`}
          maxLength={300}
          placeholder={t('editor.questionPlaceholder')}
          value={value.question}
          aria-invalid={hasIssue('question')}
          onChange={(event) => {
            onChange({ ...value, question: event.target.value });
          }}
        />
        {hasIssue('question') && invalidText}
      </label>
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.answer')}</span>
        <input
          data-testid="bluff-editor-answer"
          className={inputClass}
          maxLength={BLUFF_MAX_TEXT}
          value={value.answer}
          aria-invalid={hasIssue('answer')}
          onChange={(event) => {
            onChange({ ...value, answer: event.target.value });
          }}
        />
        {hasIssue('answer') && invalidText}
      </label>
      <div className="grid grid-cols-2 gap-6">
        <TextList
          label={t('editor.accepted')}
          hint={t('editor.acceptedHint')}
          values={value.acceptedAnswers ?? []}
          min={0}
          max={BLUFF_MAX_ACCEPTED}
          testId="bluff-editor-accepted"
          addLabel={t('editor.add')}
          removeLabel={t('editor.remove')}
          invalid={(index) => hasIssue('acceptedAnswers', index)}
          onChange={(acceptedAnswers) => {
            const next = { ...value };
            if (acceptedAnswers.length > 0) next.acceptedAnswers = acceptedAnswers;
            else delete next.acceptedAnswers;
            onChange(next);
          }}
        />
        <TextList
          label={t('editor.decoys')}
          hint={t('editor.decoysHint')}
          values={value.decoys}
          min={BLUFF_MIN_DECOYS}
          max={BLUFF_MAX_DECOYS}
          testId="bluff-editor-decoy"
          addLabel={t('editor.add')}
          removeLabel={t('editor.remove')}
          invalid={(index) => hasIssue('decoys', index)}
          onChange={(decoys) => {
            onChange({ ...value, decoys });
          }}
        />
      </div>
      {(hasIssue('decoys') || hasIssue('acceptedAnswers')) && invalidText}
    </div>
  );
}
