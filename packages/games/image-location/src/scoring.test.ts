import { describe, expect, it } from 'vitest';
import { imageDistance, locationShare, pointsFor } from './scoring.js';

describe('imageDistance', () => {
  it('measures in pixels against the longer side', () => {
    const wide = { width: 2000, height: 1000 };
    // Half the width = 1000 px = half the longer side.
    expect(imageDistance({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, wide)).toBeCloseTo(0.5);
    // Half the height = 500 px = a quarter of the longer side.
    expect(imageDistance({ x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, wide)).toBeCloseTo(0.25);
    expect(
      imageDistance({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, { width: 100, height: 100 }),
    ).toBeCloseTo(0.5);
  });
});

describe('locationShare', () => {
  it('is full within the radius, zero from the far distance, smooth between', () => {
    expect(locationShare(0, 0.03, 0.3)).toBe(1);
    expect(locationShare(0.03, 0.03, 0.3)).toBe(1);
    expect(locationShare(0.165, 0.03, 0.3)).toBeCloseTo(0.5);
    expect(locationShare(0.3, 0.03, 0.3)).toBe(0);
    expect(locationShare(0.9, 0.03, 0.3)).toBe(0);
    const near = 1 - locationShare(0.04, 0.03, 0.3);
    const middle = locationShare(0.15, 0.03, 0.3) - locationShare(0.16, 0.03, 0.3);
    expect(near).toBeLessThan(middle);
  });

  it('copes with a radius beyond the zero distance', () => {
    expect(locationShare(0.2, 0.25, 0.1)).toBe(1);
    expect(locationShare(0.3, 0.25, 0.1)).toBe(0);
  });
});

describe('pointsFor', () => {
  it('rounds to whole points and applies the multiplier', () => {
    expect(pointsFor(1000, 0.4999, 2)).toBe(1000);
  });
});
