'use client';

import { contentItemSchema } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { ContentForm } from '@/admin/content-form';
import { LoadState, PageHeader, useApiData } from '@/admin/ui';

export default function EditContentPage() {
  const t = useTranslations('admin.content');
  const { id } = useParams<{ id: string }>();
  const { state } = useApiData(`/api/admin/content/${id}`, contentItemSchema);
  return (
    <>
      <PageHeader title={t('edit')} />
      {state.status === 'ready' ? (
        <ContentForm key={state.data.updatedAt} gameType={state.data.gameType} item={state.data} />
      ) : (
        <LoadState state={state} />
      )}
    </>
  );
}
