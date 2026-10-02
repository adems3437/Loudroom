import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { sortingModule } from './server.js';

describe('sorting import', () => {
  it('reads items in order and the end labels', () => {
    expect(
      importThrough(sortingModule, {
        soru: 'Sırala',
        oge1: 'Bir',
        oge2: 'İki',
        oge3: 'Üç',
        ilk_etiket: 'Az',
        son_etiket: 'Çok',
      }),
    ).toEqual({
      ok: true,
      content: {
        question: 'Sırala',
        items: [
          { id: 's1', text: 'Bir' },
          { id: 's2', text: 'İki' },
          { id: 's3', text: 'Üç' },
        ],
        labels: { first: 'Az', last: 'Çok' },
      },
    });
  });

  it('needs three items and both labels', () => {
    expect(importThrough(sortingModule, { soru: 'S', oge1: 'a', oge2: 'b' })).toEqual({
      ok: false,
      columns: ['oge1'],
    });
    expect(
      importThrough(sortingModule, { soru: 'S', oge1: 'a', oge2: 'b', oge3: 'c', ilk_etiket: 'x' }),
    ).toEqual({ ok: false, columns: ['son_etiket'] });
  });
});
