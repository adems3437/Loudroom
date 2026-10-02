import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { drawingModule } from './server.js';

describe('drawing import', () => {
  it('reads the word and its alternatives', () => {
    expect(
      importThrough(drawingModule, { kelime: 'Buzdolabı', alternatifler: 'Buz dolabı' }),
    ).toEqual({
      ok: true,
      content: { word: 'Buzdolabı', alternatives: ['Buz dolabı'] },
    });
    expect(importThrough(drawingModule, { kelime: '' })).toEqual({
      ok: false,
      columns: ['kelime'],
    });
  });
});
