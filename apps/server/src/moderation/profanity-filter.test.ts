import { describe, expect, it } from 'vitest';
import { ProfanityFilter } from './profanity-filter.js';
import { ENGLISH_WORDS, TURKISH_WORDS } from './wordlists.js';

const filter = new ProfanityFilter([...TURKISH_WORDS, ...ENGLISH_WORDS]);

describe('ProfanityFilter', () => {
  it.each([
    'siktir',
    'SİKTİR',
    'S1kt1r',
    's i k t i r',
    'siiiiktir',
    'Orospu',
    'oro$pu',
    'kahpe123',
    'FUCK',
    'fuuuck you',
    'f.u.c.k',
    'Sh1t',
    'amk',
    'AMK!',
    'aq',
    'göt',
    'piç',
    'şerefsiz',
    'SEREFSIZ',
  ])('blocks %j', (text) => {
    expect(filter.isProfane(text)).toBe(true);
  });

  it.each([
    'Amina',
    'Samina',
    'Kısık',
    'Ayşe',
    'Mehmet',
    'Picasso',
    'Gotham',
    'Dickens',
    'Hancock',
    'grape',
    'Sıkı Fan',
    'Ali Veli',
    'Classic',
    'Scunthorpe',
  ])('allows %j', (text) => {
    expect(filter.isProfane(text)).toBe(false);
  });

  it('takes extra words, including whole-word-only entries', () => {
    const custom = new ProfanityFilter(['zıkkım', '=bok']);
    expect(custom.isProfane('ZIKKIMLAR')).toBe(true);
    expect(custom.isProfane('bok')).toBe(true);
    expect(custom.isProfane('Bokser')).toBe(false);
  });
});
