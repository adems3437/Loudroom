'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ContentForm } from '@/admin/content-form';
import { PageHeader } from '@/admin/ui';
import { GAME_TYPES } from '@/games/registry';

function NewContent() {
  const t = useTranslations('admin.content');
  const requested = useSearchParams().get('gameType');
  const gameType = requested && GAME_TYPES.includes(requested) ? requested : GAME_TYPES[0];
  if (!gameType) return null;
  return (
    <>
      <PageHeader title={t('new')} />
      <ContentForm key={gameType} gameType={gameType} item={null} />
    </>
  );
}

export default function NewContentPage() {
  return (
    <Suspense>
      <NewContent />
    </Suspense>
  );
}
