/**
 * Okey tiles (SPEC §7.12): 4 colours × 1–13, two of each, and two fake okeys — 106 in all.
 * Ids 0–103 are the numbered tiles (colour-major), 104 and 105 the fake okeys. Everything here
 * is pure: the server judges hands with it and the phone arranges its rack with it.
 */

export const OKEY_COLORS = ['red', 'yellow', 'blue', 'black'] as const;
export type OkeyColor = (typeof OKEY_COLORS)[number];

export const TILE_COUNT = 106;
export const FAKE_OKEYS = [104, 105] as const;

/** A tile's printed face. */
export interface Face {
  color: OkeyColor;
  number: number;
}

export type Tile = { id: number; fake: false; color: OkeyColor; number: number } | FakeTile;
interface FakeTile {
  id: number;
  fake: true;
  color: null;
  number: null;
}

export function tileOf(id: number): Tile {
  if (id >= 104) return { id, fake: true, color: null, number: null };
  const color = OKEY_COLORS[Math.floor(id / 26)] ?? 'red';
  return { id, fake: false, color, number: (id % 13) + 1 };
}

export const ALL_TILES: readonly number[] = Array.from({ length: TILE_COUNT }, (_, id) => id);

/** The okey: the indicator's colour, one number higher (13 wraps to 1). */
export function okeyOf(indicator: Face): Face {
  return { color: indicator.color, number: (indicator.number % 13) + 1 };
}

export const sameFace = (a: Face, b: Face) => a.color === b.color && a.number === b.number;

/** The okey tiles themselves are wild (null); a fake okey counts as the okey's face. */
export function valueOf(id: number, okey: Face): Face | null {
  const tile = tileOf(id);
  if (tile.fake) return okey;
  if (sameFace(tile, okey)) return null;
  return tile;
}

export const isWild = (id: number, okey: Face) => valueOf(id, okey) === null;

/** A finishing hand split into groups (tile ids in the order they read on a rack). */
export interface Finish {
  kind: 'sets' | 'pairs';
  groups: number[][];
}

const faceIndex = (face: Face) => OKEY_COLORS.indexOf(face.color) * 13 + face.number - 1;

interface Pool {
  /** Tile ids per face index (colour × 13 + number − 1). */
  byFace: number[][];
  jokers: number[];
}

function poolOf(ids: readonly number[], okey: Face): Pool {
  const byFace: number[][] = Array.from({ length: 52 }, () => []);
  const jokers: number[] = [];
  for (const id of ids) {
    const value = valueOf(id, okey);
    if (value) byFace[faceIndex(value)]?.push(id);
    else jokers.push(id);
  }
  return { byFace, jokers };
}

/** Seven pairs: two tiles of one face each; a wild tile pairs with anything. */
function findPairs(pool: Pool): number[][] | null {
  const groups: number[][] = [];
  const singles: number[] = [];
  for (const ids of pool.byFace) {
    for (let i = 0; i + 1 < ids.length; i += 2) groups.push([ids[i] ?? 0, ids[i + 1] ?? 0]);
    if (ids.length % 2 === 1) singles.push(ids.at(-1) ?? 0);
  }
  const jokers = [...pool.jokers];
  if (singles.length > jokers.length) return null;
  for (const single of singles) groups.push([single, jokers.pop() ?? 0]);
  if (jokers.length % 2 === 1) return null;
  for (let i = 0; i < jokers.length; i += 2) groups.push([jokers[i] ?? 0, jokers[i + 1] ?? 0]);
  return groups.length === 7 ? groups : null;
}

/**
 * Splits the pool into sets (one number, 3–4 different colours) and runs (one colour, 3+ in a
 * row; 12-13-1 counts, 13-1-2 does not), wild tiles filling any gap. Takes the first tile left
 * (colour-major, lowest number) and tries every group it could belong to: every lower tile of
 * its colour is already placed, so in a run only wild tiles can sit below it.
 */
function findSets(pool: Pool): number[][] | null {
  const first = pool.byFace.findIndex((ids) => ids.length > 0);
  if (first === -1) return pool.jokers.length === 0 ? [] : null;
  const color = Math.floor(first / 13);
  const number = (first % 13) + 1;
  const tile = pool.byFace[first]?.pop() ?? 0;
  const result =
    trySets(pool, tile, color, number) ??
    tryRunsUp(pool, tile, color, number) ??
    (number === 1 ? tryRunsEndingInOne(pool, tile, color) : null);
  pool.byFace[first]?.push(tile);
  return result;
}

