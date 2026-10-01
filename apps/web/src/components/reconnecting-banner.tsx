'use client';

import { useTranslations } from 'next-intl';
import { useRealtime } from '@/realtime/realtime-provider';

/** Band shown while the connection is being re-established (SPEC §4). */
export function ReconnectingBanner() {
  const t = useTranslations('connection');
  const { connection } = useRealtime();
  if (connection !== 'reconnecting') return null;
  return (
    <div
      role="status"
      data-testid="reconnecting-banner"
      className="bg-warning text-canvas sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 font-semibold"
    >
      <span aria-hidden className="bg-canvas size-2 animate-pulse rounded-full" />
      {t('state.reconnecting')}
    </div>
  );
}
