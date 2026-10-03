'use client';

import type { ApiError, MediaItem } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatDuration, mediaPageSchema, Thumbnail, UploadForm } from '@/admin/media';
import { useAdminSession } from '@/admin/session';
import {
  ConfirmDelete,
  ErrorBanner,
  formatDate,
  LoadState,
  PageHeader,
  Pagination,
  smallButton,
  useApiData,
} from '@/admin/ui';

const PAGE_SIZE = 24;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MediaCard({ item, onChanged }: { item: MediaItem; onChanged: () => void }) {
  const t = useTranslations('admin.media');
  const { api } = useAdminSession();
  const [altText, setAltText] = useState(item.altText ?? '');
  const [error, setError] = useState<ApiError | null>(null);

  const saveAlt = async () => {
    const result = await api(`/api/admin/media/${item.id}`, {
      method: 'PATCH',
      json: { altText: altText.trim() || null },
    });
    setError(result.ok ? null : result.error);
    if (result.ok) onChanged();
  };
  const remove = async () => {
    const result = await api(`/api/admin/media/${item.id}`, { method: 'DELETE' });
    setError(result.ok ? null : result.error);
    if (result.ok) onChanged();
  };

  return (
    <li
      data-testid="media-card"
      data-media-id={item.id}
      className="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-3"
    >
      <Thumbnail
        id={item.id}
        alt={item.altText ?? ''}
        mimeType={item.mimeType}
        controls
        className="h-40 w-full rounded-xl"
      />
      <div className="text-sm">
        <p className="truncate font-semibold">{item.originalName ?? item.id}</p>
        <p className="text-muted truncate text-xs" title={t('idHint')}>
          {t('idLabel')}:{' '}
          <span className="font-mono select-all" data-testid="media-id">
            {item.id}
          </span>
        </p>
        <p className="text-muted">
          {item.width !== null && item.height !== null
            ? `${t('dimensions', { width: item.width, height: item.height })} · `
            : ''}
          {item.durationMs !== null ? `${formatDuration(item.durationMs)} · ` : ''}
          {formatSize(item.sizeBytes)} · {formatDate(item.createdAt)}
        </p>
        <p className={item.usageCount > 0 ? 'text-accent' : 'text-muted'}>
          {item.usageCount > 0 ? t('usage', { count: item.usageCount }) : t('unused')}
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void saveAlt();
        }}
      >
        <input
          aria-label={t('altText')}
          placeholder={t('altText')}
          maxLength={200}
          className="border-line bg-canvas min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
          value={altText}
          onChange={(event) => {
            setAltText(event.target.value);
          }}
        />
        <button type="submit" className={smallButton('ghost', 'px-2 py-1 text-sm')}>
          {t('saveAlt')}
        </button>
      </form>
      <ConfirmDelete
        testId="media-delete"
        disabled={item.usageCount > 0}
        onConfirm={() => void remove()}
      />
      <ErrorBanner error={error} />
    </li>
  );
}

export default function MediaPage() {
  const t = useTranslations('admin.media');
  const tc = useTranslations('admin.common');
  const [page, setPage] = useState(1);
  const { state, reload } = useApiData(
    `/api/admin/media?page=${page}&pageSize=${PAGE_SIZE}`,
    mediaPageSchema,
  );

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mb-6">
        <UploadForm onUploaded={reload} />
      </div>
      {state.status !== 'ready' ? (
        <LoadState state={state} />
      ) : state.data.items.length === 0 ? (
        <p className="text-muted">{tc('empty')}</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {state.data.items.map((item) => (
              <MediaCard key={`${item.id}-${item.altText ?? ''}`} item={item} onChanged={reload} />
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={state.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
