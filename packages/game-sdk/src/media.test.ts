import { describe, expect, it } from 'vitest';
import {
  collectMediaIds,
  collectMediaRefs,
  mediaFormatOf,
  mediaMimeType,
  mediaUrl,
} from './media.js';

describe('media references', () => {
  it('collects every mediaId field at any depth, once', () => {
    const content = {
      question: 'Hangisi?',
      media: { type: 'image', mediaId: 'a' },
      options: [
        { id: '1', text: 'x', mediaId: 'b' },
        { id: '2', text: 'y' },
        { id: '3', text: 'z', mediaId: 'a' },
      ],
    };
    expect(collectMediaIds(content).sort()).toEqual(['a', 'b']);
    expect(collectMediaIds(null)).toEqual([]);
    expect(collectMediaIds({ mediaId: 42 })).toEqual([]);
  });

  it('tells videos from images by the type next to the id', () => {
    const content = {
      media: { type: 'video', mediaId: 'v' },
      options: [{ id: '1', mediaId: 'i' }],
      cover: { type: 'image', mediaId: 'v' },
    };
    expect(collectMediaRefs(content)).toEqual([
      { mediaId: 'v', kind: 'video' },
      { mediaId: 'i', kind: 'image' },
      { mediaId: 'v', kind: 'image' },
    ]);
    expect(collectMediaIds(content).sort()).toEqual(['i', 'v']);
  });

  it('builds the public URL from the id and the stored format', () => {
    expect(mediaUrl('0f6e')).toBe('/media/0f6e.webp');
    expect(mediaUrl('0f6e', 'mp4')).toBe('/media/0f6e.mp4');
    expect(mediaFormatOf('video/webm')).toBe('webm');
    expect(mediaFormatOf('image/webp')).toBe('webp');
    expect(mediaMimeType('mp4')).toBe('video/mp4');
  });
});
