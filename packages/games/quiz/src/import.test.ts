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
});
