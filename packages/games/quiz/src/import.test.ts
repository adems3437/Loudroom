import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { quizModule } from './server.js';

describe('quiz import', () => {
  it('reads a row with Turkish headers into a question', () => {
    const result = importThrough(quizModule, {
      Soru: 'Başkent?',
      A: 'İstanbul',
      B: 'Ankara',
      C: 'İzmir',
      Doğru: 'B',
    });
    expect(result).toEqual({
      ok: true,
      content: {
        question: 'Başkent?',
        options: [
          { id: 'a', text: 'İstanbul' },
          { id: 'b', text: 'Ankara' },
          { id: 'c', text: 'İzmir' },
        ],
        correctOptionId: 'b',
      },
    });
  });

  it('points problems at their columns', () => {
    expect(importThrough(quizModule, { soru: '', a: 'x', b: 'y', dogru: 'z' })).toEqual({
      ok: false,
      columns: ['soru', 'dogru'],
    });
    expect(importThrough(quizModule, { soru: 'S', a: 'x', dogru: 'a' })).toMatchObject({
      ok: false,
      columns: ['a'],
    });
  });

  it('takes a video id, and refuses a row naming both an image and a video', () => {
    const video = '0b6f7c2e-3d4a-4e5f-8a9b-1c2d3e4f5a6b';
    const image = '1c7a8d3f-4e5b-4f6a-9b0c-2d3e4f5a6b70';
    const row = { soru: 'S', a: 'x', b: 'y', dogru: 'a' };
    expect(importThrough(quizModule, { ...row, video_id: video })).toMatchObject({
      ok: true,
      content: { media: { type: 'video', mediaId: video } },
    });
    expect(importThrough(quizModule, { ...row, gorsel_id: image, video_id: video })).toEqual({
      ok: false,
      columns: ['video_id'],
    });
  });
});
