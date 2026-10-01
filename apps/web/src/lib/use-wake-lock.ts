'use client';

import { useEffect } from 'react';

/**
 * Keeps the phone screen on while `active`, so the connection does not drop when it would
 * otherwise sleep. Needs a secure context (HTTPS or localhost); silently does nothing elsewhere.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || sentinel) return;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await acquired.release();
          return;
        }
        sentinel = acquired;
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        // denied, insecure context or battery saver
      }
    };

    // The lock is released whenever the page is hidden; take it again when it comes back.
    const onVisibilityChange = () => {
      void acquire();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void acquire();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
    };
  }, [active]);
}
