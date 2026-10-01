import { describe, expect, it } from 'vitest';
import { collectMediaIds, mediaUrl } from './media.js';

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

  it('builds the public URL from the id alone', () => {
    expect(mediaUrl('0f6e')).toBe('/media/0f6e.webp');
  });
});
