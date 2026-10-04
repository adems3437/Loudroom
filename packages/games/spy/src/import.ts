import { splitList, type ContentImporter } from '@loudroom/game-sdk';

/**
 * "🏥 Hastane" → emoji and name: anything before the first space that has no letter or digit
 * is the emoji (as in Memory sets).
 */
function parseLocation(text: string, index: number) {
  const [first = '', ...rest] = text.split(/\s+/);
  const hasEmoji = rest.length > 0 && !/[\p{L}\p{N}]/u.test(first);
  return {
    id: `l${index + 1}`,
    name: hasEmoji ? rest.join(' ') : text,
    ...(hasEmoji ? { emoji: first } : {}),
  };
}

/** "Casus Kim?" rows: the set's title and its places ("🏥 Hastane | 🏫 Okul | …"). */
export const spyImporter: ContentImporter = {
  columns: [
    { key: 'baslik', required: true, example: 'Şehir' },
    {
      key: 'mekanlar',
      required: true,
      example:
        '🏥 Hastane | 🏫 Okul | ✈️ Havalimanı | 🍽️ Restoran | 🎬 Sinema | 🏖️ Plaj | 🛒 Market | 🏦 Banka',
    },
  ],
  toContent(row) {
    return {
      title: row.get('baslik'),
      locations: splitList(row.get('mekanlar')).map(parseLocation),
    };
  },
  columnFor(path) {
    return path[0] === 'title' ? 'baslik' : path[0] === 'locations' ? 'mekanlar' : null;
  },
};
