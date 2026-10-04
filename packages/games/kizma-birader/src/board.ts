import { GOAL_SIZE } from './schema.js';

export type BoardSlots = 4 | 6;

/** Squares between two starts: 10 on the 4-player board (40 squares), 8 on the 6-player (48). */
export const SPACING: Record<BoardSlots, number> = { 4: 10, 6: 8 };

export const trackLength = (slots: BoardSlots) => slots * SPACING[slots];

/** Where 2–6 players sit around the board, as far apart as the slots allow. */
export function slotsFor(players: number, slots: BoardSlots): number[] {
  if (slots === 4) return players === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, players);
  const spread: Record<number, number[]> = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
  };
  return spread[players] ?? [];
}

/** A pawn's track square (0…track−1), or null in the yard or the goal lane. */
export function squareOf(slot: number, progress: number, slots: BoardSlots): number | null {
  const track = trackLength(slots);
  if (progress < 0 || progress >= track) return null;
  return (slot * SPACING[slots] + progress) % track;
}

export interface Seat {
  playerId: string;
  slot: number;
  pawns: number[];
}

export interface Move {
  pawn: number;
  from: number;
  to: number;
  captured: { playerId: string; pawn: number } | null;
}

/**
 * Where a pawn would go with the die, or null if it cannot move (SPEC §7.15): out of the yard
 * only with a 6 and onto a start not taken by an own pawn; never onto an own pawn; into the
 * goal only by the exact count and without jumping an own pawn there. Landing on another
 * player's pawn sends it home.
 */
export function moveOf(
  seats: readonly Seat[],
  seat: Seat,
  pawn: number,
  die: number,
  slots: BoardSlots,
): Move | null {
  const track = trackLength(slots);
  const from = seat.pawns[pawn];
  if (from === undefined) return null;
  const to = from < 0 ? (die === 6 ? 0 : null) : from + die;
  if (to === null || to > track + GOAL_SIZE - 1) return null;

  if (to >= track) {
    // The goal lane: own pawns may be neither landed on nor jumped.
    const firstGoal = Math.max(from + 1, track);
    const blocked = seat.pawns.some((p, i) => i !== pawn && p >= firstGoal && p <= to);
    return blocked ? null : { pawn, from, to, captured: null };
  }

  const square = squareOf(seat.slot, to, slots);
  if (seat.pawns.some((p, i) => i !== pawn && squareOf(seat.slot, p, slots) === square)) {
    return null;
  }
  for (const other of seats) {
    if (other.playerId === seat.playerId) continue;
    const hit = other.pawns.findIndex((p) => squareOf(other.slot, p, slots) === square);
    if (hit !== -1) return { pawn, from, to, captured: { playerId: other.playerId, pawn: hit } };
  }
  return { pawn, from, to, captured: null };
}

export function movesOf(
  seats: readonly Seat[],
  seat: Seat,
  die: number,
  slots: BoardSlots,
): Move[] {
  return seat.pawns.flatMap((_, pawn) => {
    const move = moveOf(seats, seat, pawn, die, slots);
    return move ? [move] : [];
  });
}

/** All of a player's pawns are in the goal lane. */
export const isHome = (seat: Seat, slots: BoardSlots) =>
  seat.pawns.every((p) => p >= trackLength(slots));

/**
 * Only a 6 can help: no pawn on the track, and every pawn in the goal lane already as far as
 * it can go. Such a player gets three tries for a 6.
 */
export function onlySixHelps(seat: Seat, slots: BoardSlots): boolean {
  const track = trackLength(slots);
  if (seat.pawns.some((p) => p >= 0 && p < track)) return false;
  return [1, 2, 3, 4, 5].every((die) =>
    seat.pawns.every((p, i) => p < 0 || moveOf([seat], seat, i, die, slots) === null),
  );
}
