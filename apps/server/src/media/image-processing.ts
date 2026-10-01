import sharp from 'sharp';

/** Formats accepted for upload, as detected from the file's bytes (never its name or MIME). */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

/** Refuses decompression bombs before decoding: a 40-megapixel image is plenty. */
const MAX_INPUT_PIXELS = 40_000_000;

/** Long side of stored images; enough for a 1080p screen with room to spare. */
const MAX_DIMENSION = 2560;

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
}

export class UnsupportedImageError extends Error {}

/**
 * Sniffs the real format, then re-encodes to WebP (SPEC §9). Re-encoding drops every piece of
 * metadata — EXIF (GPS, camera), ICC, XMP — and anything hidden after the image data; the
 * EXIF orientation is applied to the pixels first so photos stay upright. Animated GIFs keep
 * their first frame.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string;
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    format = metadata.format;
  } catch {
    throw new UnsupportedImageError('Not a readable image');
  }
  if (!ACCEPTED_FORMATS.has(format)) {
    throw new UnsupportedImageError(`Unsupported image format: ${format}`);
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new UnsupportedImageError('The image could not be decoded');
  }
}
