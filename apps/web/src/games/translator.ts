'use client';

import type { Translate } from '@loudroom/game-sdk/client';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/** Translator for a game's own texts under `games.<gameType>` in messages/tr.json. */
export function useGameTranslator(gameType: string): Translate {
  const t = useTranslations('games');
  return useCallback(
    (key, values) =>
      // Keys live under games.<gameType>; next-intl cannot type a runtime namespace.
      t(`${gameType}.${key}` as Parameters<typeof t>[0], values),
    [t, gameType],
  );
}
