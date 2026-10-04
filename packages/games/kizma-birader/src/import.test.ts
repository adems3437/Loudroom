import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { kizmaModule } from './server.js';

describe('kizma birader import', () => {
  it('reads the title', () => {
    expect(importThrough(kizmaModule, { Başlık: 'Bayram Tahtası' })).toEqual({
      ok: true,
      content: { title: 'Bayram Tahtası' },
    });
    expect(importThrough(kizmaModule, { baslik: '' })).toEqual({ ok: false, columns: ['baslik'] });
  });
});
