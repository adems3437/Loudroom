export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A point on an image, 0..1 across its natural width and height. */
export interface ImagePoint {
  x: number;
  y: number;
}

/**
 * Where an image drawn with `object-fit: contain` (centered) actually is inside its box: the
 * empty bands left and right, or above and below, are not part of the image (SPEC §7.4).
 */
export function containedRect(natural: Size, box: Size): Rect {
  if (natural.width <= 0 || natural.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}

/**
 * The image point under a position in the box (same units as the box), or null on the empty
 * bands around the image.
 */
export function toImagePoint(position: { x: number; y: number }, image: Rect): ImagePoint | null {
  if (image.width <= 0 || image.height <= 0) return null;
  const x = (position.x - image.left) / image.width;
  const y = (position.y - image.top) / image.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** The position in the box of an image point. */
export function fromImagePoint(point: ImagePoint, image: Rect): { x: number; y: number } {
  return { x: image.left + point.x * image.width, y: image.top + point.y * image.height };
}
