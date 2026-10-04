import { createRandom } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import {
  ALL_TILES,
  OKEY_COLORS,
  arrangePairs,
  arrangeRuns,
  completesGroup,
  findFinish,
  okeyOf,
  tileOf,
  tileWorth,
  valueOf,
  type Face,
  type OkeyColor,
} from './tiles.js';

/** The id of a numbered tile (copy 0 or 1). */
const t = (color: OkeyColor, number: number, copy = 0) =>
  OKEY_COLORS.indexOf(color) * 26 + copy * 13 + number - 1;
const FAKE = 104;
/** An okey nobody holds in these hands unless a test says so. */
const BLACK13: Face = { color: 'black', number: 13 };

describe('okey tiles', () => {
  it('has 106 tiles: two of each face and two fake okeys', () => {
    expect(ALL_TILES).toHaveLength(106);
    const faces = new Map<string, number>();
    for (const id of ALL_TILES) {
      const tile = tileOf(id);
      const key = tile.fake ? 'fake' : `${tile.color}${tile.number}`;
      faces.set(key, (faces.get(key) ?? 0) + 1);
    }
    expect(faces.size).toBe(53);
    expect([...faces.values()].every((count) => count === 2)).toBe(true);
    expect(tileOf(t('blue', 7, 1))).toEqual({
      id: t('blue', 7, 1),
      fake: false,
      color: 'blue',
      number: 7,
    });
  });

  it('makes the okey one above the indicator (13 wraps to 1); fake okeys stand for it', () => {
    expect(okeyOf({ color: 'red', number: 5 })).toEqual({ color: 'red', number: 6 });
    expect(okeyOf({ color: 'blue', number: 13 })).toEqual({ color: 'blue', number: 1 });
    const okey = { color: 'yellow', number: 3 } as const;
    expect(valueOf(t('yellow', 3), okey)).toBeNull();
    expect(valueOf(t('yellow', 3, 1), okey)).toBeNull();
    expect(valueOf(FAKE, okey)).toEqual(okey);
    expect(valueOf(t('red', 3), okey)).toMatchObject({ color: 'red', number: 3 });
  });
});