/** Takes a tile of `face` or a wild one, trying both; `then` sees the pool without it. */
function takeEither(
  pool: Pool,
  face: number,
  then: (id: number) => number[][] | null,
): number[][] | null {
  const real = pool.byFace[face];
  const id = real?.pop();
  if (id !== undefined) {
    const found = then(id);
    real?.push(id);
    if (found) return found;
  }
  const joker = pool.jokers.pop();
  if (joker !== undefined) {
    const found = then(joker);
    pool.jokers.push(joker);
    if (found) return found;
  }
  return null;
}

function trySets(pool: Pool, tile: number, color: number, number: number): number[][] | null {
  const others = [0, 1, 2, 3].filter((c) => c !== color);
  const pick = (index: number, group: number[]): number[][] | null => {
    if (index === others.length) {
      if (group.length < 3) return null;
      const rest = findSets(pool);
      return rest ? [group, ...rest] : null;
    }
    const other = others[index] ?? 0;
    return (
      takeEither(pool, other * 13 + number - 1, (id) => pick(index + 1, [...group, id])) ??
      pick(index + 1, group)
    );
  };
  return pick(0, [tile]);
}

function tryRunsUp(pool: Pool, tile: number, color: number, number: number): number[][] | null {
  // Wild tiles below the first one (all lower tiles of its colour are placed already).
  for (let below = 0; below <= Math.min(pool.jokers.length, number - 1); below++) {
    const jokers = pool.jokers.splice(pool.jokers.length - below, below);
    const found = extendRun(pool, color, number, [...jokers, tile]);
    pool.jokers.push(...jokers);
    if (found) return found;
  }
  return null;
}

/** Grows a run upward from `top`; 14 stands for the 1 after 13. Stops anywhere from 3 tiles. */
function extendRun(pool: Pool, color: number, top: number, run: number[]): number[][] | null {
  if (run.length >= 3) {
    const rest = findSets(pool);
    if (rest) return [run, ...rest];
  }
  const next = top + 1;
  if (next > 14) return null;
  const face = color * 13 + (next === 14 ? 0 : next - 1);
  return takeEither(pool, face, (id) => extendRun(pool, color, next, [...run, id]));
}

/** Runs that end with the first tile as the 1 after 13 (…12-13-1). */
function tryRunsEndingInOne(pool: Pool, tile: number, color: number): number[][] | null {
  for (let start = 12; start >= 2; start--) {
    const fill = (position: number, run: number[]): number[][] | null => {
      if (position > 13) {
        const rest = findSets(pool);
        return rest ? [[...run, tile], ...rest] : null;
      }
      return takeEither(pool, color * 13 + position - 1, (id) => fill(position + 1, [...run, id]));
    };
    const found = fill(start, []);
    if (found) return found;
  }
  return null;
}

/**
 * How 14 tiles finish, or null: seven pairs (preferred, worth double) or sets and runs. The
 * search ignores how the player laid out the rack.
 */
export function findFinish(ids: readonly number[], okey: Face): Finish | null {
  if (ids.length !== 14) return null;
  const pairs = findPairs(poolOf(ids, okey));
  if (pairs) return { kind: 'pairs', groups: pairs };
  const sets = findSets(poolOf(ids, okey));
  return sets ? { kind: 'sets', groups: sets } : null;
}

/** Distance between two numbers along a run, with 1 also following 13. */
function gap(a: number, b: number): number {
  const plain = Math.abs(a - b);
  return Math.min(
    plain,
    a === 1 || b === 1 ? Math.abs((a === 1 ? 14 : a) - (b === 1 ? 14 : b)) : 99,
  );
}

/**
 * How much a tile helps the rest of the rack (bots keep the useful ones): wild tiles always;
 * otherwise neighbours of its colour and its number in other colours.
 */
export function tileWorth(id: number, rack: readonly number[], okey: Face): number {
  const value = valueOf(id, okey);
  if (!value) return 100;
  let worth = 0;
  for (const other of rack) {
    if (other === id) continue;
    const face = valueOf(other, okey);
    if (!face) continue;
    if (face.color === value.color) {
      const distance = gap(face.number, value.number);
      if (distance === 0) worth += 1;
      else if (distance === 1) worth += 3;
      else if (distance === 2) worth += 1;
    } else if (face.number === value.number) {
      worth += 3;
    }
  }
  return worth;
}

/**
 * Whether a tile completes a group with two tiles of the rack: a set (its number in two other
 * colours) or a run of three (12-13-1 included). Wild tiles in the rack do not count.
 */
