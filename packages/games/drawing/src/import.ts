import { splitList, type ContentImporter } from '@loudroom/game-sdk';

/** Drawing rows: the word and other accepted spellings (`|`-separated). */
export const drawingImporter: ContentImporter = {
  columns: [
    { key: 'kelime', required: true, example: 'Buzdolabı' },
    { key: 'alternatifler', required: false, example: 'Buz dolabı' },
  ],
  toContent(row) {
    const alternatives = splitList(row.get('alternatifler'));
    return { word: row.get('kelime'), ...(alternatives.length > 0 ? { alternatives } : {}) };
  },
  columnFor(path) {
    return path[0] === 'word' ? 'kelime' : path[0] === 'alternatives' ? 'alternatifler' : null;
  },
};
