import type { ContentImporter } from '@loudroom/game-sdk';

/** Pişti rows: only the match's name (the rules are round settings). */
export const pistiImporter: ContentImporter = {
  columns: [{ key: 'baslik', required: true, example: 'Pişti' }],
  toContent(row) {
    return { title: row.get('baslik') };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : null;
  },
};
