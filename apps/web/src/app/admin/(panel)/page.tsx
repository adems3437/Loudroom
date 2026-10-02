'use client';

import { adminOverviewSchema, adminStatsSchema, contentStatSchema } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { summarize } from '@/admin/content-form';
import { LoadState, PageHeader, smallButton, useApiData } from '@/admin/ui';

const STATS_DAYS = 30;
const topContentSchema = contentStatSchema.array();

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** Activity of the last 30 days from game history (SPEC §15 Phase 9). */
function Activity() {
  const t = useTranslations('admin');
  const { state } = useApiData(`/api/admin/stats?days=${STATS_DAYS}`, adminStatsSchema);
  const hardest = useApiData(
    '/api/admin/stats/content/top?order=hardest&limit=5',
    topContentSchema,
  ).state;
  if (state.status !== 'ready') return <LoadState state={state} />;
  const stats = state.data;
  const busiest = Math.max(1, ...stats.perDay.map((day) => day.sessions));
  const cards = [
    {
      label: t('stats.sessions'),
      value: stats.sessions,
      sub: t('stats.finished', { count: stats.finishedSessions }),
    },
    { label: t('stats.players'), value: stats.players },
    { label: t('stats.rounds'), value: stats.rounds },
  ];
  return (
    <section className="mt-10 flex flex-col gap-4" data-testid="admin-stats">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold">
          {t('stats.title', { days: stats.days })}
        </h2>
        <Link href="/admin/sessions" className={smallButton()}>
          {t('stats.seeHistory')}
        </Link>
      </header>
      <ul className="grid grid-cols-3 gap-4">
        {cards.map((card) => (
          <li key={card.label} className="bg-surface border-line rounded-2xl border p-5">
            <span className="font-display block text-4xl font-bold tabular-nums">{card.value}</span>
            <span className="text-muted">{card.label}</span>
            {card.sub && <span className="text-success mt-2 block text-sm">{card.sub}</span>}
          </li>
        ))}
      </ul>
      {stats.sessions === 0 ? (
        <p className="text-muted">{t('stats.none')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={t('stats.perDay')}>
            <ol className="flex h-32 items-end gap-1" aria-label={t('stats.perDay')}>
              {stats.perDay.map((day) => (
                <li
                  key={day.date}
                  title={`${day.date}: ${t('stats.sessionCount', { count: day.sessions })}`}
                  className="bg-brand min-w-1 flex-1 rounded-t"
                  style={{ height: `${(day.sessions / busiest) * 100}%` }}
                />
              ))}
            </ol>
          </Panel>
          <Panel title={t('stats.packs')}>
            <ol className="flex flex-col gap-1">
              {stats.packs.map((pack) => (
                <li
                  key={`${pack.packId ?? ''}-${pack.name}`}
                  className="flex justify-between gap-3"
                >
                  <span className="truncate">{pack.name}</span>
                  <span className="text-muted tabular-nums">
                    {t('stats.sessionCount', { count: pack.sessions })}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title={t('stats.games')}>
            <ol className="flex flex-col gap-1">
              {stats.games.map((game) => (
                <li key={game.gameType} className="flex justify-between gap-3">
                  <span>{t(`gameTypes.${game.gameType}` as 'gameTypes.quiz')}</span>
                  <span className="text-muted tabular-nums">
                    {t('stats.roundCount', { count: game.rounds })}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title={t('stats.hardest')}>
            <p className="text-muted text-sm">{t('stats.hardestHint')}</p>
            {hardest.status === 'ready' && hardest.data.length > 0 ? (
              <ol className="flex flex-col gap-1">
                {hardest.data.map((stat) => (
                  <li key={stat.contentItemId} className="flex justify-between gap-3">
                    <Link
                      href={`/admin/content/${stat.contentItemId}`}
                      className="hover:text-brand-strong truncate"
                    >
                      {summarize(stat) ?? t('common.none')}
                    </Link>
                    <span className="text-muted shrink-0 tabular-nums">
                      {stat.correctRate === null
                        ? t('common.none')
                        : t('content.correctRate', { rate: Math.round(stat.correctRate * 100) })}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted">{t('common.empty')}</p>
            )}
          </Panel>
        </div>
      )}
    </section>
  );
}

export default function AdminOverviewPage() {
  const t = useTranslations('admin.overview');
  const { state } = useApiData('/api/admin/overview', adminOverviewSchema);
  if (state.status !== 'ready') return <LoadState state={state} />;
  const data = state.data;
  const cards = [
    {
      href: '/admin/content',
      label: t('content'),
      value: data.content.total,
      sub: data.content.published,
    },
    { href: '/admin/content/categories', label: t('categories'), value: data.categories },
    { href: '/admin/media', label: t('media'), value: data.media },
    {
      href: '/admin/game-packs',
      label: t('packs'),
      value: data.packs.total,
      sub: data.packs.published,
    },
  ];
  return (
    <>
      <PageHeader title={t('title')} />
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="bg-surface border-line hover:bg-surface-raised block rounded-2xl border p-5"
            >
              <span className="font-display block text-4xl font-bold tabular-nums">
                {card.value}
              </span>
              <span className="text-muted">{card.label}</span>
              {card.sub !== undefined && (
                <span className="text-success mt-2 block text-sm">
                  {t('published', { count: card.sub })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <Activity />
    </>
  );
}
