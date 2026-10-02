import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { reactionModule } from './server.js';

describe('reaction import', () => {
  it('reads the kind in Turkish', () => {
    expect(importThrough(reactionModule, { başlık: 'Tuzak', tür: 'Tuzaklı' })).toEqual({
      ok: true,
      content: { title: 'Tuzak', variant: 'goNoGo' },
    });
    expect(importThrough(reactionModule, { baslik: 'Klasik' })).toMatchObject({
      ok: true,
      content: { variant: 'classic' },
    });
    expect(importThrough(reactionModule, { baslik: 'X', tur: 'hızlı' })).toEqual({
      ok: false,
      columns: ['tur'],
    });
  });
});
