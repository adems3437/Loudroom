import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { pistiModule } from './server.js';

describe('pisti import', () => {
  it('reads the title', () => {
    expect(importThrough(pistiModule, { Başlık: 'Bayram Piştisi' })).toEqual({
      ok: true,
      content: { title: 'Bayram Piştisi' },
    });
    expect(importThrough(pistiModule, { baslik: '' })).toEqual({ ok: false, columns: ['baslik'] });
  });
});
