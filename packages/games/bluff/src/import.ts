import { splitList, type ContentImporter } from '@loudroom/game-sdk';

/** Bluff rows: question, answer, other spellings and decoys (both `|`-separated). */
export const bluffImporter: ContentImporter = {
  columns: [
    { key: 'soru', required: true, example: 'Bir ahtapotun kaç kalbi vardır?' },
    { key: 'cevap', required: true, example: 'Üç' },
    { key: 'kabul', required: false, example: '3' },
    { key: 'yemler', required: true, example: 'Bir | İki | Dört' },
  ],
  toContent(row) {
    const accepted = splitList(row.get('kabul'));
    return {
      question: row.get('soru'),
      answer: row.get('cevap'),
      ...(accepted.length > 0 ? { acceptedAnswers: accepted } : {}),
      decoys: splitList(row.get('yemler')),
    };
  },
  columnFor(path) {
    const field = path[0];
    if (field === 'question') return 'soru';
    if (field === 'answer') return 'cevap';
    if (field === 'acceptedAnswers') return 'kabul';
    if (field === 'decoys') return 'yemler';
    return null;
  },
};
