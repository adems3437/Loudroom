'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import { MEMORY_MAX_ITEMS, MEMORY_MIN_ITEMS, type MemoryContent } from './schema.js';

export function emptyMemoryContent(): MemoryContent {
  return {
    title: '',
    items: Array.from({ length: MEMORY_MIN_ITEMS }, (_, index) => ({
      id: `m${index + 1}`,
      label: '',
      emoji: '',
    })),
  };
}

export function summarizeMemory(content: MemoryContent): string {
  return `${content.title} (${content.items.length})`;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';
const smallButton =
  'rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-raised disabled:opacity-40';

/** Admin form for a Memory set: objects with a label and an emoji or an image. */
export function MemoryEditor({
  value,
  onChange,
  t,
  MediaField,
  issues,
}: ContentEditorProps<MemoryContent>) {
  const hasIssue = (...path: (string | number)[]) =>
    issues.some(
      (issue) =>
        issue.path.length >= path.length && path.every((key, index) => issue.path[index] === key),
    );
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;

  const setItem = (
    index: number,
    patch: { label?: string; emoji?: string; mediaId?: string | null },
  ) => {
    onChange({
      ...value,
      items: value.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item };
        if (patch.label !== undefined) next.label = patch.label;
        if (patch.emoji !== undefined) {
          if (patch.emoji) next.emoji = patch.emoji;
          else delete next.emoji;
        }
        if (patch.mediaId) next.mediaId = patch.mediaId;
        else if (patch.mediaId === null) delete next.mediaId;
        return next;
      }),
    });
  };

  const addItem = () => {
    let n = value.items.length + 1;
    while (value.items.some((item) => item.id === `m${n}`)) n++;
    onChange({ ...value, items: [...value.items, { id: `m${n}`, label: '' }] });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="memory-editor">
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="memory-editor-title"
          className={inputClass}
          maxLength={60}
          placeholder={t('editor.titlePlaceholder')}
          value={value.title}
          aria-invalid={hasIssue('title')}
          onChange={(event) => {
            onChange({ ...value, title: event.target.value });
          }}
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t('editor.items')}</legend>
        <p className="text-muted text-sm">{t('editor.itemsHint')}</p>
        {value.items.map((item, index) => (
          <div
            key={item.id}
            data-testid="memory-editor-item-row"
            className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-3"
          >
            <input
              data-testid="memory-editor-emoji"
              aria-label={t('editor.emoji')}
              className={`${inputClass} w-20 text-center text-2xl`}
              maxLength={16}
              value={item.emoji ?? ''}
              aria-invalid={hasIssue('items', index, 'emoji')}
              onChange={(event) => {
                setItem(index, { emoji: event.target.value });
              }}
            />
            <input
              data-testid="memory-editor-label"
              className={`${inputClass} min-w-40 flex-1`}
              maxLength={30}
              placeholder={t('editor.labelPlaceholder', { number: index + 1 })}
              value={item.label}
              aria-invalid={hasIssue('items', index, 'label')}
              onChange={(event) => {
                setItem(index, { label: event.target.value });
              }}
            />
            <MediaField
              label={t('editor.image')}
              testId="memory-editor-image"
              value={item.mediaId ?? null}
              onChange={(mediaId) => {
                setItem(index, { mediaId });
              }}
            />
            <button
              type="button"
              className={`${smallButton} text-muted`}
              disabled={value.items.length <= MEMORY_MIN_ITEMS}
              onClick={() => {
                onChange({ ...value, items: value.items.filter((_, i) => i !== index) });
              }}
            >
              {t('editor.remove')}
            </button>
          </div>
        ))}
        {hasIssue('items') && invalidText}
        <button
          type="button"
          data-testid="memory-editor-add"
          className={`${smallButton} self-start px-4`}
          disabled={value.items.length >= MEMORY_MAX_ITEMS}
          onClick={addItem}
        >
          {t('editor.add')}
        </button>
      </fieldset>
    </div>
  );
}
