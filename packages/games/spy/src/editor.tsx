'use client';

import type { ContentEditorProps } from '@loudroom/game-sdk/client';
import { SPY_MAX_LOCATIONS, SPY_MIN_LOCATIONS, type SpyContent } from './schema.js';

export function emptySpyContent(): SpyContent {
  return {
    title: '',
    locations: Array.from({ length: SPY_MIN_LOCATIONS }, (_, index) => ({
      id: `l${index + 1}`,
      name: '',
    })),
  };
}

export function summarizeSpy(content: SpyContent): string {
  return `${content.title} (${content.locations.length})`;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';
const smallButton =
  'rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-raised disabled:opacity-40';

/** Admin form for a "Casus Kim?" set: its places, each a name with an optional emoji. */
export function SpyEditor({ value, onChange, t, issues }: ContentEditorProps<SpyContent>) {
  const hasIssue = (...path: (string | number)[]) =>
    issues.some(
      (issue) =>
        issue.path.length >= path.length && path.every((key, index) => issue.path[index] === key),
    );

  const setLocation = (index: number, patch: { name?: string; emoji?: string }) => {
    onChange({
      ...value,
      locations: value.locations.map((location, i) => {
        if (i !== index) return location;
        const next = { ...location };
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.emoji !== undefined) {
          if (patch.emoji) next.emoji = patch.emoji;
          else delete next.emoji;
        }
        return next;
      }),
    });
  };

  const addLocation = () => {
    let n = value.locations.length + 1;
    while (value.locations.some((location) => location.id === `l${n}`)) n++;
    onChange({ ...value, locations: [...value.locations, { id: `l${n}`, name: '' }] });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="spy-editor">
      <label className="flex max-w-md flex-col gap-2">
        <span className="font-semibold">{t('editor.title')}</span>
        <input
          data-testid="spy-editor-title"
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
        <legend className="mb-1 font-semibold">{t('editor.locations')}</legend>
        <p className="text-muted text-sm">
          {t('editor.locationsHint', { min: SPY_MIN_LOCATIONS, max: SPY_MAX_LOCATIONS })}
        </p>
        {value.locations.map((location, index) => (
          <div
            key={location.id}
            data-testid="spy-editor-location-row"
            className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-3"
          >
            <input
              data-testid="spy-editor-emoji"
              aria-label={t('editor.emoji')}
              className={`${inputClass} w-20 text-center text-2xl`}
              maxLength={16}
              value={location.emoji ?? ''}
              aria-invalid={hasIssue('locations', index, 'emoji')}
              onChange={(event) => {
                setLocation(index, { emoji: event.target.value });
              }}
            />
            <input
              data-testid="spy-editor-name"
              className={`${inputClass} min-w-40 flex-1`}
              maxLength={40}
              placeholder={t('editor.namePlaceholder', { number: index + 1 })}
              value={location.name}
              aria-invalid={hasIssue('locations', index, 'name')}
              onChange={(event) => {
                setLocation(index, { name: event.target.value });
              }}
            />
            <button
              type="button"
              className={`${smallButton} text-muted`}
              disabled={value.locations.length <= SPY_MIN_LOCATIONS}
              onClick={() => {
                onChange({ ...value, locations: value.locations.filter((_, i) => i !== index) });
              }}
            >
              {t('editor.remove')}
            </button>
          </div>
        ))}
        {hasIssue('locations') && <p className="text-danger text-sm">{t('editor.invalid')}</p>}
        <button
          type="button"
          data-testid="spy-editor-add"
          className={`${smallButton} self-start px-4`}
          disabled={value.locations.length >= SPY_MAX_LOCATIONS}
          onClick={addLocation}
        >
          {t('editor.add')}
        </button>
      </fieldset>
    </div>
  );
}
