'use client';

import { useTranslations } from 'next-intl';
import { PackForm } from '@/admin/pack-form';
import { PageHeader } from '@/admin/ui';

export default function NewPackPage() {
  const t = useTranslations('admin.packs');
  return (
    <>
      <PageHeader title={t('new')} />
      <PackForm pack={null} />
    </>
  );
}
