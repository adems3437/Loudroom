import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { whoWouldModule } from './server.js';

describe('who would import', () => {
  it('reads the statement and the title', () => {
    expect(importThrough(whoWouldModule, { İfade: 'Kim?', Unvan: 'Şampiyon' })).toEqual({
      ok: true,
      content: { question: 'Kim?', title: 'Şampiyon' },
    });
    expect(importThrough(whoWouldModule, { ifade: '' })).toEqual({ ok: false, columns: ['ifade'] });
  });
});
