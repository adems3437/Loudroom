import { describe, expect, it } from 'vitest';
import { createRandom, seedFromString } from './rng.js';

describe('createRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRandom(7);
    const b = createRandom(7);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it('stays within bounds', () => {
    const random = createRandom(1);
    for (let i = 0; i < 1000; i++) {
      const value = random.int(3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('shuffles without losing or duplicating items', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = createRandom(99).shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled).not.toEqual(items);
    expect(createRandom(99).shuffle(items)).toEqual(shuffled);
  });
});

describe('seedFromString', () => {
  it('is stable and distinguishes inputs', () => {
    expect(seedFromString('round-1')).toBe(seedFromString('round-1'));
    expect(seedFromString('round-1')).not.toBe(seedFromString('round-2'));
  });
});
