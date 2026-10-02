import { describe, expect, it } from 'vitest';
import { containedRect, fromImagePoint, toImagePoint } from './contained-rect.js';

describe('containedRect', () => {
  it('leaves bands left and right for a tall image in a wide box', () => {
    expect(containedRect({ width: 500, height: 1000 }, { width: 400, height: 200 })).toEqual({
      left: 150,
      top: 0,
      width: 100,
      height: 200,
    });
  });

  it('leaves bands above and below for a wide image in a tall box', () => {
    expect(containedRect({ width: 2000, height: 1000 }, { width: 390, height: 600 })).toEqual({
      left: 0,
      top: 202.5,
      width: 390,
      height: 195,
    });
  });

  it('is empty before anything has a size', () => {
    expect(containedRect({ width: 0, height: 0 }, { width: 10, height: 10 }).width).toBe(0);
  });
});

describe('image points', () => {
  const image = containedRect({ width: 2000, height: 1000 }, { width: 390, height: 600 });

  it('maps a tap to 0..1 image coordinates and back', () => {
    const point = toImagePoint({ x: 97.5, y: 251.25 }, image);
    expect(point).toEqual({ x: 0.25, y: 0.25 });
    expect(fromImagePoint({ x: 0.25, y: 0.25 }, image)).toEqual({ x: 97.5, y: 251.25 });
  });

  it('ignores taps on the empty bands', () => {
    expect(toImagePoint({ x: 100, y: 100 }, image)).toBeNull();
    expect(toImagePoint({ x: 100, y: 500 }, image)).toBeNull();
    expect(toImagePoint({ x: 0, y: 202.5 }, image)).toEqual({ x: 0, y: 0 });
  });
});
