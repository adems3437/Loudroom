'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useRealtime, type ConnectionState } from '@/realtime/realtime-provider';

const dotColor: Record<ConnectionState, string> = {
  connecting: 'bg-warning',
  connected: 'bg-success',
  reconnecting: 'bg-danger',
  closed: 'bg-muted',
};

export function ConnectionStatus({ variant = 'detailed' }: { variant?: 'detailed' | 'compact' }) {
  const t = useTranslations('connection');
  const format = useFormatter();
  const { connection, clock } = useRealtime();

  const indicator = (
    <span className="inline-flex items-center gap-[0.5em]">
      <span
        aria-hidden
        className={`size-[0.6em] rounded-full ${dotColor[connection]} ${connection === 'connected' ? '' : 'animate-pulse'}`}
      />
      <span>{t(`state.${connection}`)}</span>
    </span>
  );

  if (variant === 'compact') {
    return (
      <div
        data-testid="connection-status"
        data-state={connection}
        role="status"
        className="text-muted text-sm"
      >
        {indicator}
      </div>
    );
  }

  const ms = (value: number, sign: boolean) =>
    t('ms', {
      value: format.number(Math.round(value), sign ? { signDisplay: 'exceptZero' } : {}),
    });

  return (
    <section
      data-testid="connection-status"
      data-state={connection}
      aria-labelledby="connection-status-title"
      className="border-line bg-surface rounded-2xl border p-[1em]"
    >
      <h2
        id="connection-status-title"
        className="text-muted text-[0.75em] font-medium tracking-wide uppercase"
      >
        {t('title')}
      </h2>
      <p role="status" className="mt-[0.5em] text-[1.25em] font-semibold">
        {indicator}
      </p>
      <dl className="mt-[0.75em] grid grid-cols-[auto_1fr] gap-x-[1em] gap-y-[0.25em] text-[0.875em]">
        <dt className="text-muted">{t('rtt')}</dt>
        <dd data-testid="clock-rtt" className="tabular-nums">
          {clock ? ms(clock.rttMs, false) : t('measuring')}
        </dd>
        <dt className="text-muted">{t('offset')}</dt>
        <dd data-testid="clock-offset" className="tabular-nums">
          {clock ? ms(clock.offsetMs, true) : t('measuring')}
        </dd>
      </dl>
    </section>
  );
}
