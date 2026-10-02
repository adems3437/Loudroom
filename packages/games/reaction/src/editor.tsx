'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import type { ReactionContent } from './schema.js';

export function emptyReactionContent(): ReactionContent {
  return { title: '', variant: 'classic' };
}

export function summarizeReaction(content: ReactionContent): string {
  return content.title;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for one Reaction challenge: its name and kind. */
export function ReactionEditor({
  value,
  onChange,
  t,
  issues,
}: ContentEditorProps<ReactionContent>) {
  const invalid = issues.some((issue) => issue.path[0] === 'title');
  return (
    <div className="grid max-w-2xl grid-cols-2 gap-6" data-testid="reaction-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="reaction-editor-title"
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
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.variant')}</span>
        <select
          data-testid="reaction-editor-variant"
          className={inputClass}
          value={value.variant}
          onChange={(event) => {
            onChange({ ...value, variant: event.target.value === 'goNoGo' ? 'goNoGo' : 'classic' });
          }}
        >
          <option value="classic">{t('editor.classic')}</option>
          <option value="goNoGo">{t('editor.goNoGo')}</option>
        </select>
      </label>
    </div>
  );
}
