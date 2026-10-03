import type { ContentImporter } from '@loudroom/game-sdk';

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/**
 * Quiz rows: question, options a–f (at least a and b), the right letter, and optionally an
 * image id or a video id from the media library (not both).
 */
export const quizImporter: ContentImporter = {
  columns: [
    { key: 'soru', required: true, example: 'Türkiye’nin başkenti neresidir?' },
    { key: 'a', required: true, example: 'İstanbul' },
    { key: 'b', required: true, example: 'Ankara' },
    { key: 'c', required: false, example: 'İzmir' },
    { key: 'd', required: false, example: 'Bursa' },
    { key: 'e', required: false, example: '' },
    { key: 'f', required: false, example: '' },
    { key: 'dogru', required: true, example: 'b' },
    { key: 'gorsel_id', required: false, example: '' },
    { key: 'video_id', required: false, example: '' },
  ],
  toContent(row) {
    const options = LETTERS.flatMap((id) => (row.get(id) ? [{ id, text: row.get(id) }] : []));
    const image = row.get('gorsel_id');
    const video = row.get('video_id');
    // Both filled in: an extra key the schema refuses, reported on the video column.
    const media = video
      ? { type: 'video', mediaId: video, ...(image ? { alsoImage: image } : {}) }
      : image
        ? { type: 'image', mediaId: image }
        : null;
    return {
      question: row.get('soru'),
      options,
      correctOptionId: row.get('dogru').toLocaleLowerCase('tr'),
      ...(media ? { media } : {}),
    };
  },
  columnFor(path, content) {
    const [field, index] = path;
    if (field === 'question') return 'soru';
    if (field === 'correctOptionId') return 'dogru';
    if (field === 'media') {
      const media = (content as { media?: { type?: string } }).media;
      return media?.type === 'video' ? 'video_id' : 'gorsel_id';
    }
    if (field === 'options') {
      const options = (content as { options?: { id: string }[] }).options ?? [];
      return typeof index === 'number' ? (options[index]?.id ?? 'a') : 'a';
    }
    return null;
  },
};
