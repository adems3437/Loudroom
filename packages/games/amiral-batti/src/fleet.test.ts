import { createRandom } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import { botTarget, cellsOf, randomFleet, shotAt, validFleet } from './fleet.js';
import { FLEETS } from './schema.js';

describe('amiral batti fleets', () => {
  it('accept ships inside the grid that do not overlap (touching is fine)', () => {
    const sizes = [3, 2];
    expect(
      validFleet(
        [
          { x: 0, y: 0, vertical: false },
          { x: 0, y: 1, vertical: false },
        ],
        sizes,
        6,
      ),
    ).toBe(true);
    expect(
      validFleet(
        [
          { x: 0, y: 0, vertical: false },
          { x: 1, y: 0, vertical: true },
        ],
        sizes,
        6,
      ),
    ).toBe(false);
    expect(
      validFleet(
        [
          { x: 4, y: 0, vertical: false },
          { x: 0, y: 1, vertical: false },
        ],
        sizes,
        6,
      ),
    ).toBe(false);
    expect(validFleet([{ x: 0, y: 0, vertical: false }], sizes, 6)).toBe(false);
  });

  it('lays out valid random fleets of every size', () => {
    for (const { grid, ships } of Object.values(FLEETS)) {
      for (let seed = 1; seed <= 50; seed++) {
        expect(validFleet(randomFleet(createRandom(seed), ships, grid), ships, grid)).toBe(true);
      }
    }
  });

  it('reports hits, and the ship when its last cell is hit', () => {
    const ships = [{ x: 1, y: 1, vertical: true }];
    expect(shotAt(ships, [2], [], 0, 0)).toEqual({ x: 0, y: 0, hit: false, sunk: null });
    const first = shotAt(ships, [2], [], 1, 1);
    expect(first).toEqual({ x: 1, y: 1, hit: true, sunk: null });
    expect(shotAt(ships, [2], [first], 1, 2)).toEqual({
      x: 1,
      y: 2,
      hit: true,
      sunk: { x: 1, y: 1, vertical: true, size: 2 },
    });
    expect(cellsOf({ x: 2, y: 3, vertical: false }, 3)).toEqual([
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });

  it('aims bots next to an open hit, along the line once two are known', () => {
    const random = createRandom(4);
    const one = botTarget([{ x: 2, y: 2, hit: true, sunk: null }], 6, random);
    expect([
      [1, 2],
      [3, 2],
      [2, 1],
      [2, 3],
    ]).toContainEqual(one);
    const line = botTarget(
      [
        { x: 2, y: 2, hit: true, sunk: null },
        { x: 3, y: 2, hit: true, sunk: null },
      ],
      6,
      random,
    );
    expect([
      [1, 2],
      [4, 2],
    ]).toContainEqual(line);
    const fresh = botTarget([], 6, random);
    expect((fresh[0] + fresh[1]) % 2).toBe(0);
  });
});
