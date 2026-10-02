import { foldText, parseLocaleNumber, type ContentImporter } from '@loudroom/game-sdk';

/** Closest Number rows: question, answer (Turkish number), unit, format (sayı / yıl). */
export const closestNumberImporter: ContentImporter = {
  columns: [
    { key: 'soru', required: true, example: 'Everest Dağı kaç metredir?' },
    { key: 'cevap', required: true, example: '8.849' },
    { key: 'birim', required: false, example: 'm' },
    { key: 'bicim', required: false, example: 'sayı' },
  ],
  toContent(row) {
    const unit = row.get('birim');
    return {
      question: row.get('soru'),
      answer: parseLocaleNumber(row.get('cevap')) ?? row.get('cevap'),
      ...(unit ? { unit } : {}),
      displayFormat: foldText(row.get('bicim')) === 'yil' ? 'year' : 'number',
    };
  },
  columnFor(path) {
    const field = path[0];
    if (field === 'question') return 'soru';
    if (field === 'answer') return 'cevap';
    if (field === 'unit') return 'birim';
    if (field === 'displayFormat') return 'bicim';
    return null;
  },
};
