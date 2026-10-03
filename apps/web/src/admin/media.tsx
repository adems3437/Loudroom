'use client';

import {
  mediaFormatOf,
  mediaUrl,
  type MediaFieldProps,
  type MediaKind,
} from '@loudroom/game-sdk/client';
import {
  mediaItemSchema,
  pageSchema,
  UPLOAD_IMAGE_MIME_TYPES,
  UPLOAD_VIDEO_MIME_TYPES,
  type ApiError,
  type MediaItem,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiResult } from '@/lib/api';
import { useAdminSession } from './session';
import { ErrorBanner, Pagination, smallButton, useApiData } from './ui';

export const mediaPageSchema = pageSchema(mediaItemSchema);

type Accept = MediaKind | 'any';

export function kindOf(item: Pick<MediaItem, 'type'>): MediaKind {
  return item.type === 'VIDEO' ? 'video' : 'image';
}

function acceptAttribute(accept: Accept): string {
  const types = {
    image: UPLOAD_IMAGE_MIME_TYPES,
    video: UPLOAD_VIDEO_MIME_TYPES,
    any: [...UPLOAD_IMAGE_MIME_TYPES, ...UPLOAD_VIDEO_MIME_TYPES],
  };
  return types[accept].join(',');
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function useUpload() {
  const { api } = useAdminSession();
  return (file: File, altText: string): Promise<ApiResult<MediaItem>> => {
    const form = new FormData();
    form.append('file', file);
    if (altText.trim()) form.append('altText', altText.trim());
    return api('/api/admin/media', { method: 'POST', form, schema: mediaItemSchema });
  };
}

/** File input + upload button; reports the stored item. */
export function UploadForm({
  onUploaded,
  accept = 'any',
}: {
  onUploaded: (item: MediaItem) => void;
  accept?: Accept;
}) {
  const t = useTranslations('admin.media');
  const upload = useUpload();
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await upload(file, altText);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFile(null);
    setAltText('');
    setInputKey((key) => key + 1);
    onUploaded(result.data);
  };

  return (
    <form
      data-testid="media-upload"
      className="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        // Inside the picker this form sits (via a portal) within a content form: React would
        // otherwise deliver the submit to that form too.
        event.stopPropagation();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('file')}
          <input
            key={inputKey}
            data-testid="media-file"
            type="file"
            accept={acceptAttribute(accept)}
            required
            className="file:bg-surface-raised file:text-ink file:border-line text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-2"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          {t('altText')}
          <input
            data-testid="media-alt"
            maxLength={200}
            className="border-line bg-canvas focus:border-brand rounded-xl border px-3 py-2 focus:outline-none"
            value={altText}
            onChange={(event) => {
              setAltText(event.target.value);
            }}
          />
        </label>
        <button
          type="submit"
          data-testid="media-upload-submit"
          disabled={!file || busy}
          className={smallButton('primary')}
        >
          {busy ? t('uploading') : t('upload')}
        </button>
      </div>
      <p className="text-muted text-sm">
        {accept === 'image' ? t('uploadHint') : `${t('uploadHint')} ${t('videoHint')}`}
      </p>
      <ErrorBanner error={error} />
    </form>
  );
}

/**
 * A media file's preview: the image, or the video (first frame; `controls` to play it).
 * `mimeType` says which; without it the file is assumed to be an image.
 */
export function Thumbnail({
  id,
  alt,
  mimeType = 'image/webp',
  controls = false,
  className = '',
}: {
  id: string;
  alt: string;
  mimeType?: string;
  controls?: boolean;
  className?: string;
}) {
  const format = mediaFormatOf(mimeType);
  if (format !== 'webp') {
    return (
      <video
        src={mediaUrl(id, format)}
        aria-label={alt}
        preload="metadata"
        muted={!controls}
        controls={controls}
        playsInline
        className={`bg-canvas object-contain ${className}`}
      />
    );
  }
  return (
    // Uploaded images are already resized WebP files; next/image would only add a second copy.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaUrl(id)} alt={alt} className={`bg-canvas object-contain ${className}`} />
  );
}

