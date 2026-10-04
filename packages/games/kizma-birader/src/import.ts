import type { ContentImporter } from '@loudroom/game-sdk';

/** Kızma Birader rows: only the match's name (the rules are round settings). */
export const kizmaImporter: ContentImporter = {
  columns: [{ key: 'baslik', required: true, example: 'Kızma Birader' }],
  toContent(row) {
    return { title: row.get('baslik') };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : null;
  },
};
