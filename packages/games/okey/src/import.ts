import type { ContentImporter } from '@loudroom/game-sdk';

/** Okey rows: only the match's name (the rules are round settings). */
export const okeyImporter: ContentImporter = {
  columns: [{ key: 'baslik', required: true, example: 'Okey' }],
  toContent(row) {
    return { title: row.get('baslik') };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : null;
  },
};
