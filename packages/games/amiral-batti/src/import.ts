import type { ContentImporter } from '@loudroom/game-sdk';

/** Amiral Battı rows: only the match's name (the rules are round settings). */
export const amiralImporter: ContentImporter = {
  columns: [{ key: 'baslik', required: true, example: 'Amiral Battı' }],
  toContent(row) {
    return { title: row.get('baslik') };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : null;
  },
};
