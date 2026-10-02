'use client';

import {
  ContainedImage,
  mediaUrl,
  type ContentEditorProps,
  type Size,
} from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { At, TargetDot, TargetRing } from './marks.js';
import { IMAGE_LOCATION_DEFAULT_SETTINGS, type ImageLocationContent } from './schema.js';

export function emptyImageLocationContent(): ImageLocationContent {
  // An empty media id fails validation until an image is chosen.
  return { question: '', mediaId: '', target: { x: 0.5, y: 0.5 } };
}

export function summarizeImageLocation(content: ImageLocationContent): string {
  return content.question;
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger';

/**
 * Admin form for one Image Location question: the image, and the target set by clicking on
 * it; the ring shows the full-score area (the content's own radius, or the default).
 */
export function ImageLocationEditor({
  value,
  onChange,
  t,
  MediaField,
  issues,
}: ContentEditorProps<ImageLocationContent>) {
  const hasIssue = (field: string) => issues.some((issue) => issue.path[0] === field);
  const invalidText = <p className="text-danger text-sm">{t('editor.invalid')}</p>;
  const radius = value.radius ?? IMAGE_LOCATION_DEFAULT_SETTINGS.fullScoreRadius;
  const [size, setSize] = useState<Size | null>(null);

  return (
    <div className="flex flex-col gap-6" data-testid="location-editor">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">{t('editor.question')}</span>
        <input
          data-testid="location-editor-question"
          className={inputClass}
          maxLength={300}
          placeholder={t('editor.questionPlaceholder')}
          value={value.question}
          aria-invalid={hasIssue('question')}
          onChange={(event) => {
            onChange({ ...value, question: event.target.value });
          }}
        />
        {hasIssue('question') && invalidText}
      </label>

      <MediaField
        label={t('editor.image')}
        testId="location-editor-image"
        value={value.mediaId || null}
        onChange={(mediaId) => {
          onChange({ ...value, mediaId: mediaId ?? '' });
        }}
      />
      {hasIssue('mediaId') && invalidText}

      {value.mediaId && (
        <div className="flex flex-col gap-2">
          <p className="text-muted text-sm">{t('editor.targetHint')}</p>
          <ContainedImage
            key={value.mediaId}
            src={mediaUrl(value.mediaId)}
            alt={t('editor.image')}
            testId="location-editor-canvas"
            className="bg-canvas border-line h-[480px] w-full rounded-2xl border"
            onNaturalSize={setSize}
            onPick={(target) => {
              onChange({
                ...value,
                target: { x: Number(target.x.toFixed(4)), y: Number(target.y.toFixed(4)) },
              });
            }}
          >
            {size && (
              <TargetRing
                target={value.target}
                radius={radius}
                image={size}
                dashed={value.radius === undefined}
              />
            )}
            <At point={value.target}>
              <TargetDot size={22} />
            </At>
          </ContainedImage>
          <p className="text-muted text-sm" data-testid="location-editor-target">
            {t('editor.target', {
              x: (value.target.x * 100).toFixed(1),
              y: (value.target.y * 100).toFixed(1),
            })}
          </p>
        </div>
      )}

      <label className="flex max-w-xs flex-col gap-2">
        <span className="font-semibold">{t('editor.radius')}</span>
        <input
          type="number"
          data-testid="location-editor-radius"
          className={inputClass}
          min={0.5}
          max={50}
          step={0.5}
          placeholder={String(IMAGE_LOCATION_DEFAULT_SETTINGS.fullScoreRadius * 100)}
          defaultValue={value.radius === undefined ? '' : String(value.radius * 100)}
          aria-invalid={hasIssue('radius')}
          onChange={(event) => {
            const percent = Number(event.target.value.replace(',', '.'));
            const next = { ...value };
            if (event.target.value.trim() && Number.isFinite(percent)) next.radius = percent / 100;
            else delete next.radius;
            onChange(next);
          }}
        />
        <span className="text-muted text-sm">{t('editor.radiusHint')}</span>
        {hasIssue('radius') && invalidText}
      </label>
    </div>
  );
}
