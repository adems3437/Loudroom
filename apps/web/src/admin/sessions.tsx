'use client';

import type { SessionStatus } from '@loudroom/shared';
import { useTranslations } from 'next-intl';

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('admin.sessions.statuses');
  const tone = {
    FINISHED: 'bg-success/15 text-success',
    ACTIVE: 'bg-accent/15 text-accent',
    ABORTED: 'bg-warning/15 text-warning',
  }[status];
  return (
    <span
      data-status={status}
      className={`inline-block rounded-full px-3 py-0.5 text-sm font-semibold ${tone}`}
    >
      {t(status)}
    </span>
  );
}
