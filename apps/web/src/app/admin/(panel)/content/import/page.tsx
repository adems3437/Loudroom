'use client';

import {
  importCommitResultSchema,
  importPreviewSchema,
  type ApiError,
  type ImportPreview,
  type ImportRow,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAdminSession } from '@/admin/session';
import {
  ErrorBanner,
  Field,
  inputClass,
  Notice,
  PageHeader,
  smallButton,
  tableClass,
  tdClass,
  thClass,
} from '@/admin/ui';
import { GAME_TYPES } from '@/games/registry';

const PROBLEMS = ['NOT_UTF8', 'UNREADABLE', 'EMPTY', 'TOO_LARGE', 'TOO_MANY_ROWS'] as const;
type Problem = (typeof PROBLEMS)[number];

/** The file problem of an IMPORT_INVALID answer (unreadable, too large, …). */
function fileProblem(error: ApiError): Problem | null {
  const code = error.issues?.[0]?.code;
  return PROBLEMS.find((problem) => problem === code) ?? null;
}

function RowIssues({ row }: { row: ImportRow }) {
  const t = useTranslations('admin.import');
  if (row.ok) return <span className="text-success font-semibold">{t('ok')}</span>;
  return (
    <ul className="text-danger text-sm" data-testid="import-issues">
      {row.issues.map((issue) => (
        <li key={`${issue.column ?? ''}-${issue.code}`} data-code={issue.code}>
          <span className="font-semibold">
            {issue.column ? t('column', { column: issue.column }) : t('rowLevel')}
          </span>
          : {t(`issues.${issue.code}`)}
        </li>
      ))}
    </ul>
  );
}

function ImportContent() {
  const t = useTranslations('admin');
  const { api } = useAdminSession();
  const requested = useSearchParams().get('gameType') ?? '';
  const [gameType, setGameType] = useState(
    GAME_TYPES.includes(requested) ? requested : (GAME_TYPES[0] ?? ''),
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<'checking' | 'committing' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const reset = () => {
    setPreview(null);
    setError(null);
    setCreated(null);
    setInputKey((key) => key + 1);
  };

  const check = async (file: File) => {
    setBusy('checking');
    setPreview(null);
    setCreated(null);
    const form = new FormData();
    form.append('file', file);
    const result = await api(`/api/admin/import/${gameType}/preview`, {
      method: 'POST',
      form,
      schema: importPreviewSchema,
    });
    setBusy(null);
    setError(result.ok ? null : result.error);
    if (result.ok) setPreview(result.data);
  };

  const valid = preview?.rows.flatMap((row) => (row.input ? [row.input] : [])) ?? [];
  const commit = async () => {
    setBusy('committing');
    const result = await api(`/api/admin/import/${gameType}`, {
      method: 'POST',
      json: { items: valid },
      schema: importCommitResultSchema,
    });
    setBusy(null);
    setError(result.ok ? null : result.error);
    if (result.ok) {
      setPreview(null);
      setCreated(result.data.created);
      setInputKey((key) => key + 1);
    }
  };

  const problem = error?.code === 'IMPORT_INVALID' ? fileProblem(error) : null;
  const templateUrl = (format: 'csv' | 'xlsx') =>
    `/api/admin/import/${gameType}/template?format=${format}`;

  return (
    <>
      <PageHeader
        title={t('import.title')}
        actions={
          <Link href="/admin/content" className={smallButton()}>
            {t('common.back')}
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <p className="text-muted max-w-3xl">{t('import.intro')}</p>
        <section className="bg-surface border-line grid gap-5 rounded-2xl border p-5 lg:grid-cols-2">
          <Field label={t('import.gameType')}>
            <select
              data-testid="import-game"
              className={inputClass}
              value={gameType}
              onChange={(event) => {
                setGameType(event.target.value);
                reset();
              }}
            >
              {GAME_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`gameTypes.${type}` as 'gameTypes.quiz')}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <a
              href={templateUrl('xlsx')}
              download
              data-testid="import-template-xlsx"
              className={smallButton()}
            >
              {t('import.templateXlsx')}
            </a>
            <a
              href={templateUrl('csv')}
              download
              data-testid="import-template-csv"
              className={smallButton()}
            >
              {t('import.templateCsv')}
            </a>
          </div>
          <Field label={t('import.file')} hint={t('import.fileHint')}>
            <input
              key={inputKey}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              data-testid="import-file"
              className={inputClass}
              disabled={busy !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void check(file);
              }}
            />
          </Field>
          <p className="text-muted self-end text-sm">{t('import.commonHint')}</p>
        </section>

        {busy === 'checking' && <p className="text-muted">{t('import.checking')}</p>}
        {problem ? (
          <p
            role="alert"
            data-testid="admin-error"
            data-code={problem}
            className="bg-danger/15 text-danger rounded-xl px-4 py-3"
          >
            {t(`import.problems.${problem}`)}
          </p>
        ) : (
          <ErrorBanner error={error} />
        )}
        {created !== null && (
          <div className="flex flex-wrap items-center gap-4" data-testid="import-done">
            <Notice>{t('import.done', { count: created })}</Notice>
            <Link href="/admin/content" className={smallButton()}>
              {t('import.showContent')}
            </Link>
          </div>
        )}

        {preview && (
          <section className="flex flex-col gap-4" data-testid="import-preview">
            <p className="font-semibold" data-testid="import-summary">
              {t('import.summary', {
                valid: valid.length,
                invalid: preview.rows.length - valid.length,
              })}
            </p>
            {preview.missingColumns.length > 0 && (
              <p className="bg-danger/15 text-danger rounded-xl px-4 py-3">
                {t('import.missingColumns', { columns: preview.missingColumns.join(', ') })}
              </p>
            )}
            {preview.unknownColumns.length > 0 && (
              <p className="bg-warning/15 text-warning rounded-xl px-4 py-3">
                {t('import.unknownColumns', { columns: preview.unknownColumns.join(', ') })}
              </p>
            )}
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>{t('import.row')}</th>
                  <th className={thClass}>{t('import.preview')}</th>
                  <th className={thClass}>{t('import.result')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.row}
                    data-testid="import-row"
                    data-row={row.row}
                    data-ok={row.ok ? 'true' : 'false'}
                  >
                    <td className={`${tdClass} tabular-nums`}>{row.row}</td>
                    <td className={tdClass}>{row.preview || t('common.none')}</td>
                    <td className={tdClass}>
                      <RowIssues row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-3">
              <button
                type="button"
                data-testid="import-commit"
                className={smallButton('primary')}
                disabled={valid.length === 0 || busy !== null}
                onClick={() => void commit()}
              >
                {busy === 'committing'
                  ? t('import.committing')
                  : t('import.commit', { count: valid.length })}
              </button>
              <button type="button" className={smallButton()} onClick={reset}>
                {t('common.cancel')}
              </button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/** CSV/XLSX import (SPEC §15 Phase 9): template, check, then save the valid rows. */
export default function ImportContentPage() {
  return (
    <Suspense>
      <ImportContent />
    </Suspense>
  );
}
