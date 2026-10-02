import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { imageLocationModule } from './server.js';

const MEDIA = '0b6f7c2e-3d4a-4e5f-8a9b-1c2d3e4f5a6b';

describe('image location import', () => {
  it('reads percentages into image points', () => {
    expect(
      importThrough(imageLocationModule, {
        soru: 'Nerede?',
        gorsel_id: MEDIA,
        x: '38,5',
        y: '42',
        yaricap: '5',
      }),
    ).toEqual({
      ok: true,
      content: { question: 'Nerede?', mediaId: MEDIA, target: { x: 0.385, y: 0.42 }, radius: 0.05 },
    });
  });

  it('points a missing image or a bad coordinate at its column', () => {
    expect(
      importThrough(imageLocationModule, { soru: 'N', gorsel_id: '', x: '150', y: 'a' }),
    ).toEqual({ ok: false, columns: ['gorsel_id', 'x', 'y'] });
  });
});
