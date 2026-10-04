import type { Random } from '@loudroom/game-sdk';
import type { Placement, Shot, SunkShip } from './schema.js';

export type Cell = [number, number];

export function cellsOf(ship: Placement, size: number): Cell[] {
  return Array.from({ length: size }, (_, i): Cell =>
    ship.vertical ? [ship.x, ship.y + i] : [ship.x + i, ship.y],
  );
}

const key = ([x, y]: Cell) => `${x},${y}`;

/** A fleet is valid when every ship lies inside the grid and none overlap (touching is fine). */
export function validFleet(ships: readonly Placement[], sizes: readonly number[], grid: number) {
  if (ships.length !== sizes.length) return false;
  const taken = new Set<string>();
  return ships.every((ship, i) =>
    cellsOf(ship, sizes[i] ?? 0).every(([x, y]) => {
      if (x < 0 || y < 0 || x >= grid || y >= grid || taken.has(key([x, y]))) return false;
      taken.add(key([x, y]));
      return true;
    }),
  );
}

/** A random valid fleet (largest ships first, retrying until each fits). */
export function randomFleet(random: Random, sizes: readonly number[], grid: number): Placement[] {
  for (;;) {
    const ships: Placement[] = [];
    for (const size of sizes) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const vertical = random.next() < 0.5;
        const ship = {
          x: random.int(0, vertical ? grid - 1 : grid - size),
          y: random.int(0, vertical ? grid - size : grid - 1),
          vertical,
        };
        if (validFleet([...ships, ship], sizes.slice(0, ships.length + 1), grid)) {
          ships.push(ship);
          break;
        }
      }
    }
    if (ships.length === sizes.length) return ships;
  }
}

/** The result of a shot at a fleet, given the shots fired at it before. */
export function shotAt(
  ships: readonly Placement[],
  sizes: readonly number[],
  before: readonly Shot[],
  x: number,
  y: number,
): Shot {
  const index = ships.findIndex((ship, i) =>
    cellsOf(ship, sizes[i] ?? 0).some(([cx, cy]) => cx === x && cy === y),
  );
  const ship = ships[index];
  if (!ship) return { x, y, hit: false, sunk: null };
  const size = sizes[index] ?? 0;
  const hits = new Set([...before.filter((s) => s.hit).map((s) => key([s.x, s.y])), key([x, y])]);
  const sunk = cellsOf(ship, size).every((cell) => hits.has(key(cell)));
  return { x, y, hit: true, sunk: sunk ? ({ ...ship, size } satisfies SunkShip) : null };
}

/**
 * A bot's shot: next to hits of a ship not yet sunk (along the line when two are known),
 * otherwise a random cell on a checkerboard (every ship covers one of them).
 */
export function botTarget(shots: readonly Shot[], grid: number, random: Random): Cell {
  const shot = new Set(shots.map((s) => key([s.x, s.y])));
  const sunkCells = new Set(
    shots.flatMap((s) => (s.sunk ? cellsOf(s.sunk, s.sunk.size).map(key) : [])),
  );
  const open = shots.filter((s) => s.hit && !sunkCells.has(key([s.x, s.y])));
  const free = ([x, y]: Cell) => x >= 0 && y >= 0 && x < grid && y < grid && !shot.has(key([x, y]));
  const around = (cells: readonly Shot[]): Cell[] => {
    const horizontal = cells.length > 1 && cells.every((c) => c.y === cells[0]?.y);
    const vertical = cells.length > 1 && cells.every((c) => c.x === cells[0]?.x);
    return cells.flatMap(({ x, y }): Cell[] => [
      ...(vertical
        ? []
        : ([
            [x - 1, y],
            [x + 1, y],
          ] as Cell[])),
      ...(horizontal
        ? []
        : ([
            [x, y - 1],
            [x, y + 1],
          ] as Cell[])),
    ]);
  };
  const near = around(open).filter(free);
  const aimed = near[random.int(0, near.length - 1)];
  if (aimed) return aimed;
  const all = Array.from({ length: grid * grid }, (_, i): Cell => [i % grid, Math.floor(i / grid)]);
  const checker = all.filter((cell) => free(cell) && (cell[0] + cell[1]) % 2 === 0);
  const pool = checker.length > 0 ? checker : all.filter(free);
  return pool[random.int(0, pool.length - 1)] ?? [0, 0];
}
