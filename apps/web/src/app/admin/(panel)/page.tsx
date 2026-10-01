'use client';

import { adminOverviewSchema } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LoadState, PageHeader, useApiData } from '@/admin/ui';

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
    </>
  );
}
