import { createRandom } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import { botTarget, cellsOf, randomFleet, shotAt, validFleet } from './fleet.js';
import { FLEETS, type Shot } from './schema.js';

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
    const one = botTarget([{ x: 2, y: 2, hit: true, sunk: null }], 6, [3, 2], random);
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
      [3, 2],
      random,
    );
    expect([
      [1, 2],
      [4, 2],
    ]).toContainEqual(line);
  });

  it('never fires where no ship still afloat fits', () => {
    // Misses everywhere but a lone corner cell and a row of three: only the three-ship is left.
    const free = new Set(['0,0', '3,3', '4,3', '5,3']);
    const misses = Array.from({ length: 36 }, (_, i) => ({ x: i % 6, y: Math.floor(i / 6) }))
      .filter(({ x, y }) => !free.has(`${x},${y}`))
      .map(({ x, y }) => ({ x, y, hit: false, sunk: null }));
    for (let seed = 1; seed <= 20; seed++) {
      const [x, y] = botTarget(misses, 6, [3], createRandom(seed));
      expect(y).toBe(3);
      expect(x).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves a sunk ship alone and counts only the ships still afloat', () => {
    // A two-ship sank at (0,0)-(1,0): its hits are not open, so the bot does not chase them.
    const shots = [
      { x: 0, y: 0, hit: true, sunk: null },
      { x: 1, y: 0, hit: true, sunk: { x: 0, y: 0, vertical: false, size: 2 } },
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const [x, y] = botTarget(shots, 6, [2, 5], createRandom(seed));
      expect([x, y]).not.toEqual([2, 0]);
      expect([x, y]).not.toEqual([0, 1]);
      expect([x, y]).not.toEqual([1, 1]);
    }
  });

  it('sinks a classic fleet in fewer shots than a checkerboard hunter would', () => {
    const { grid, ships } = FLEETS.classic;
    const games = 40;
    let total = 0;
    for (let seed = 1; seed <= games; seed++) {
      const fleet = randomFleet(createRandom(seed * 7 + 1), ships, grid);
      const random = createRandom(seed);
      const shots: Shot[] = [];
      while (shots.filter((shot) => shot.sunk).length < ships.length) {
        const [x, y] = botTarget(shots, grid, ships, random);
        expect(shots.some((shot) => shot.x === x && shot.y === y)).toBe(false);
        shots.push(shotAt(fleet, ships, shots, x, y));
      }
      total += shots.length;
    }
    // The checkerboard-and-neighbours bot this replaced averaged ~52 shots.
    expect(total / games).toBeLessThan(48);
  });
});
