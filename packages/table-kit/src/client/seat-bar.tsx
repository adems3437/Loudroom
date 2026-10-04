'use client';

import type { AvatarProps, RendererPlayer } from '@loudroom/game-sdk/client';
import type { ComponentType, ReactNode } from 'react';

export interface SeatInfo {
  playerId: string;
  /** Cards (or tiles) in hand; null when the game does not show it. */
  count: number | null;
  active: boolean;
  /** Partners share a side; null without teams. */
  side: number | null;
  /** Short status under the name, e.g. "UNO!" or "Bot oynuyor". */
  badge?: string | null;
}

const SIDE_RING = ['ring-brand', 'ring-accent'];

/**
 * The table's seats on the TV, in turn order: whose turn it is, how many cards each holds,
 * partners by colour. `extra` adds anything per seat (e.g. points).
 */
export function SeatBar({
  seats,
  players,
  Avatar,
  extra,
}: {
  seats: readonly SeatInfo[];
  players: readonly RendererPlayer[];
  Avatar: ComponentType<AvatarProps>;
  extra?: (seat: SeatInfo) => ReactNode;
}) {
  const byId = new Map(players.map((player) => [player.id, player]));
  return (
    <ol className="flex flex-wrap justify-center gap-4" data-testid="table-seats">
      {seats.map((seat) => {
        const player = byId.get(seat.playerId);
        const away = !player?.connected;
        return (
          <li
            key={seat.playerId}
            data-testid="table-seat"
            data-player-id={seat.playerId}
            data-active={seat.active}
            data-count={seat.count ?? ''}
            className={`flex min-w-[200px] items-center gap-4 rounded-3xl px-5 py-3 transition-[background-color,transform] duration-300 ${
              seat.active ? 'bg-surface-raised scale-105' : 'bg-surface'
            } ${away ? 'opacity-50' : ''}`}
          >
            <span
              className={`rounded-full ${
                seat.side !== null ? `ring-4 ${SIDE_RING[seat.side % 2] ?? ''}` : ''
              } ${seat.active ? 'ring-success ring-8' : ''}`}
            >
              {player && <Avatar avatar={player.avatar} color={player.color} size={64} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="max-w-[200px] truncate text-[28px] font-bold">
                {player?.nickname ?? '?'}
              </span>
              <span className="text-muted flex items-center gap-3 text-[24px]">
                {seat.count !== null && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <span className="bg-brand inline-block h-[28px] w-[20px] rounded-[4px]" />×
                    {seat.count}
                  </span>
                )}
                {seat.badge && <span className="text-accent font-bold">{seat.badge}</span>}
              </span>
              {extra?.(seat)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
