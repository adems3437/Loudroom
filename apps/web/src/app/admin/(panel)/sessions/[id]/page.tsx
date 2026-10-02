'use client';

import { sessionDetailSchema, type ApiError, type SessionDetail } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { summarize } from '@/admin/content-form';
import { useAdminSession, useAdminUser } from '@/admin/session';
import { SessionStatusBadge } from '@/admin/sessions';
import {
  ConfirmDelete,
  ErrorBanner,
  formatDate,
  LoadState,
  PageHeader,
  smallButton,
  tableClass,
  tdClass,
  thClass,
  useApiData,
} from '@/admin/ui';

type Round = SessionDetail['rounds'][number];

function Verdict({ result }: { result: Round['results'][number] }) {
  const t = useTranslations('admin.sessions');
  if (result.answer === null) return <span className="text-muted">{t('noAnswer')}</span>;
  if (result.correct === true) return <span className="text-success">{t('right')}</span>;
  if (result.correct === false) return <span className="text-danger">{t('wrong')}</span>;
  return <span>{t('answered')}</span>;
}

function RoundCard({ round, players }: { round: Round; players: SessionDetail['players'] }) {
  const t = useTranslations('admin');
  const nickname = (id: string) => players.find((player) => player.id === id)?.nickname ?? '—';
  const summary = summarize({ gameType: round.gameType, data: round.content });
  return (
    <li
      data-testid="session-round"
      className="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold">
          {t('sessions.roundTitle', {
            number: round.index + 1,
            game: t(`gameTypes.${round.gameType}` as 'gameTypes.quiz'),
          })}
        </h3>
        {round.contentItemId && (
          <Link
            href={`/admin/content/${round.contentItemId}`}
            className="text-muted hover:text-brand-strong text-sm"
          >
            {t('sessions.openContent')}
          </Link>
        )}
      </div>
      <p>{summary ?? t('sessions.unknownContent')}</p>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>{t('sessions.player')}</th>
            <th className={thClass}>{t('sessions.correct')}</th>
            <th className={thClass}>{t('sessions.time')}</th>
            <th className={thClass}>{t('sessions.points')}</th>
          </tr>
        </thead>
        <tbody>
          {round.results.map((result) => (
            <tr key={result.playerId}>
              <td className={tdClass}>{nickname(result.playerId)}</td>
              <td className={tdClass}>
                <Verdict result={result} />
              </td>
              <td className={`${tdClass} tabular-nums`}>
                {result.responseTimeMs === null
                  ? t('common.none')
                  : t('sessions.seconds', { value: (result.responseTimeMs / 1000).toFixed(1) })}
              </td>
              <td className={`${tdClass} tabular-nums`}>{result.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  );
}

/** One played game: final ranking and every round with each player's result. */
export default function SessionDetailPage() {
  const t = useTranslations('admin');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api } = useAdminSession();
  const user = useAdminUser();
  const { state } = useApiData(`/api/admin/sessions/${id}`, sessionDetailSchema);
  const [error, setError] = useState<ApiError | null>(null);

  if (state.status !== 'ready') return <LoadState state={state} />;
  const session = state.data;

  const remove = async () => {
    const result = await api(`/api/admin/sessions/${session.id}`, { method: 'DELETE' });
    setError(result.ok ? null : result.error);
    if (result.ok) router.push('/admin/sessions');
  };

  return (
    <>
      <PageHeader
        title={t('sessions.detailTitle', { pack: session.packName, roomCode: session.roomCode })}
        actions={
          <>
            {user?.role === 'ADMIN' && (
              <ConfirmDelete testId="session-delete" onConfirm={() => void remove()} />
            )}
            <Link href="/admin/sessions" className={smallButton()}>
              {t('common.back')}
            </Link>
          </>
        }
      />
      <div className="flex flex-col gap-6" data-testid="session-detail">
        <ErrorBanner error={error} />
        <p className="text-muted flex flex-wrap items-center gap-3">
          <SessionStatusBadge status={session.status} />
          {session.endedAt
            ? t('sessions.duration', {
                start: formatDate(session.startedAt),
                end: formatDate(session.endedAt),
              })
            : formatDate(session.startedAt)}
        </p>

        <section>
          <h2 className="font-display mb-3 text-xl font-bold">{t('sessions.ranking')}</h2>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>{t('sessions.player')}</th>
                <th className={thClass}>{t('sessions.score')}</th>
              </tr>
            </thead>
            <tbody>
              {session.players.map((player) => (
                <tr key={player.id} data-testid="session-player">
                  <td className={`${tdClass} tabular-nums`}>
                    {player.finalRank ?? t('common.none')}
                  </td>
                  <td className={`${tdClass} font-semibold`}>{player.nickname}</td>
                  <td className={`${tdClass} tabular-nums`}>{player.finalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <ol className="flex flex-col gap-4">
          {session.rounds.map((round) => (
            <RoundCard key={round.index} round={round} players={session.players} />
          ))}
        </ol>
      </div>
    </>
  );
}
