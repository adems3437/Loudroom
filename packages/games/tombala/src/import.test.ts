import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { tombalaModule } from './server.js';

describe('tombala import', () => {
  it('reads the title', () => {
    expect(importThrough(tombalaModule, { Başlık: 'Yılbaşı Tombalası' })).toEqual({
      ok: true,
      content: { title: 'Yılbaşı Tombalası' },
    });
    expect(importThrough(tombalaModule, { baslik: '' })).toEqual({
      ok: false,
      columns: ['baslik'],
    });
  });
});
