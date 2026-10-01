'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
  };
}

export function FullscreenButton({ className = '' }: { className?: string }) {
  const t = useTranslations('host');
  const supported = useSyncExternalStore(
    subscribe,
    () => document.fullscreenEnabled,
    () => false,
  );
  const active = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement !== null,
    () => false,
  );

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const request = active
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen();
        request.catch(() => undefined);
      }}
      className={`border-line bg-surface hover:bg-surface-raised rounded-2xl border px-[0.8em] py-[0.4em] ${className}`}
    >
      {active ? t('exitFullscreen') : t('fullscreen')}
    </button>
  );
}
