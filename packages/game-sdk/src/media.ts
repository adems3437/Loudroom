import { z } from 'zod';

/** Uploaded media are served under this path on the web origin (proxied to the server). */
export const MEDIA_URL_PREFIX = '/media';

/**
 * How a stored file is encoded. Images are always re-encoded to WebP; videos keep their
 * container (only remuxed), so a video's format travels with its media info.
 */
export type MediaFormat = 'webp' | 'mp4' | 'webm';

const MIME_BY_FORMAT: Record<MediaFormat, string> = {
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function mediaFileName(mediaId: string, format: MediaFormat = 'webp'): string {
  return `${mediaId}.${format}`;
}

export function mediaUrl(mediaId: string, format: MediaFormat = 'webp'): string {
  return `${MEDIA_URL_PREFIX}/${mediaFileName(mediaId, format)}`;
}

export function mediaMimeType(format: MediaFormat): string {
  return MIME_BY_FORMAT[format];
}

/** The stored format for a Media.mimeType (unknown types are treated as images). */
export function mediaFormatOf(mimeType: string): MediaFormat {
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  return 'webp';
}

/** A reference from game content to an uploaded media file (Media.id). */
export const mediaIdSchema = z.uuid();

export type MediaKind = 'image' | 'video';

export interface MediaRef {
  mediaId: string;
  kind: MediaKind;
}

/**
 * Media references in a piece of content. Convention for every game's content schema: a media
 * reference is a string field named `mediaId`, at any depth. Next to a `type` of `'video'` (as
 * in `{ type: 'video', mediaId }`) it must name a video; everywhere else an image. The server
 * uses this to check that referenced files exist with the right kind and to keep files in use
 * from being deleted.
 */
export function collectMediaRefs(content: unknown): MediaRef[] {
  const found = new Map<string, MediaRef>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const [key, child] of Object.entries(record)) {
        if (key === 'mediaId' && typeof child === 'string') {
          const kind: MediaKind = record.type === 'video' ? 'video' : 'image';
          found.set(`${kind}:${child}`, { mediaId: child, kind });
        } else {
          visit(child);
        }
      }
    }
  };
  visit(content);
  return [...found.values()];
}

/** The ids of every media file a piece of content refers to, once each. */
export function collectMediaIds(content: unknown): string[] {
  return [...new Set(collectMediaRefs(content).map((ref) => ref.mediaId))];
}
