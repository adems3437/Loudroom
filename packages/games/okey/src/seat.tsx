'use client';

import type { AvatarProps, RendererPlayer, Translate } from '@loudroom/game-sdk/client';
import type { ComponentType } from 'react';
import { OKEY_COLORS, tileOf, type Face } from './tiles.js';

interface SeatLike {
  id: string;
  bot: number | null;
}

/** A seat's display name: the player's nickname, or "Bot n". */
export function seatName(seat: SeatLike, players: readonly RendererPlayer[], t: Translate) {
  if (seat.bot !== null) return t('botName', { n: seat.bot });
  return players.find((player) => player.id === seat.id)?.nickname ?? '?';
}

/** A player's avatar, or a robot for a bot seat. */
export function SeatAvatar({
  seat,
  players,
  Avatar,
  size,
}: {
  seat: SeatLike;
  players: readonly RendererPlayer[];
  Avatar: ComponentType<AvatarProps>;
  size: number;
}) {
  const player = players.find((p) => p.id === seat.id);
  if (seat.bot !== null || !player) {
    return (
      <span
        className="bg-surface-raised grid shrink-0 place-items-center rounded-full"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
      >
        🤖
      </span>
    );
  }
  return <Avatar avatar={player.avatar} color={player.color} size={size} />;
}

/** A tile id showing a face (the okey has no tile of its own on the table). */
export const tileFor = (face: Face) => OKEY_COLORS.indexOf(face.color) * 26 + face.number - 1;

/** The okey tile itself (marked on racks and finished hands). */
export const isOkey = (id: number, okey: Face) => {
  const tile = tileOf(id);
  return !tile.fake && tile.color === okey.color && tile.number === okey.number;
};
