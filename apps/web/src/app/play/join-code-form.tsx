'use client';

import { roomCodeSchema } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Brand } from '@/components/brand';
import { buttonClass } from '@/components/button';
import { ConnectionStatus } from '@/components/connection-status';
import { tapFeedback } from '@/lib/haptics';

export function JoinCodeForm() {
  const t = useTranslations('play');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  return (
    <main className="flex flex-1 flex-col gap-10">
      <header className="flex items-center justify-between">
        <span className="text-2xl">
          <Brand />
        </span>
        <ConnectionStatus variant="compact" />
      </header>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          tapFeedback();
          if (!roomCodeSchema.safeParse(code).success) {
            setError(true);
            return;
          }
          router.push(`/play/${code}`);
        }}
      >
        <label htmlFor="room-code" className="font-display text-3xl font-bold">
          {t('enterCode')}
        </label>
        <p className="text-muted">{t('codeHint')}</p>
        <input
          id="room-code"
          data-testid="room-code-input"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={6}
          value={code}
          aria-invalid={error}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
            setError(false);
          }}
          className="min-h-touch border-line bg-surface font-display focus:border-brand rounded-2xl border-2 px-4 text-center text-5xl font-extrabold tracking-[0.3em] tabular-nums outline-none"
        />
        {error && (
          <p role="alert" data-testid="code-error" className="text-danger">
            {t('codeInvalid')}
          </p>
        )}
        <button
          type="submit"
          data-testid="continue-button"
          className={buttonClass('accent', 'text-xl')}
        >
          {t('continue')}
        </button>
      </form>
    </main>
  );
}
