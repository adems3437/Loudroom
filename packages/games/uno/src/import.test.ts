import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { unoModule } from './server.js';

describe('uno import', () => {
  it('reads the title', () => {
    expect(importThrough(unoModule, { Başlık: 'Cuma UNO' })).toEqual({
      ok: true,
      content: { title: 'Cuma UNO' },
    });
    expect(importThrough(unoModule, { baslik: '' })).toEqual({ ok: false, columns: ['baslik'] });
  });
});
