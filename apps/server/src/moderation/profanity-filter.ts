/** Leetspeak and Turkish-specific letters folded to plain Latin letters before matching. */
const FOLD: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

const NON_LETTERS = /[^\p{L}]+/gu;
/** Words this long or longer match anywhere inside the text. */
const SUBSTRING_MIN_LENGTH = 4;

function fold(text: string): string {
  let folded = '';
  for (const char of text.toLocaleLowerCase('tr')) folded += FOLD[char] ?? char;
  return folded.normalize('NFD').replace(/\p{M}/gu, '');
}

/** "siiiktir" → "siktir": stretching letters does not get around the list. */
function squeeze(text: string): string {
  return text.replace(/(.)\1+/gu, '$1');
}

export class ProfanityFilter {
  private readonly wholeWords = new Set<string>();
  private readonly fragments = new Set<string>();

  constructor(words: Iterable<string>) {
    for (const entry of words) {
      const wholeWordOnly = entry.startsWith('=');
      const word = squeeze(fold(wholeWordOnly ? entry.slice(1) : entry).replace(NON_LETTERS, ''));
      if (word.length === 0) continue;
      if (wholeWordOnly || word.length < SUBSTRING_MIN_LENGTH) this.wholeWords.add(word);
      else this.fragments.add(word);
    }
  }

  isProfane(text: string): boolean {
    const folded = fold(text);
    const words = folded
      .split(NON_LETTERS)
      .filter((word) => word.length > 0)
      .map(squeeze);
    const compact = squeeze(folded.replace(NON_LETTERS, ''));
    // "a.m.k" or "a m k": the letters spelled apart still form the whole word.
    if (this.wholeWords.has(compact) || words.some((word) => this.wholeWords.has(word))) {
      return true;
    }

    for (const fragment of this.fragments) {
      if (compact.includes(fragment)) return true;
    }
    return false;
  }
}
