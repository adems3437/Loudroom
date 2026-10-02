import type { ContentImporter } from '@loudroom/game-sdk';

const ITEMS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Sorting rows: question, items 1–8 in their correct order, optional end labels. */
export const sortingImporter: ContentImporter = {
  columns: [
    { key: 'soru', required: true, example: 'Gezegenleri Güneş’e yakından uzağa sırala.' },
    ...ITEMS.map((n) => ({
      key: `oge${n}`,
      required: n <= 3,
      example: ['Merkür', 'Venüs', 'Dünya', 'Mars', '', '', '', ''][n - 1] ?? '',
    })),
    { key: 'ilk_etiket', required: false, example: 'En yakın' },
    { key: 'son_etiket', required: false, example: 'En uzak' },
  ],
  toContent(row) {
    const items = ITEMS.flatMap((n) => {
      const text = row.get(`oge${n}`);
      return text ? [{ id: `s${n}`, text }] : [];
    });
    const first = row.get('ilk_etiket');
    const last = row.get('son_etiket');
    return {
      question: row.get('soru'),
      items,
      ...(first || last ? { labels: { first, last } } : {}),
    };
  },
  columnFor(path, content) {
    const [field, index] = path;
    if (field === 'question') return 'soru';
    if (field === 'labels') return index === 'last' ? 'son_etiket' : 'ilk_etiket';
    if (field === 'items') {
      const items = (content as { items?: { id: string }[] }).items ?? [];
      const id = typeof index === 'number' ? items[index]?.id : undefined;
      return id ? `oge${id.slice(1)}` : 'oge1';
    }
    return null;
  },
};
