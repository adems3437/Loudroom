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
 * A bot's shot, from what every player can see: the fleet's ship sizes and the shots fired.
 * It counts, for each free cell, the ways a ship not yet sunk could lie across it (never over a
 * miss or a sunk ship) and fires at the likeliest. While a hit belongs to no sunk ship, only
 * ships through those hits count, so it finishes that ship along its line.
 */
export function botTarget(
  shots: readonly Shot[],
  grid: number,
  sizes: readonly number[],
  random: Random,
): Cell {
  const shot = new Set(shots.map((s) => key([s.x, s.y])));
  const sunkCells = new Set(
    shots.flatMap((s) => (s.sunk ? cellsOf(s.sunk, s.sunk.size).map(key) : [])),
  );
  const blocked = new Set([
    ...shots.filter((s) => !s.hit).map((s) => key([s.x, s.y])),
    ...sunkCells,
  ]);
  const open = new Set(
    shots.filter((s) => s.hit && !sunkCells.has(key([s.x, s.y]))).map((s) => key([s.x, s.y])),
  );
  const afloat = [...sizes];
  for (const s of shots) {
    const index = s.sunk ? afloat.indexOf(s.sunk.size) : -1;
    if (index !== -1) afloat.splice(index, 1);
  }

  const score = (target: boolean) => {
    const counts = new Map<string, number>();
    for (const size of afloat) {
      for (const vertical of [false, true]) {
        for (let y = 0; y < (vertical ? grid - size + 1 : grid); y++) {
          for (let x = 0; x < (vertical ? grid : grid - size + 1); x++) {
            const cells = cellsOf({ x, y, vertical }, size).map(key);
            if (cells.some((cell) => blocked.has(cell))) continue;
            const through = cells.filter((cell) => open.has(cell)).length;
            if (target && through === 0) continue;
            for (const cell of cells) {
              if (!shot.has(cell))
                counts.set(cell, (counts.get(cell) ?? 0) + (target ? through : 1));
            }
          }
        }
      }
    }
    return counts;
  };
  let counts = open.size > 0 ? score(true) : new Map<string, number>();
  if (counts.size === 0) counts = score(false);

  const best = Math.max(0, ...counts.values());
  const top = [...counts].filter(([, count]) => count === best).map(([cell]) => cell);
  const free = Array.from({ length: grid * grid }, (_, i) => `${i % grid},${Math.floor(i / grid)}`);
  const pool = top.length > 0 ? top : free.filter((cell) => !shot.has(cell));
  const [x = 0, y = 0] = (pool[random.int(0, pool.length - 1)] ?? '0,0').split(',').map(Number);
  return [x, y];
}