describe('finishing hands', () => {
  const finish = (ids: number[], okey: Face = BLACK13) => findFinish(ids, okey);

  it('finds sets of one number in different colours and runs of one colour', () => {
    const hand = [
      t('red', 1),
      t('red', 2),
      t('red', 3),
      t('red', 4),
      t('blue', 7),
      t('yellow', 7),
      t('black', 7),
      t('red', 7),
      t('yellow', 10),
      t('yellow', 11),
      t('yellow', 12),
      t('blue', 2),
      t('black', 2),
      t('yellow', 2),
    ];
    const found = finish(hand);
    expect(found?.kind).toBe('sets');
    expect(found?.groups.flat().sort((a, b) => a - b)).toEqual([...hand].sort((a, b) => a - b));
    for (const group of found?.groups ?? []) expect(group.length).toBeGreaterThanOrEqual(3);
  });

  it('lets 12-13-1 run but not 13-1-2', () => {
    const base = [
      t('blue', 4),
      t('blue', 5),
      t('blue', 6),
      t('red', 9),
      t('yellow', 9),
      t('black', 9),
      t('red', 3),
      t('red', 4),
      t('red', 5),
      t('red', 6),
      t('blue', 9),
    ];
    expect(finish([...base, t('yellow', 12), t('yellow', 13), t('yellow', 1)], BLACK13)).not.toBe(
      null,
    );
    expect(finish([...base, t('yellow', 13), t('yellow', 1), t('yellow', 2)], BLACK13)).toBeNull();
  });

  it('refuses a set with a colour twice, and a hand with a tile left over', () => {
    const runs = [
      t('red', 1),
      t('red', 2),
      t('red', 3),
      t('blue', 1),
      t('blue', 2),
      t('blue', 3),
      t('yellow', 1),
      t('yellow', 2),
      t('yellow', 3),
      t('black', 1),
      t('black', 2),
      t('black', 3),
    ];
    expect(finish([...runs, t('red', 5), t('red', 5, 1)])).toBeNull();
    expect(finish([...runs, t('red', 4), t('blue', 9)])).toBeNull();
    expect(finish([...runs, t('red', 4), t('blue', 4)])).not.toBeNull();
    expect(finish(runs)).toBeNull();
  });

  it('fills any gap with the okey, also twice', () => {
    const okey = { color: 'blue', number: 9 } as const;
    const hand = [
      t('blue', 9),
      t('blue', 9, 1),
      t('red', 1),
      t('red', 3),
      t('yellow', 5),
      t('black', 5),
      t('red', 10),
      t('red', 11),
      t('red', 12),
      t('red', 13),
      t('black', 6),
      t('black', 7),
      t('black', 8),
      t('black', 9),
    ];
    // red 1 _ 3 (okey), yellow-black 5 + okey, red 10–13, black 6–9.
    expect(findFinish(hand, okey)?.kind).toBe('sets');
    // Without the second okey the set of fives is one short.
    const short = hand.map((id) => (id === t('blue', 9, 1) ? t('yellow', 13) : id));
    expect(findFinish(short, okey)).toBeNull();
  });

  it('counts a fake okey as the okey tile, not as a wild one', () => {
    const okey = { color: 'red', number: 8 } as const;
    const hand = [
      FAKE,
      t('red', 9),
      t('red', 10),
      t('blue', 1),
      t('blue', 2),
      t('blue', 3),
      t('yellow', 4),
      t('red', 4),
      t('black', 4),
      t('black', 10),
      t('black', 11),
      t('black', 12),
      t('black', 13),
      t('blue', 4),
    ];
    expect(findFinish(hand, okey)?.kind).toBe('sets');
    // A fake okey cannot stand for red 11.
    const gap = hand.map((id) => (id === t('red', 9) ? t('red', 11) : id));
    expect(findFinish(gap, okey)).toBeNull();
  });

  it('finishes with seven pairs, an okey pairing with any tile', () => {
    const okey = { color: 'yellow', number: 2 } as const;
    const pairs = [
      t('red', 4),
      t('red', 4, 1),
      t('blue', 9),
      t('blue', 9, 1),
      t('black', 13),
      t('black', 13, 1),
      t('yellow', 7),
      t('yellow', 7, 1),
      t('red', 11),
      t('red', 11, 1),
      t('blue', 1),
      t('blue', 1, 1),
      t('black', 6),
      t('yellow', 2),
    ];
    expect(findFinish(pairs, okey)).toMatchObject({ kind: 'pairs' });
    expect(findFinish(pairs, okey)?.groups).toHaveLength(7);
    const broken = pairs.map((id) => (id === t('red', 4, 1) ? t('red', 5) : id));
    expect(findFinish(broken, okey)).toBeNull();
  });

  it('finds every hand built at random from runs, sets and the okey', () => {
    let tried = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const random = createRandom(seed);
      const okey: Face = {
        color: OKEY_COLORS[random.int(0, 3)] ?? 'red',
        number: random.int(1, 13),
      };
      const hand = randomFinishingHand(random, okey);
      if (!hand) continue;
      tried++;
      expect(findFinish(hand, okey), `seed ${seed}: ${hand.join(',')}`).not.toBeNull();
    }
    expect(tried).toBeGreaterThan(150);
  });
});

