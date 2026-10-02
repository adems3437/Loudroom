'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { formatTyping, formatValue, parseTyped } from './format.js';
import type { ClosestNumberContent, DisplayFormat } from './schema.js';

export function emptyClosestNumberContent(): ClosestNumberContent {
  // NaN is sent as null, so an untouched answer fails validation instead of saving 0.
  return { question: '', answer: Number.NaN, displayFormat: 'number' };
}

export function summarizeClosestNumber(content: ClosestNumberContent): string {
  return `${content.question} → ${formatValue(content.answer, content.displayFormat, content.unit)}`;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for one Closest Number question: text, answer, unit and how it is written. */
export function ClosestNumberEditor({
  value,
  onChange,
  t,
  issues,
}: ContentEditorProps<ClosestNumberContent>) {
  const [answerText, setAnswerText] = useState(() =>
    Number.isFinite(value.answer)
      ? formatTyping(String(value.answer).replace('.', ','), value.displayFormat)
      : '',
  );
  const hasIssue = (field: string) => issues.some((issue) => issue.path[0] === field);
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;

  const setAnswer = (text: string, format: DisplayFormat) => {
    const shown = formatTyping(text, format);
    setAnswerText(shown);
    onChange({ ...value, displayFormat: format, answer: parseTyped(shown) ?? Number.NaN });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="closest-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.question')}</span>
        <textarea
          data-testid="closest-editor-question"
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

      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-semibold">{t('editor.answer')}</span>
          <input
            data-testid="closest-editor-answer"
            className={inputClass}
            inputMode="decimal"
            value={answerText}
            aria-invalid={hasIssue('answer')}
            onChange={(event) => {
              setAnswer(event.target.value, value.displayFormat);
            }}
          />
          {hasIssue('answer') && invalidText}
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-semibold">{t('editor.unit')}</span>
          <input
            data-testid="closest-editor-unit"
            className={inputClass}
            maxLength={24}
            placeholder={t('editor.unitPlaceholder')}
            value={value.unit ?? ''}
            aria-invalid={hasIssue('unit')}
            onChange={(event) => {
              const next = { ...value };
              if (event.target.value) next.unit = event.target.value;
              else delete next.unit;
              onChange(next);
            }}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-semibold">{t('editor.displayFormat')}</span>
          <select
            data-testid="closest-editor-format"
            className={inputClass}
            value={value.displayFormat}
            onChange={(event) => {
              setAnswer(answerText, event.target.value === 'year' ? 'year' : 'number');
            }}
          >
            <option value="number">{t('editor.formatNumber')}</option>
            <option value="year">{t('editor.formatYear')}</option>
          </select>
        </label>
      </div>
      <p className="text-muted text-sm">{t('editor.answerHint')}</p>
    </div>
  );
}
