'use client';

import { pageSchema, sessionSummarySchema, type SessionStatus } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import {
  formatDate,
  inputClass,
  LoadState,
  PageHeader,
  Pagination,
  tableClass,
  tdClass,
  thClass,
  useApiData,
} from '@/admin/ui';
import { SessionStatusBadge } from '@/admin/sessions';

const sessionPageSchema = pageSchema(sessionSummarySchema);
const PAGE_SIZE = 25;
const STATUSES: SessionStatus[] = ['FINISHED', 'ACTIVE', 'ABORTED'];

/** Played games, newest first (SPEC §15 Phase 9). */
export default function SessionsPage() {
  const t = useTranslations('admin');
  const [status, setStatus] = useState<SessionStatus | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (q) query.set('q', q);
  const { state } = useApiData(`/api/admin/sessions?${query.toString()}`, sessionPageSchema);

  return (
    <>
      <PageHeader title={t('sessions.title')} />
      <form
        className="mb-4 grid grid-cols-[2fr_1fr] gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <input
          type="search"
          data-testid="sessions-search"
          aria-label={t('common.search')}
          placeholder={t('sessions.searchPlaceholder')}
          className={inputClass}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (event.target.value === '') {
              setQ('');
              setPage(1);
            }
          }}
        />
        <select
          aria-label={t('common.status')}
          className={inputClass}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as SessionStatus | '');
            setPage(1);
          }}
        >
          <option value="">
            {t('common.status')}: {t('common.all')}
          </option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`sessions.statuses.${value}`)}
            </option>
          ))}
        </select>
      </form>

      {state.status !== 'ready' ? (
        <LoadState state={state} />
      ) : state.data.items.length === 0 ? (
        <p className="text-muted">{t('common.empty')}</p>
      ) : (
        <>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>{t('sessions.startedAt')}</th>
                <th className={thClass}>{t('sessions.pack')}</th>
                <th className={thClass}>{t('sessions.roomCode')}</th>
                <th className={thClass}>{t('sessions.players')}</th>
                <th className={thClass}>{t('sessions.rounds')}</th>
                <th className={thClass}>{t('sessions.winner')}</th>
                <th className={thClass}>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((session) => (
                <tr key={session.id} data-testid="session-row" data-room-code={session.roomCode}>
                  <td className={tdClass}>
                    <Link
                      href={`/admin/sessions/${session.id}`}
                      className="hover:text-brand-strong font-semibold"
                    >
                      {formatDate(session.startedAt)}
                    </Link>
                  </td>
                  <td className={tdClass}>{session.packName}</td>
                  <td className={`${tdClass} tabular-nums`}>{session.roomCode}</td>
                  <td className={`${tdClass} tabular-nums`}>{session.playerCount}</td>
                  <td className={`${tdClass} tabular-nums`}>{session.roundCount}</td>
                  <td className={tdClass}>{session.winner ?? t('common.none')}</td>
                  <td className={tdClass}>
                    <SessionStatusBadge status={session.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={state.data.total} onPage={setPage} />
        </>
      )}
      <p className="text-muted mt-6 text-sm">{t('sessions.retention')}</p>
    </>
  );
}
