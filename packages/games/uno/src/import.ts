import type { ContentImporter } from '@loudroom/game-sdk';

/** UNO rows: only the match's name (the rules are round settings). */
export const unoImporter: ContentImporter = {
  columns: [{ key: 'baslik', required: true, example: 'Klasik UNO' }],
  toContent(row) {
    return { title: row.get('baslik') };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : null;
  },
};
