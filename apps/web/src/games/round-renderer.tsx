'use client';

import type { AvatarProps, RendererPlayer, RoundStream } from '@loudroom/game-sdk/client';
import { avatarIdSchema, ClientCommand, type GameState } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { Avatar } from '@/components/avatar';
import { tapFeedback } from '@/lib/haptics';
import { sendCommand, sendStream } from '@/realtime/commands';
import { useRealtime, type RealtimeState } from '@/realtime/realtime-provider';
import { findRenderer } from './registry';
import { useGameTranslator } from './translator';

type Round = NonNullable<GameState['round']>;

function UnknownView() {
  const t = useTranslations('game');
  return <p className="text-danger">{t('unsupported')}</p>;
}

/** The web app's avatar set, for game screens (an unknown avatar id falls back to a circle). */
function GameAvatar({ avatar, color, size, className }: AvatarProps) {
  return (
    <Avatar
      id={avatarIdSchema.catch('circle').parse(avatar)}
      color={color}
      size={size}
      {...(className ? { className } : {})}
    />
  );
}

/** The round's stream channel for its renderer (SPEC §5 `round:stream`). */
function useRoundStream(roundId: string, realtime: RealtimeState): RoundStream {
  const { socket, streams } = realtime;
  return useMemo(
    () => ({
      subscribe: (listener) => streams.subscribe(roundId, listener),
      send: (chunk) => {
        streams.record(roundId, chunk);
        if (socket) sendStream(socket, roundId, chunk);
      },
    }),
    [roundId, socket, streams],
  );
}

/**
 * The current round on the host screen, drawn by the game's own renderer. Keyed by round, so a
 * renderer's local state (a half-sorted list, a typed number) never carries into the next round.
 */
export function HostRound({
  round,
  players,
  paused,
}: {
  round: Round;
  players: RendererPlayer[];
  paused: boolean;
}) {
  const realtime = useRealtime();
  const { serverNow } = realtime;
  const stream = useRoundStream(round.roundId, realtime);
  const t = useGameTranslator(round.gameType);
  const renderer = findRenderer(round.gameType);
  const view = renderer?.hostViewSchema.safeParse(round.view);
  if (!renderer || !view?.success) return <UnknownView />;
  const { Host } = renderer;
  return (
    <Host
      key={round.roundId}
      view={view.data}
      phase={round.phase}
      serverNow={serverNow}
      players={players}
      t={t}
      Avatar={GameAvatar}
      stream={stream}
      paused={paused}
    />
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
  const realtime = useRealtime();
  const { socket, serverNow } = realtime;
  const stream = useRoundStream(round.roundId, realtime);
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
      key={round.roundId}
      view={view.data}
      phase={round.phase}
      serverNow={serverNow}
      players={players}
      t={t}
      Avatar={GameAvatar}
      stream={stream}
      playerId={playerId}
      submit={submit}
      haptic={tapFeedback}
      describeError={describeError}
    />
  );
}