export function completesGroup(id: number, rack: readonly number[], okey: Face): boolean {
  const value = valueOf(id, okey);
  if (!value) return false;
  const faces = rack.filter((other) => other !== id).map((other) => valueOf(other, okey));
  const has = (color: OkeyColor, number: number) =>
    faces.some((face) => face?.color === color && face.number === (number === 14 ? 1 : number));
  const colors = OKEY_COLORS.filter((color) => color !== value.color && has(color, value.number));
  if (colors.length >= 2) return true;
  // Runs of three around it; position 14 is the 1 after 13 (12-13-1).
  const positions = value.number === 1 ? [1, 14] : [value.number];
  return positions.some((position) => {
    for (let start = Math.max(1, position - 2); start <= Math.min(position, 12); start++) {
      const others = [start, start + 1, start + 2].filter((q) => q !== position);
      if (others.every((q) => has(value.color, q))) return true;
    }
    return false;
  });
}

export const RACK_SLOTS = 30;
export const RACK_ROW = 15;

/** Lays groups out on the two rack rows, a gap between groups; leftovers fill in after. */
function layOut(groups: readonly (readonly number[])[]): (number | null)[] {
  const slots: (number | null)[] = Array.from({ length: RACK_SLOTS }, () => null);
  let at = 0;
  for (const group of groups) {
    const rowEnd = (Math.floor(at / RACK_ROW) + 1) * RACK_ROW;
    if (at + group.length > rowEnd && group.length <= RACK_ROW) at = rowEnd;
    for (const id of group) {
      if (at >= RACK_SLOTS) break;
      slots[at++] = id;
    }
    if (at % RACK_ROW !== 0) at++;
  }
  const placed = new Set(slots);
  const missing = groups.flat().filter((id) => !placed.has(id));
  // Too many gaps: pack the rest into the free slots.
  for (const id of missing) {
    const free = slots.indexOf(null);
    if (free === -1) break;
    slots[free] = id;
  }
  return slots;
}

function byFaceOrder(okey: Face) {
  return (a: number, b: number) => {
    const fa = valueOf(a, okey);
    const fb = valueOf(b, okey);
    if (!fa || !fb) return Number(!fa) - Number(!fb) || a - b;
    return faceIndex(fa) - faceIndex(fb) || a - b;
  };
}

/** "Seri diz": runs of each colour, then sets of one number, then the rest; wild tiles last. */
export function arrangeRuns(ids: readonly number[], okey: Face): (number | null)[] {
  const sorted = [...ids].sort(byFaceOrder(okey));
  const wild = sorted.filter((id) => isWild(id, okey));
  let rest = sorted.filter((id) => !isWild(id, okey));
  const groups: number[][] = [];

  for (const color of OKEY_COLORS) {
    let run: number[] = [];
    let last = 0;
    const flush = () => {
      if (run.length >= 3) groups.push(run);
      run = [];
    };
    for (const id of rest.filter((tile) => valueOf(tile, okey)?.color === color)) {
      const number = valueOf(id, okey)?.number ?? 0;
      if (number === last) continue;
      if (number !== last + 1) flush();
      run.push(id);
      last = number;
    }
    flush();
  }
  const inRuns = new Set(groups.flat());
  rest = rest.filter((id) => !inRuns.has(id));

  for (let number = 1; number <= 13; number++) {
    const set: number[] = [];
    for (const color of OKEY_COLORS) {
      const id = rest.find((tile) => {
        const face = valueOf(tile, okey);
        return face?.number === number && face.color === color;
      });
      if (id !== undefined) set.push(id);
    }
    if (set.length >= 3) {
      groups.push(set);
      rest = rest.filter((id) => !set.includes(id));
    }
  }
  return layOut([...groups, rest, wild].filter((group) => group.length > 0));
}

/** "Çift diz": tiles of the same face side by side, then the singles; wild tiles last. */
export function arrangePairs(ids: readonly number[], okey: Face): (number | null)[] {
  const sorted = [...ids].sort(byFaceOrder(okey));
  const wild = sorted.filter((id) => isWild(id, okey));
  const pairs: number[][] = [];
  const singles: number[] = [];
  const normal = sorted.filter((id) => !isWild(id, okey));
  for (let i = 0; i < normal.length; i++) {
    const a = normal[i] ?? 0;
    const b = normal[i + 1];
    const fa = valueOf(a, okey);
    const fb = b === undefined ? null : valueOf(b, okey);
    if (b !== undefined && fa && fb && sameFace(fa, fb)) {
      pairs.push([a, b]);
      i++;
    } else {
      singles.push(a);
    }
  }
  return layOut([...pairs, singles, wild].filter((group) => group.length > 0));
}
