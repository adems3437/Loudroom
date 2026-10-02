import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { closestNumberModule } from './server.js';

describe('closest number import', () => {
  it('reads Turkish numbers and the year format', () => {
    expect(
      importThrough(closestNumberModule, { soru: 'Kaç?', cevap: '1.234,5', birim: 'm' }),
    ).toEqual({
      ok: true,
      content: { question: 'Kaç?', answer: 1234.5, unit: 'm', displayFormat: 'number' },
    });
    expect(
      importThrough(closestNumberModule, { soru: 'Ne zaman?', cevap: '1453', biçim: 'Yıl' }),
    ).toMatchObject({
      ok: true,
      content: { answer: 1453, displayFormat: 'year' },
    });
  });

  it('points a bad answer at its column', () => {
    expect(importThrough(closestNumberModule, { soru: 'Kaç?', cevap: 'çok' })).toEqual({
      ok: false,
      columns: ['cevap'],
    });
  });
});
