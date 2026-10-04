import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { amiralModule } from './server.js';

describe('amiral batti import', () => {
  it('reads the title', () => {
    expect(importThrough(amiralModule, { Başlık: 'Deniz Savaşı' })).toEqual({
      ok: true,
      content: { title: 'Deniz Savaşı' },
    });
    expect(importThrough(amiralModule, { baslik: '' })).toEqual({ ok: false, columns: ['baslik'] });
  });
});
