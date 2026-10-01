'use client';

import type { RendererPlayer } from '@loudroom/game-sdk/client';
import { ClientCommand, type GameState } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { tapFeedback } from '@/lib/haptics';
import { sendCommand } from '@/realtime/commands';
import { useRealtime } from '@/realtime/realtime-provider';
import { findRenderer } from './registry';
import { useGameTranslator } from './translator';

type Round = NonNullable<GameState['round']>;

function UnknownView() {
  const t = useTranslations('game');
  return <p className="text-danger">{t('unsupported')}</p>;
}

/** The current round on the host screen, drawn by the game's own renderer. */
export function HostRound({ round, players }: { round: Round; players: RendererPlayer[] }) {
  const { serverNow } = useRealtime();
  const t = useGameTranslator(round.gameType);
  const renderer = findRenderer(round.gameType);
  const view = renderer?.hostViewSchema.safeParse(round.view);
  if (!renderer || !view?.success) return <UnknownView />;
  const { Host } = renderer;
  return (
    <Host view={view.data} phase={round.phase} serverNow={serverNow} players={players} t={t} />
  );
}

/** The current round on a phone. */
export function PlayerRound({
  round,
  players,
  playerId,
}: {
  round: Round;
  players: RendererPlayer[];
  playerId: string;
}) {
  const { socket, serverNow } = useRealtime();
  const t = useGameTranslator(round.gameType);
  const errors = useTranslations('errors');
  const renderer = findRenderer(round.gameType);
  const view = renderer?.playerViewSchema.safeParse(round.view);

  const submit = useCallback(
    async (input: unknown) => {
      if (!socket) return { ok: false as const, code: 'NO_RESPONSE' };
      const result = await sendCommand(socket, ClientCommand.RoundInput, {
        roundId: round.roundId,
        input,
      });
      return result.ok ? { ok: true as const } : { ok: false as const, code: result.code };
    },
    [socket, round.roundId],
  );
  const describeError = useMemo(
    () => (code: string) => errors(code as Parameters<typeof errors>[0]),
    [errors],
  );

  if (!renderer || !view?.success) return <UnknownView />;
  const { Player } = renderer;
  return (
    <Player
      view={view.data}
      phase={round.phase}
      serverNow={serverNow}
      players={players}
      t={t}
      playerId={playerId}
      submit={submit}
      haptic={tapFeedback}
      describeError={describeError}
    />
  );
}
