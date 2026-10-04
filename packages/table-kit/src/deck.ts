import { createRandom, seedFromString } from '@loudroom/game-sdk';

/**
 * Shuffles with a seed of its own. A module's `ctx.random` restarts from the round seed on
 * every call, so shuffles after the first (a reshuffled discard pile, the next deal) derive
 * their seed from one kept in the state and a label (e.g. "deal:2").
 */
export function shuffleWith<T>(seed: number, label: string, items: readonly T[]): T[] {
  return createRandom(seedFromString(`${seed}:${label}`)).shuffle(items);
}

/** Takes `count` items off the top (front) of a pile. */
export function take<T>(pile: readonly T[], count: number): { taken: T[]; rest: T[] } {
  return { taken: pile.slice(0, count), rest: pile.slice(count) };
}

/** Deals `count` items to each seat in turn, as at a real table. */
export function dealRound<T>(
  pile: readonly T[],
  seatCount: number,
  count: number,
): { hands: T[][]; rest: T[] } {
  const hands: T[][] = Array.from({ length: seatCount }, () => []);
  let index = 0;
  for (let card = 0; card < count; card++) {
    for (let seat = 0; seat < seatCount; seat++) {
      const item = pile[index++];
      if (item !== undefined) hands[seat]?.push(item);
    }
  }
  return { hands, rest: pile.slice(index) };
}
