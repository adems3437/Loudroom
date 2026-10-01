'use client';

import { categorySchema, type ApiError, type Category, type CategoryInput } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAdminSession } from '@/admin/session';
import {
  ConfirmDelete,
  ErrorBanner,
  inputClass,
  LoadState,
  PageHeader,
  smallButton,
  tableClass,
  tdClass,
  thClass,
  useApiData,
} from '@/admin/ui';

const listSchema = categorySchema.array();

const EMPTY: CategoryInput = { slug: '', name: '', description: null };

export default function CategoriesPage() {
  const t = useTranslations('admin.categories');
  const tc = useTranslations('admin.common');
  const { api } = useAdminSession();
  const { state, reload } = useApiData('/api/admin/categories', listSchema);
  /** Id of the category being edited, 'new' while creating one. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryInput>(EMPTY);
  const [error, setError] = useState<ApiError | null>(null);

  const startEdit = (category: Category | null) => {
    setError(null);
    setEditing(category?.id ?? 'new');
    setDraft(
      category
        ? { slug: category.slug, name: category.name, description: category.description }
        : EMPTY,
    );
  };

  const save = async () => {
    const json = { ...draft, description: draft.description?.trim() || null };
    const result =
      editing === 'new'
        ? await api('/api/admin/categories', { method: 'POST', json })
        : await api(`/api/admin/categories/${editing ?? ''}`, { method: 'PUT', json });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    reload();
  };

  const remove = async (id: string) => {
    setError(null);
    const result = await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (!result.ok) setError(result.error);
    reload();
  };

  const form = (
    <form
      data-testid="category-form"
      className="bg-surface border-line mb-6 grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-3 rounded-2xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('name')}
        <input
          data-testid="category-name"
          required
          maxLength={60}
          className={inputClass}
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('slug')}
        <input
          data-testid="category-slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title={t('slugHint')}
          maxLength={48}
          className={inputClass}
          value={draft.slug}
          onChange={(event) => {
            setDraft({ ...draft, slug: event.target.value });
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('description')}
        <input
          maxLength={200}
          className={inputClass}
          value={draft.description ?? ''}
          onChange={(event) => {
            setDraft({ ...draft, description: event.target.value });
          }}
        />
      </label>
      <span className="flex gap-2">
        <button type="submit" data-testid="category-save" className={smallButton('primary')}>
          {tc('save')}
        </button>
        <button
          type="button"
          className={smallButton()}
          onClick={() => {
            setEditing(null);
          }}
        >
          {tc('cancel')}
        </button>
      </span>
    </form>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <button
            type="button"
            data-testid="category-new"
            className={smallButton('primary')}
            onClick={() => {
              startEdit(null);
            }}
          >
            {t('new')}
          </button>
        }
      />
      <div className="mb-4">
        <ErrorBanner error={error} />
      </div>
      {editing !== null && form}
      {state.status !== 'ready' ? (
        <LoadState state={state} />
      ) : state.data.length === 0 ? (
        <p className="text-muted">{tc('empty')}</p>
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>{t('name')}</th>
              <th className={thClass}>{t('slug')}</th>
              <th className={thClass}>{t('contentCount')}</th>
              <th className={thClass}>{tc('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((category) => (
              <tr key={category.id} data-testid="category-row" data-slug={category.slug}>
                <td className={tdClass}>
                  <span className="font-semibold">{category.name}</span>
                  {category.description && (
                    <span className="text-muted block text-sm">{category.description}</span>
                  )}
                </td>
                <td className={`${tdClass} text-muted font-mono text-sm`}>{category.slug}</td>
                <td className={`${tdClass} tabular-nums`}>{category.contentCount}</td>
                <td className={tdClass}>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={smallButton()}
                      onClick={() => {
                        startEdit(category);
                      }}
                    >
                      {tc('edit')}
                    </button>
                    <ConfirmDelete
                      testId="category-delete"
                      onConfirm={() => void remove(category.id)}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
