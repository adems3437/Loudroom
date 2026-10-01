'use client';

import { packSummarySchema } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  formatDate,
  LoadState,
  PageHeader,
  smallButton,
  StatusBadge,
  tableClass,
  tdClass,
  thClass,
  useApiData,
} from '@/admin/ui';

const listSchema = packSummarySchema.array();

export default function PacksPage() {
  const t = useTranslations('admin');
  const { state } = useApiData('/api/admin/packs', listSchema);
  return (
    <>
      <PageHeader
        title={t('packs.title')}
        actions={
          <Link
            href="/admin/game-packs/new"
            data-testid="pack-new"
            className={smallButton('primary')}
          >
            {t('packs.new')}
          </Link>
        }
      />
      {state.status !== 'ready' ? (
        <LoadState state={state} />
      ) : state.data.length === 0 ? (
        <p className="text-muted">{t('common.empty')}</p>
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>{t('packs.name')}</th>
              <th className={thClass}>{t('packs.rounds')}</th>
              <th className={thClass}>{t('content.status')}</th>
              <th className={thClass}>{t('content.updatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((pack) => (
              <tr key={pack.id} data-testid="pack-row" data-pack-id={pack.id}>
                <td className={tdClass}>
                  <Link
                    href={`/admin/game-packs/${pack.id}`}
                    className="hover:text-brand-strong font-semibold"
                  >
                    {pack.name}
                  </Link>
                  {pack.description && (
                    <span className="text-muted block truncate text-sm">{pack.description}</span>
                  )}
                </td>
                <td className={`${tdClass} text-sm`}>
                  {t('packs.roundCount', { count: pack.roundCount })} ·{' '}
                  {t('packs.questions', { count: pack.questionCount })}
                </td>
                <td className={tdClass}>
                  <StatusBadge status={pack.status} />
                </td>
                <td className={`${tdClass} text-muted text-sm`}>{formatDate(pack.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
