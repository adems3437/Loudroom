'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import type { AmiralContent } from './schema.js';

export function emptyAmiralContent(): AmiralContent {
  return { title: '' };
}

export function summarizeAmiral(content: AmiralContent): string {
  return content.title;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for an Amiral Battı match: only its name; the rules are round settings. */
export function AmiralEditor({ value, onChange, t, issues }: ContentEditorProps<AmiralContent>) {
  const invalid = issues.some((issue) => issue.path[0] === 'title');
  return (
    <div className="flex flex-col gap-6" data-testid="amiral-editor">
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="amiral-editor-title"
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
