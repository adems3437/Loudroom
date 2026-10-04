import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { okeyModule } from './server.js';

describe('okey import', () => {
  it('reads the title', () => {
    expect(importThrough(okeyModule, { Başlık: 'Kahvehane Okeyi' })).toEqual({
      ok: true,
      content: { title: 'Kahvehane Okeyi' },
    });
    expect(importThrough(okeyModule, { baslik: '' })).toEqual({ ok: false, columns: ['baslik'] });
  });
});
