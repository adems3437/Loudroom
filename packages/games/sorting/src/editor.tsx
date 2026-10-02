'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import { SORTING_MAX_ITEMS, SORTING_MIN_ITEMS, type SortingContent } from './schema.js';

export function emptySortingContent(): SortingContent {
  return {
    question: '',
    items: [
      { id: 'i1', text: '' },
      { id: 'i2', text: '' },
      { id: 'i3', text: '' },
    ],
  };
}

export function summarizeSorting(content: SortingContent): string {
  return content.question;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';
const smallButton =
  'rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-raised disabled:opacity-40';

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** Admin form for one sorting question: items in their correct order, optional end labels. */
export function SortingEditor({
  value,
  onChange,
  t,
  MediaField,
  issues,
}: ContentEditorProps<SortingContent>) {
  const hasIssue = (...path: (string | number)[]) =>
    issues.some(
      (issue) =>
        issue.path.length >= path.length && path.every((key, index) => issue.path[index] === key),
    );
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;

  const setItem = (index: number, patch: { text?: string; mediaId?: string | null }) => {
    onChange({
      ...value,
      items: value.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item };
        if (patch.text !== undefined) next.text = patch.text;
        if (patch.mediaId) next.mediaId = patch.mediaId;
        else if (patch.mediaId === null) delete next.mediaId;
        return next;
      }),
    });
  };

  const addItem = () => {
    let n = value.items.length + 1;
    while (value.items.some((item) => item.id === `i${n}`)) n++;
    onChange({ ...value, items: [...value.items, { id: `i${n}`, text: '' }] });
  };

  const setLabel = (key: 'first' | 'last', text: string) => {
    const labels = {
      first: value.labels?.first ?? '',
      last: value.labels?.last ?? '',
      [key]: text,
    };
    const next = { ...value };
    if (labels.first || labels.last) next.labels = labels;
    else delete next.labels;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="sorting-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.question')}</span>
        <textarea
          data-testid="sorting-editor-question"
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

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">{t('editor.items')}</legend>
        <p className="text-muted text-sm">{t('editor.itemsHint')}</p>
        {value.items.map((item, index) => (
          <div
            key={item.id}
            data-testid="sorting-editor-item-row"
            className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-3"
          >
            <span className="font-display w-8 text-center text-xl font-bold tabular-nums">
              {index + 1}
            </span>
            <input
              data-testid="sorting-editor-item"
              className={`${inputClass} min-w-48 flex-1`}
              maxLength={80}
              placeholder={t('editor.itemPlaceholder', { number: index + 1 })}
              value={item.text}
              aria-invalid={hasIssue('items', index)}
              onChange={(event) => {
                setItem(index, { text: event.target.value });
              }}
            />
            <MediaField
              label={t('editor.itemImage')}
              testId="sorting-editor-item-image"
              value={item.mediaId ?? null}
              onChange={(mediaId) => {
                setItem(index, { mediaId });
              }}
            />
            <button
              type="button"
              aria-label={t('editor.moveUp')}
              className={smallButton}
              disabled={index === 0}
              onClick={() => {
                onChange({ ...value, items: move(value.items, index, index - 1) });
              }}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t('editor.moveDown')}
              className={smallButton}
              disabled={index === value.items.length - 1}
              onClick={() => {
                onChange({ ...value, items: move(value.items, index, index + 1) });
              }}
            >
              ↓
            </button>
            <button
              type="button"
              data-testid="sorting-editor-remove-item"
              className={`${smallButton} text-muted hover:bg-danger hover:text-ink`}
              disabled={value.items.length <= SORTING_MIN_ITEMS}
              onClick={() => {
                onChange({ ...value, items: value.items.filter((_, i) => i !== index) });
              }}
            >
              {t('editor.removeItem')}
            </button>
          </div>
        ))}
        {hasIssue('items') && invalidText}
        <button
          type="button"
          data-testid="sorting-editor-add-item"
          className={`${smallButton} self-start px-4`}
          disabled={value.items.length >= SORTING_MAX_ITEMS}
          onClick={addItem}
        >
          {t('editor.addItem')}
        </button>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4">
        <legend className="mb-2 font-semibold">{t('editor.labels')}</legend>
        <label className="flex flex-col gap-2">
          <span className="text-sm">{t('editor.labelFirst')}</span>
          <input
            data-testid="sorting-editor-label-first"
            className={inputClass}
            maxLength={24}
            placeholder={t('editor.labelFirstPlaceholder')}
            value={value.labels?.first ?? ''}
            aria-invalid={hasIssue('labels')}
            onChange={(event) => {
              setLabel('first', event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm">{t('editor.labelLast')}</span>
          <input
            data-testid="sorting-editor-label-last"
            className={inputClass}
            maxLength={24}
            placeholder={t('editor.labelLastPlaceholder')}
            value={value.labels?.last ?? ''}
            aria-invalid={hasIssue('labels')}
            onChange={(event) => {
              setLabel('last', event.target.value);
            }}
          />
        </label>
        {hasIssue('labels') && <div className="col-span-2">{invalidText}</div>}
      </fieldset>
    </div>
  );
}
