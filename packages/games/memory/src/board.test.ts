import { createRandom } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import { buildBoard } from './board.js';
import { MEMORY_DEFAULT_SETTINGS } from './schema.js';
import { content } from './fixtures.test-support.js';

describe('buildBoard', () => {
  const board = buildBoard(content.items, MEMORY_DEFAULT_SETTINGS, createRandom(7));
  const counts = new Map<string, number>();
  for (const id of board.slots) counts.set(id, (counts.get(id) ?? 0) + 1);

  it('spreads the chosen objects over the spaces, with repeats', () => {
    expect(board.slots).toHaveLength(9);
    expect(counts.size).toBe(6);
  });

  it('is the same for the same seed and independent of the items’ order', () => {
    expect(buildBoard(content.items, MEMORY_DEFAULT_SETTINGS, createRandom(7))).toEqual(board);
    const reversed = [...content.items].reverse();
    expect(buildBoard(reversed, MEMORY_DEFAULT_SETTINGS, createRandom(7))).toEqual(board);
  });

  it('asks each kind of question with four options and one right answer', () => {
    expect(board.questions.map((q) => q.type).sort()).toEqual(['absent', 'count', 'present']);
    for (const question of board.questions) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map((o) => o.id)).size).toBe(4);
      const right = question.options.find((o) => o.id === question.correctOptionId);
      if (question.type === 'present') {
        expect(counts.has(right?.itemId ?? '')).toBe(true);
        expect(question.options.filter((o) => counts.has(o.itemId ?? ''))).toHaveLength(1);
      } else if (question.type === 'absent') {
        expect(counts.has(right?.itemId ?? '')).toBe(false);
        expect(question.options.filter((o) => counts.has(o.itemId ?? ''))).toHaveLength(3);
      } else {
        expect(right?.number).toBe(counts.get(question.subjectId ?? ''));
        expect(question.options.every((o) => (o.number ?? 0) >= 1)).toBe(true);
      }
    }
  });

  it('keeps three absent objects for the options even with a small set', () => {
    const small = buildBoard(
      content.items.slice(0, 8),
      { ...MEMORY_DEFAULT_SETTINGS, distinctCount: 8 },
      createRandom(3),
    );
    expect(new Set(small.slots).size).toBe(5);
  });
});
