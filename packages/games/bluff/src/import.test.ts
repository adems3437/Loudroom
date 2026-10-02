import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { bluffModule } from './server.js';

describe('bluff import', () => {
  it('reads lists separated by |', () => {
    expect(
      importThrough(bluffModule, {
        soru: 'Kaç kalp?',
        cevap: 'Üç',
        kabul: '3',
        yemler: 'Bir | İki | Dört',
      }),
    ).toEqual({
      ok: true,
      content: {
        question: 'Kaç kalp?',
        answer: 'Üç',
        acceptedAnswers: ['3'],
        decoys: ['Bir', 'İki', 'Dört'],
      },
    });
  });

  it('refuses decoys that look like the answer', () => {
    expect(importThrough(bluffModule, { soru: 'S', cevap: 'Üç', yemler: 'uc | Bir' })).toEqual({
      ok: false,
      columns: ['yemler'],
    });
  });
});
