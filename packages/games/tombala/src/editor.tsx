'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import type { TombalaContent } from './schema.js';

export function emptyTombalaContent(): TombalaContent {
  return { title: '' };
}

export function summarizeTombala(content: TombalaContent): string {
  return content.title;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for a Tombala game: only its name; draws and prizes are round settings. */
export function TombalaEditor({ value, onChange, t, issues }: ContentEditorProps<TombalaContent>) {
  const invalid = issues.some((issue) => issue.path[0] === 'title');
  return (
    <div className="flex flex-col gap-6" data-testid="tombala-editor">
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="tombala-editor-title"
          className={inputClass}
          maxLength={60}
          placeholder={t('editor.titlePlaceholder')}
          value={value.title}
          aria-invalid={invalid}
          onChange={(event) => {
            onChange({ ...value, title: event.target.value });
          }}
        />
        {invalid && <p className="text-danger text-sm">{t('editor.invalid')}</p>}
        <span className="text-muted text-sm">{t('editor.titleHint')}</span>
      </label>
    </div>
  );
}
