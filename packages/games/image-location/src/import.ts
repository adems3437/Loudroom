import { parseLocaleNumber, type ContentImporter } from '@loudroom/game-sdk';

/** Percent of the image (0–100) to 0..1. */
function fraction(text: string): number | string {
  const value = parseLocaleNumber(text);
  return value === null ? text : value / 100;
}

/** Image Location rows: question, uploaded image id, target x/y and radius in percent. */
export const imageLocationImporter: ContentImporter = {
  columns: [
    { key: 'soru', required: true, example: 'Ankara nerede?' },
    { key: 'gorsel_id', required: true, example: '' },
    { key: 'x', required: true, example: '38,5' },
    { key: 'y', required: true, example: '42' },
    { key: 'yaricap', required: false, example: '' },
  ],
  toContent(row) {
    const radius = row.get('yaricap');
    return {
      question: row.get('soru'),
      mediaId: row.get('gorsel_id'),
      target: { x: fraction(row.get('x')), y: fraction(row.get('y')) },
      ...(radius ? { radius: fraction(radius) } : {}),
    };
  },
  columnFor(path) {
    const [field, key] = path;
    if (field === 'question') return 'soru';
    if (field === 'mediaId') return 'gorsel_id';
    if (field === 'target') return key === 'y' ? 'y' : 'x';
    if (field === 'radius') return 'yaricap';
    return null;
  },
};
