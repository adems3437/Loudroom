'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import type { WhoWouldContent } from './schema.js';

export function emptyWhoWouldContent(): WhoWouldContent {
  return { question: '' };
}

export function summarizeWhoWould(content: WhoWouldContent): string {
  return content.title ? `${content.question} (${content.title})` : content.question;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/** Admin form for one "Kim Yapar?" statement and the title its winner gets. */
export function WhoWouldEditor({
  value,
  onChange,
  t,
  issues,
}: ContentEditorProps<WhoWouldContent>) {
  const hasIssue = (field: string) => issues.some((issue) => issue.path[0] === field);
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;

  return (
    <div className="flex flex-col gap-6" data-testid="who-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.question')}</span>
        <input
          data-testid="who-editor-question"
          className={inputClass}
          maxLength={200}
          placeholder={t('editor.questionPlaceholder')}
          value={value.question}
          aria-invalid={hasIssue('question')}
          onChange={(event) => {
            onChange({ ...value, question: event.target.value });
          }}
        />
        {hasIssue('question') && invalidText}
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="who-editor-title"
          className={inputClass}
          maxLength={40}
          placeholder={t('editor.titlePlaceholder')}
          value={value.title ?? ''}
          aria-invalid={hasIssue('title')}
          onChange={(event) => {
            const next = { ...value };
            if (event.target.value) next.title = event.target.value;
            else delete next.title;
            onChange(next);
          }}
        />
        <span className="text-muted text-sm">{t('editor.titleHint')}</span>
      </label>
    </div>
  );
}
