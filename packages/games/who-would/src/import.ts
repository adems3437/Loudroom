import type { ContentImporter } from '@loudroom/game-sdk';

/** "Kim Yapar?" rows: the statement and the winner's title. */
export const whoWouldImporter: ContentImporter = {
  columns: [
    { key: 'ifade', required: true, example: 'Kim en çok geç kalır?' },
    { key: 'unvan', required: false, example: 'Geç Kalma Şampiyonu' },
  ],
  toContent(row) {
    const title = row.get('unvan');
    return { question: row.get('ifade'), ...(title ? { title } : {}) };
  },
  columnFor(path) {
    return path[0] === 'question' ? 'ifade' : path[0] === 'title' ? 'unvan' : null;
  },
};
