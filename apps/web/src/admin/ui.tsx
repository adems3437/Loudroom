'use client';

import type { ApiError, ContentStatus } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ApiResult } from '@/lib/api';
import { useAdminSession } from './session';

export const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-ink placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-danger disabled:opacity-60';

export const smallButton = (variant: 'primary' | 'ghost' | 'danger' = 'ghost', extra = '') => {
  const variants = {
    primary: 'bg-brand text-ink hover:bg-brand-strong',
    ghost: 'border border-line bg-surface text-ink hover:bg-surface-raised',
    danger: 'bg-danger text-ink hover:opacity-90',
  };
  return `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${variants[variant]} ${extra}`;
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted text-sm">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  const t = useTranslations('admin.status');
  return (
    <span
      data-status={status}
      className={`inline-block rounded-full px-3 py-0.5 text-sm font-semibold ${
        status === 'PUBLISHED' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
      }`}
    >
      {t(status)}
    </span>
  );
}

export function ErrorBanner({ error }: { error: ApiError | null }) {
  const t = useTranslations('admin.errors');
  if (!error) return null;
  return (
    <p
      role="alert"
      data-testid="admin-error"
      data-code={error.code}
      className="bg-danger/15 text-danger rounded-xl px-4 py-3"
    >
      {t(error.code)}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="bg-success/15 text-success rounded-xl px-4 py-3">
      {children}
    </p>
  );
}

/** A delete button that asks once more before calling `onConfirm`. */
export function ConfirmDelete({
  onConfirm,
  testId = 'delete',
  disabled = false,
}: {
  onConfirm: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('admin.common');
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        data-testid={testId}
        className={smallButton('ghost', 'text-danger')}
        disabled={disabled}
        onClick={() => {
          setAsking(true);
        }}
      >
        {t('delete')}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm">{t('deleteConfirm')}</span>
      <button
        type="button"
        data-testid={`${testId}-confirm`}
        className={smallButton('danger')}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {t('confirmDelete')}
      </button>
      <button
        type="button"
        className={smallButton()}
        onClick={() => {
          setAsking(false);
        }}
      >
        {t('cancel')}
      </button>
    </span>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('admin.common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="mt-4 flex items-center justify-between gap-4">
      <span className="text-muted text-sm">{t('total', { count: total })}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          className={smallButton()}
          disabled={page <= 1}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          {t('previous')}
        </button>
        <span className="text-sm tabular-nums">{t('pageOf', { page, pages })}</span>
        <button
          type="button"
          className={smallButton()}
          disabled={page >= pages}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          {t('next')}
        </button>
      </span>
    </nav>
  );
}

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
}

/** Loads `path` once and on every `reload()`; `path` changes load again. */
export function useApiData<T>(path: string | null, schema: Schema<T>) {
  const { api } = useAdminSession();
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    void api(path, { schema }).then((result: ApiResult<T>) => {
      if (!active) return;
      setState(result.ok ? { status: 'ready', data: result.data } : { status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [api, path, schema, version]);

  const reload = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);
  return { state, reload };
}

export function LoadState({ state }: { state: { status: 'loading' } | { status: 'error' } }) {
  const t = useTranslations('admin.common');
  return (
    <p className={state.status === 'error' ? 'text-danger' : 'text-muted'}>
      {state.status === 'error' ? t('loadFailed') : t('loading')}
    </p>
  );
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export const tableClass = 'w-full border-collapse text-left';
export const thClass = 'border-b border-line px-3 py-2 text-sm font-semibold text-muted';
export const tdClass = 'border-b border-line/60 px-3 py-3 align-middle';
