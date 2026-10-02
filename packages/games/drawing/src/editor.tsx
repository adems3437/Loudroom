'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import { DRAWING_MAX_WORD, type DrawingContent } from './schema.js';

export function emptyDrawingContent(): DrawingContent {
  return { word: '' };
}

export function summarizeDrawing(content: DrawingContent): string {
  return content.alternatives?.length
    ? `${content.word} (${content.alternatives.join(', ')})`
    : content.word;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for one word to draw and its other accepted spellings. */
export function DrawingEditor({ value, onChange, t, issues }: ContentEditorProps<DrawingContent>) {
  const hasIssue = (field: string) => issues.some((issue) => issue.path[0] === field);
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;
  const alternatives = value.alternatives ?? [];

  return (
    <div className="flex flex-col gap-6" data-testid="drawing-editor">
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.word')}</span>
        <input
          data-testid="drawing-editor-word"
          className={inputClass}
          maxLength={DRAWING_MAX_WORD}
          placeholder={t('editor.wordPlaceholder')}
          value={value.word}
          aria-invalid={hasIssue('word')}
          onChange={(event) => {
            onChange({ ...value, word: event.target.value });
          }}
        />
        {hasIssue('word') && invalidText}
      </label>
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.alternatives')}</span>
        <input
          data-testid="drawing-editor-alternatives"
          className={inputClass}
          placeholder={t('editor.alternativesPlaceholder')}
          value={alternatives.join(', ')}
          aria-invalid={hasIssue('alternatives')}
          onChange={(event) => {
            const list = event.target.value
              .split(',')
              .map((part) => part.trimStart())
              .slice(0, 5);
            const next = { ...value };
            if (list.some((part) => part.length > 0)) next.alternatives = list;
            else delete next.alternatives;
            onChange(next);
          }}
        />
        <span className="text-muted text-sm">{t('editor.alternativesHint')}</span>
        {hasIssue('alternatives') && invalidText}
      </label>
    </div>
  );
}
