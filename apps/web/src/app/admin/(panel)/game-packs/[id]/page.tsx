'use client';

import { packSchema } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { PackForm } from '@/admin/pack-form';
import { LoadState, PageHeader, useApiData } from '@/admin/ui';

export default function EditPackPage() {
  const t = useTranslations('admin.packs');
  const { id } = useParams<{ id: string }>();
  const { state } = useApiData(`/api/admin/packs/${id}`, packSchema);
  return (
    <>
      <PageHeader title={t('edit')} />
      {state.status === 'ready' ? (
        <PackForm key={state.data.updatedAt} pack={state.data} />
      ) : (
        <LoadState state={state} />
      )}
    </>
  );
}
