import { foldText, type ContentImporter } from '@loudroom/game-sdk';

/** Reaction rows: the title and the kind (klasik / tuzaklı). */
export const reactionImporter: ContentImporter = {
  columns: [
    { key: 'baslik', required: true, example: 'Klasik' },
    { key: 'tur', required: false, example: 'klasik' },
  ],
  toContent(row) {
    const kind = foldText(row.get('tur'));
    return {
      title: row.get('baslik'),
      variant: kind.startsWith('tuzak')
        ? 'goNoGo'
        : kind === '' || kind === 'klasik'
          ? 'classic'
          : kind,
    };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : path[0] === 'variant' ? 'tur' : null;
  },
};
