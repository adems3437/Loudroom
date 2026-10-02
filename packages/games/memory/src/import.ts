import { splitList, type ContentImporter } from '@loudroom/game-sdk';

/**
 * "🍎 Elma" → emoji and label: anything before the first space that has no letter or digit
 * is the emoji.
 */
function parseItem(text: string, index: number) {
  const [first = '', ...rest] = text.split(/\s+/);
  const hasEmoji = rest.length > 0 && !/[\p{L}\p{N}]/u.test(first);
  return {
    id: `i${index + 1}`,
    label: hasEmoji ? rest.join(' ') : text,
    ...(hasEmoji ? { emoji: first } : {}),
  };
}

/** Memory rows: the set's title and its objects ("🍎 Elma | 🍐 Armut | …"). */
export const memoryImporter: ContentImporter = {
  columns: [
    { key: 'baslik', required: true, example: 'Meyveler' },
    {
      key: 'ogeler',
      required: true,
      example: '🍎 Elma | 🍐 Armut | 🍌 Muz | 🍒 Kiraz | 🍇 Üzüm | 🍉 Karpuz | 🍓 Çilek | 🍋 Limon',
    },
  ],
  toContent(row) {
    return { title: row.get('baslik'), items: splitList(row.get('ogeler')).map(parseItem) };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : path[0] === 'items' ? 'ogeler' : null;
  },
};