const PICKER_PAGE_SIZE = 24;

function MediaPicker({
  accept,
  onPick,
  onClose,
}: {
  accept: Accept;
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations('admin.media');
  const tc = useTranslations('admin.common');
  const [page, setPage] = useState(1);
  const type = accept === 'any' ? '' : `&type=${accept === 'video' ? 'VIDEO' : 'IMAGE'}`;
  const { state, reload } = useApiData(
    `/api/admin/media?page=${page}&pageSize=${PICKER_PAGE_SIZE}${type}`,
    mediaPageSchema,
  );

  // Portal: the picker opens from inside other forms, and forms cannot be nested.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pickerTitle')}
      data-testid="media-picker"
      className="bg-canvas/80 fixed inset-0 z-50 flex items-center justify-center p-6"
    >
      <div className="bg-surface border-line flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-auto rounded-3xl border p-6">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{t('pickerTitle')}</h2>
          <button type="button" className={smallButton()} onClick={onClose}>
            {tc('close')}
          </button>
        </header>
        <UploadForm
          accept={accept}
          onUploaded={(item) => {
            reload();
            // An upload of a kind this field does not take stays in the library only.
            if (accept === 'any' || kindOf(item) === accept) onPick(item);
          }}
        />
        {state.status === 'ready' && (
          <>
            <ul className="grid grid-cols-4 gap-3">
              {state.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="media-pick"
                    data-media-id={item.id}
                    data-kind={kindOf(item)}
                    className="border-line hover:border-brand block w-full overflow-hidden rounded-xl border"
                    onClick={() => {
                      onPick(item);
                    }}
                  >
                    <Thumbnail
                      id={item.id}
                      alt={item.altText ?? ''}
                      mimeType={item.mimeType}
                      className="h-28 w-full"
                    />
                    <span className="text-muted block truncate px-2 py-1 text-xs">
                      {item.originalName ?? item.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              pageSize={PICKER_PAGE_SIZE}
              total={state.data.total}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Media slot in content editors: a preview plus choose/remove (MediaFieldProps contract). The
 * current file is looked up to know whether it is an image or a video.
 */
export function MediaField({ value, onChange, label, testId, accept = 'image' }: MediaFieldProps) {
  const t = useTranslations('admin.media');
  const [open, setOpen] = useState(false);
  const current = useApiData(value ? `/api/admin/media/${value}` : null, mediaItemSchema).state;
  const item = current.status === 'ready' && current.data.id === value ? current.data : null;
  return (
    <div
      className="flex items-center gap-3"
      data-testid={testId}
      data-media-id={value ?? ''}
      data-kind={item ? kindOf(item) : ''}
    >
      {value ? (
        <Thumbnail
          id={value}
          alt={label}
          mimeType={item?.mimeType ?? 'image/webp'}
          className="border-line h-14 w-20 rounded-lg border"
        />
      ) : (
        <span className="border-line text-muted grid h-14 w-20 place-items-center rounded-lg border border-dashed text-xs">
          {t('noImage')}
        </span>
      )}
      <span className="flex flex-col gap-1">
        <span className="text-sm">{label}</span>
        <span className="flex gap-2">
          <button
            type="button"
            data-testid={testId ? `${testId}-choose` : undefined}
            className={smallButton('ghost', 'px-3 py-1 text-sm')}
            onClick={() => {
              setOpen(true);
            }}
          >
            {value ? t('change') : t('choose')}
          </button>
          {value && (
            <button
              type="button"
              className={smallButton('ghost', 'px-3 py-1 text-sm')}
              onClick={() => {
                onChange(null, null);
              }}
            >
              {t('remove')}
            </button>
          )}
        </span>
      </span>
      {open && (
        <MediaPicker
          accept={accept}
          onClose={() => {
            setOpen(false);
          }}
          onPick={(picked) => {
            setOpen(false);
            onChange(picked.id, kindOf(picked));
          }}
        />
      )}
    </div>
  );
}
