import type { MediaInfo } from '@loudroom/game-sdk';

type ImageSize = Pick<MediaInfo, 'width' | 'height'>;
import type { ImagePointValue } from './schema.js';

/**
 * Distance between two image points as a share of the image's longer side, measured in pixels
 * so a wide image does not stretch distances across (SPEC §7.4: aspect-corrected).
 */
export function imageDistance(a: ImagePointValue, b: ImagePointValue, size: ImageSize): number {
  const longer = Math.max(size.width, size.height);
  if (longer <= 0) return Math.hypot(a.x - b.x, a.y - b.y);
  return Math.hypot((a.x - b.x) * size.width, (a.y - b.y) * size.height) / longer;
}

/**
 * Share of the base score: all of it within `fullRadius`, nothing from `zeroDistance` on, and a
 * smooth (smoothstep) slope in between — gentle near both ends.
 */
export function locationShare(distance: number, fullRadius: number, zeroDistance: number): number {
  if (distance <= fullRadius) return 1;
  const end = Math.max(zeroDistance, fullRadius + 0.001);
  if (distance >= end) return 0;
  const t = (distance - fullRadius) / (end - fullRadius);
  return 1 - t * t * (3 - 2 * t);
}

export function pointsFor(baseScore: number, share: number, multiplier: number): number {
  return Math.round(Math.round(baseScore * share) * multiplier);
}