/** 14 tiles split into groups of 3–5 (a run or a set each); some tiles swapped for the okey. */
function randomFinishingHand(random: ReturnType<typeof createRandom>, okey: Face): number[] | null {
  const used = new Set<number>();
  const take = (color: OkeyColor, number: number) => {
    for (const copy of [0, 1]) {
      const id = t(color, number, copy);
      if (!used.has(id) && valueOf(id, okey) !== null) {
        used.add(id);
        return id;
      }
    }
    return null;
  };
  const sizes =
    [
      [3, 3, 4, 4],
      [3, 3, 3, 5],
      [4, 5, 5],
      [3, 4, 3, 4],
    ][random.int(0, 3)] ?? [];
  const hand: number[] = [];
  for (const size of sizes) {
    const color = OKEY_COLORS[random.int(0, 3)] ?? 'red';
    let group: (number | null)[];
    if (size <= 4 && random.next() < 0.4) {
      const number = random.int(1, 13);
      group = OKEY_COLORS.slice(0, size).map((c) => take(c, number));
    } else {
      const start = random.int(1, 14 - size + 1);
      group = Array.from({ length: size }, (_, i) => {
        const number = start + i === 14 ? 1 : start + i;
        return take(color, number);
      });
    }
    if (group.includes(null)) return null;
    hand.push(...(group as number[]));
  }
  // Up to two tiles become the okey tiles themselves.
  const okeys = [t(okey.color, okey.number, 0), t(okey.color, okey.number, 1)];
  for (const wild of okeys) {
    if (random.next() < 0.5) hand[random.int(0, hand.length - 1)] = wild;
  }
  return new Set(hand).size === 14 ? hand : null;
}

describe('rack helpers', () => {
  const okey = BLACK13;

  it('values tiles by their neighbours; wild tiles most', () => {
    const rack = [t('red', 5), t('red', 6), t('blue', 5), t('yellow', 12), t('black', 13)];
    expect(tileWorth(t('red', 5), rack, okey)).toBeGreaterThan(
      tileWorth(t('yellow', 12), rack, okey),
    );
    expect(tileWorth(t('black', 13), rack, okey)).toBe(100);
  });

  it('knows when a tile completes a set or a run of three (12-13-1 too)', () => {
    expect(completesGroup(t('red', 7), [t('red', 5), t('red', 6)], okey)).toBe(true);
    expect(completesGroup(t('red', 7), [t('red', 6), t('red', 8)], okey)).toBe(true);
    expect(completesGroup(t('red', 7), [t('red', 8), t('red', 9)], okey)).toBe(true);
    expect(completesGroup(t('red', 7), [t('red', 5), t('blue', 6)], okey)).toBe(false);
    expect(completesGroup(t('red', 7), [t('blue', 7), t('black', 7)], okey)).toBe(true);
    expect(completesGroup(t('red', 7), [t('blue', 7), t('red', 7, 1)], okey)).toBe(false);
    expect(completesGroup(t('red', 1), [t('red', 12), t('red', 13)], okey)).toBe(true);
    expect(completesGroup(t('red', 12), [t('red', 13), t('red', 1)], okey)).toBe(true);
    expect(completesGroup(t('red', 13), [t('red', 1), t('red', 2)], okey)).toBe(false);
    // The okey (black 13) in the rack does not count.
    expect(completesGroup(t('red', 7), [t('red', 6), t('black', 13)], okey)).toBe(false);
  });

  it('lays out runs and sets with gaps, and pairs side by side', () => {
    const tiles = [
      t('red', 3),
      t('red', 1),
      t('red', 2),
      t('blue', 7),
      t('yellow', 7),
      t('black', 7),
      t('blue', 1),
      t('black', 13),
    ];
    const runs = arrangeRuns(tiles, okey);
    expect(runs).toHaveLength(30);
    expect(runs.slice(0, 4)).toEqual([t('red', 1), t('red', 2), t('red', 3), null]);
    expect(runs.filter((id) => id !== null).sort()).toEqual([...tiles].sort());
    expect(runs.findLast((id) => id !== null)).toBe(t('black', 13));

    const pairs = arrangePairs([t('red', 4, 1), t('blue', 2), t('red', 4)], okey);
    expect(pairs.slice(0, 3)).toEqual([t('red', 4), t('red', 4, 1), null]);
  });
});
