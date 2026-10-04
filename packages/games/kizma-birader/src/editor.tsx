'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import type { KizmaContent } from './schema.js';

export function emptyKizmaContent(): KizmaContent {
  return { title: '' };
}

export function summarizeKizma(content: KizmaContent): string {
  return content.title;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for a Kızma Birader match: only its name; the rules are round settings. */
export function KizmaEditor({ value, onChange, t, issues }: ContentEditorProps<KizmaContent>) {
  const invalid = issues.some((issue) => issue.path[0] === 'title');
  return (
    <div className="flex flex-col gap-6" data-testid="kizma-editor">
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="kizma-editor-title"
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
