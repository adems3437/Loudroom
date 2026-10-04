import type { GamePlayer } from '@loudroom/game-sdk';

/** Who plays (in seat order) and who watches (SPEC §7.12–7.16: seat system). */
export interface Seating {
  seats: string[];
  spectators: string[];
}

/**
 * Seats the players connected when the match begins, in join order; those beyond the seats
 * watch. Players who are offline at the start watch too (they cannot take a turn).
 */
export function seatPlayers(players: readonly GamePlayer[], maxSeats: number): Seating {
  const ids = players.map((player) => player.id);
  const connected = players.filter((player) => player.connected).map((player) => player.id);
  const seats = connected.slice(0, maxSeats);
  return { seats, spectators: ids.filter((id) => !seats.includes(id)) };
}

/** A seated player who cannot act now: offline, or gone from the room. */
export function isAway(playerId: string, players: readonly GamePlayer[]): boolean {
  return !players.some((player) => player.id === playerId && player.connected);
}

/** The side a seat plays for: partners sit opposite (0+2, 1+3); otherwise each seat alone. */
export function sideOf(seat: number, teams: boolean): number {
  return teams ? seat % 2 : seat;
}

/** Seats per side, in side order. */
export function sideSeats(seatCount: number, teams: boolean): number[][] {
  const count = teams ? 2 : seatCount;
  return Array.from({ length: count }, (_, side) =>
    Array.from({ length: seatCount }, (_, seat) => seat).filter(
      (seat) => sideOf(seat, teams) === side,
    ),
  );
}
