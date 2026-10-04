import type { ContentImporter } from '@loudroom/game-sdk';

/** Tombala rows: only the game's name (the rules are round settings). */
export const tombalaImporter: ContentImporter = {
  columns: [{ key: 'baslik', required: true, example: 'Klasik Tombala' }],
  toContent(row) {
    return { title: row.get('baslik') };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : null;
  },
};
