'use client';

import type { ContentIssue } from '@loudroom/game-sdk/client';
import {
  categorySchema,
  contentItemSchema,
  TIME_LIMIT_MAX_MS,
  TIME_LIMIT_MIN_MS,
  type ApiError,
  type ContentItem,
  type ContentItemInput,
  type ContentStatus,
  type Difficulty,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { findRenderer } from '@/games/registry';
import { useGameTranslator } from '@/games/translator';
import { MediaField } from './media';
import { useAdminSession } from './session';
import {
  ConfirmDelete,
  ErrorBanner,
  Field,
  inputClass,
  Notice,
  smallButton,
  StatusBadge,
  useApiData,
} from './ui';

const categoriesSchema = categorySchema.array();

/** The game's own one-line description of an item. */
export function summarize(item: Pick<ContentItem, 'gameType' | 'data'>): string | null {
  const editor = findRenderer(item.gameType)?.editor;
  const parsed = editor?.contentSchema.safeParse(item.data);
  return editor && parsed?.success ? editor.summarize(parsed.data) : null;
}

interface Meta {
  categoryId: string;
  difficulty: Difficulty;
  tags: string;
  status: ContentStatus;
  timeLimitSec: string;
  baseScore: string;
}

function metaOf(item: ContentItem | null): Meta {
  return {
    categoryId: item?.categoryId ?? '',
    difficulty: item?.difficulty ?? 'MEDIUM',
    tags: item?.tags.join(', ') ?? '',
    status: item?.status ?? 'DRAFT',
    timeLimitSec: item?.defaultTimeLimitMs ? String(item.defaultTimeLimitMs / 1000) : '',
    baseScore: String(item?.baseScore ?? 1000),
  };
}

/** Create or edit one content item: the game's own editor plus the common fields (SPEC §6). */
export function ContentForm({ gameType, item }: { gameType: string; item: ContentItem | null }) {
  const t = useTranslations('admin');
  const tGame = useGameTranslator(gameType);
  const router = useRouter();
  const { api } = useAdminSession();
  const editor = findRenderer(gameType)?.editor;
  const categories = useApiData('/api/admin/categories', categoriesSchema).state;

  const [data, setData] = useState<unknown>(() => {
    if (!editor) return null;
    return item ? item.data : editor.emptyContent();
  });
  const [meta, setMeta] = useState<Meta>(() => metaOf(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  if (!editor) return <p className="text-danger">{t('errors.VALIDATION_ERROR')}</p>;
  const { Editor } = editor;

  const issues: ContentIssue[] = (error?.issues ?? [])
    .filter((issue) => issue.path[0] === 'data')
    .map((issue) => ({ path: issue.path.slice(1), message: issue.message }));
  const fieldIssue = (field: string) => error?.issues?.some((issue) => issue.path[0] === field);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const seconds = Number(meta.timeLimitSec.replace(',', '.'));
    const input: ContentItemInput = {
      gameType,
      data,
      categoryId: meta.categoryId || null,
      difficulty: meta.difficulty,
      tags: meta.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      locale: item?.locale ?? 'tr',
      status: meta.status,
      defaultTimeLimitMs: meta.timeLimitSec.trim() ? Math.round(seconds * 1000) : null,
      baseScore: Number(meta.baseScore),
    };
    const result = item
      ? await api(`/api/admin/content/${item.id}`, {
          method: 'PUT',
          json: input,
          schema: contentItemSchema,
        })
      : await api('/api/admin/content', { method: 'POST', json: input, schema: contentItemSchema });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    if (!item) router.replace(`/admin/content/${result.data.id}`);
  };

  const remove = async () => {
    if (!item) return;
    const result = await api(`/api/admin/content/${item.id}`, { method: 'DELETE' });
    if (result.ok) router.replace('/admin/content');
    else setError(result.error);
  };

  return (
    <form
      data-testid="content-form"
      className="grid grid-cols-[1fr_320px] items-start gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <section className="bg-surface border-line rounded-2xl border p-6">
        <Editor
          value={data}
          onChange={(value: unknown) => {
            setData(value);
            setSaved(false);
          }}
          t={tGame}
          MediaField={MediaField}
          issues={issues}
        />
      </section>

      <aside className="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-6">
        <Field label={t('content.status')}>
          <select
            data-testid="content-status"
            className={inputClass}
            value={meta.status}
            onChange={(event) => {
              setMeta({ ...meta, status: event.target.value as ContentStatus });
            }}
          >
            <option value="DRAFT">{t('status.DRAFT')}</option>
            <option value="PUBLISHED">{t('status.PUBLISHED')}</option>
          </select>
        </Field>
        <Field label={t('content.category')}>
          <select
            data-testid="content-category"
            className={inputClass}
            aria-invalid={fieldIssue('categoryId')}
            value={meta.categoryId}
            onChange={(event) => {
              setMeta({ ...meta, categoryId: event.target.value });
            }}
          >
            <option value="">{t('content.noCategory')}</option>
            {categories.status === 'ready' &&
              categories.data.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('content.difficulty')}>
          <select
            data-testid="content-difficulty"
            className={inputClass}
            value={meta.difficulty}
            onChange={(event) => {
              setMeta({ ...meta, difficulty: event.target.value as Difficulty });
            }}
          >
            {(['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {t(`difficulty.${difficulty}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('content.tags')} hint={t('content.tagsHint')}>
          <input
            data-testid="content-tags"
            className={inputClass}
            aria-invalid={fieldIssue('tags')}
            value={meta.tags}
            onChange={(event) => {
              setMeta({ ...meta, tags: event.target.value });
            }}
          />
        </Field>
        <Field label={t('content.timeLimit')} hint={t('content.timeLimitHint')}>
          <input
            type="number"
            min={TIME_LIMIT_MIN_MS / 1000}
            max={TIME_LIMIT_MAX_MS / 1000}
            className={inputClass}
            aria-invalid={fieldIssue('defaultTimeLimitMs')}
            value={meta.timeLimitSec}
            onChange={(event) => {
              setMeta({ ...meta, timeLimitSec: event.target.value });
            }}
          />
        </Field>
        <Field label={t('content.baseScore')}>
          <input
            type="number"
            min={0}
            max={10_000}
            step={50}
            className={inputClass}
            aria-invalid={fieldIssue('baseScore')}
            value={meta.baseScore}
            onChange={(event) => {
              setMeta({ ...meta, baseScore: event.target.value });
            }}
          />
        </Field>
        {item && (
          <p className="text-muted text-sm">
            <StatusBadge status={item.status} />{' '}
            {item.createdBy && t('content.createdBy', { name: item.createdBy })}
          </p>
        )}
        <ErrorBanner error={error} />
        {saved && <Notice>{t('common.saved')}</Notice>}
        <button
          type="submit"
          data-testid="content-save"
          disabled={busy}
          className={smallButton('primary', 'py-3')}
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        {item && <ConfirmDelete testId="content-delete" onConfirm={() => void remove()} />}
      </aside>
    </form>
  );
}
