import { z } from 'zod';

/** Uploaded media are served under this path on the web origin (proxied to the server). */
export const MEDIA_URL_PREFIX = '/media';

/** Every stored image is re-encoded to WebP, so a media id alone names its file. */
export function mediaFileName(mediaId: string): string {
  return `${mediaId}.webp`;
}

export function mediaUrl(mediaId: string): string {
  return `${MEDIA_URL_PREFIX}/${mediaFileName(mediaId)}`;
}

/** A reference from game content to an uploaded media file (Media.id). */
export const mediaIdSchema = z.uuid();

/**
 * Media ids a piece of content refers to. Convention for every game's content schema: a media
 * reference is a string field named `mediaId`, at any depth. The server uses this to check that
 * referenced files exist and to keep files in use from being deleted.
 */
export function collectMediaIds(content: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'mediaId' && typeof child === 'string') found.add(child);
        else visit(child);
      }
    }
  };
  visit(content);
  return [...found];
}
