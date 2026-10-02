import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, players, reordered } from './fixtures.test-support.js';
import { sortingModule, type SortingHostView, type SortingPlayerView } from './server.js';

const open: ScriptStep = { type: 'timer' };
const send = (playerId: string, order: string[], afterMs = 0): ScriptStep => ({
  type: 'input',
  playerId,
  input: { order },
  afterMs,
});

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(sortingModule, { content, players, script, ...overrides });
}

type Answering<T> = Extract<T, { phase: 'ANSWERING' }>;
type Reveal<T> = Extract<T, { phase: 'REVEAL' }>;

describe('sorting round flow', () => {
  it('starts every screen from the same seeded order, whatever the correct order is', () => {
    const host = play([open]).frames.at(-1)?.hostView as Answering<SortingHostView>;
    expect(host.items.map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    const reversed = playRound(sortingModule, {
      content: reordered(['d', 'c', 'b', 'a']),
      players,
      script: [open],
    }).frames.at(-1)?.hostView as Answering<SortingHostView>;
    expect(reversed.items).toEqual(host.items);
    const phone = play([open]).frames.at(-1)?.playerViews.p1 as Answering<SortingPlayerView>;
    expect(phone.items).toEqual(host.items);
  });

  it('reveals once everyone sent an order, or when the time runs out', () => {
    const all = play([
      open,
      send('p1', ['a', 'b', 'c', 'd']),
      send('p2', ['a', 'b', 'c', 'd']),
      send('p3', ['a', 'b', 'c', 'd']),
    ]);
    expect(all.frames.at(-1)?.phase).toBe('REVEAL');
    const timed = play([open, send('p1', ['a', 'b', 'c', 'd']), { type: 'timer' }]);
    expect(timed.results?.map((result) => result.correct)).toEqual([true, null, null]);
  });

  it('locks a sent order unless changes are allowed', () => {
    const locked = play([open, send('p1', ['a', 'b', 'c', 'd']), send('p1', ['d', 'c', 'b', 'a'])]);
    expect(locked.rejects).toEqual([{ type: 'reject', playerId: 'p1', code: 'ALREADY_ANSWERED' }]);

    const changing = play(
      [
        open,
        send('p1', ['d', 'c', 'b', 'a']),
        send('p2', ['a', 'b', 'c', 'd']),
        send('p3', ['a', 'b', 'c', 'd']),
        send('p1', ['a', 'b', 'c', 'd']),
        { type: 'timer' },
      ],
      { settings: { allowAnswerChange: true } },
    );
    expect(changing.rejects).toEqual([]);
    expect(changing.results?.[0]).toMatchObject({ correct: true, points: 1000 });
  });

  it('refuses orders that are not the round’s items', () => {
    const { rejects } = play([
      open,
      send('p1', ['a', 'b', 'c', 'c']),
      send('p2', ['a', 'b', 'c', 'z']),
    ]);
    expect(rejects.map((reject) => reject.code)).toEqual(['INVALID_INPUT', 'INVALID_INPUT']);
  });

  it('keeps the correct order and the sent orders off other screens until the reveal', () => {
    const { frames } = play([
      open,
      send('p1', ['d', 'c', 'b', 'a']),
      send('p2', ['a', 'b', 'c', 'd']),
    ]);
    for (const frame of frames) {
      expect(JSON.stringify(frame)).not.toMatch(/correct/);
      expect(JSON.stringify([frame.hostView, frame.playerViews.p3])).not.toContain(
        'submittedOrder":[',
      );
    }
    expect(frames.at(-1)?.playerViews.p1).toMatchObject({
      submittedOrder: ['d', 'c', 'b', 'a'],
      locked: true,
    });
  });
});

describe('sorting scoring', () => {
  it('scores the share of items in place by default; no speed bonus', () => {
    const { results } = play(
      [
        open,
        send('p1', ['a', 'b', 'c', 'd'], 1_000),
        send('p2', ['b', 'a', 'c', 'd'], 1_000),
        send('p3', ['b', 'c', 'd', 'a'], 20_000),
      ],
      { scoreMultiplier: 1.5 },
    );
    expect(results?.map((result) => [result.playerId, result.points, result.correct])).toEqual([
      ['p1', 1500, true],
      ['p2', 750, false],
      ['p3', 0, false],
    ]);
    expect(results?.[1]).toMatchObject({
      answer: { order: ['b', 'a', 'c', 'd'] },
      responseTimeMs: 2_000,
      breakdown: { base: 750, correctPositions: 2 },
    });
  });

  it('gives partial credit by item pairs in Kendall mode', () => {
    const { results } = play(
      [
        open,
        send('p1', ['a', 'b', 'c', 'd']),
        send('p2', ['b', 'a', 'c', 'd']),
        send('p3', ['b', 'c', 'd', 'a']),
      ],
      { settings: { scoring: 'kendall' } },
    );
    expect(results?.map((result) => result.points)).toEqual([1000, 833, 500]);
  });
});

describe('sorting reveal', () => {
  it('shows the correct order and how many placed each item right', () => {
    const { frames } = play([
      open,
      send('p1', ['a', 'b', 'c', 'd']),
      send('p2', ['b', 'a', 'c', 'd']),
      send('p3', ['a', 'c', 'b', 'd']),
    ]);
    const host = frames.at(-1)?.hostView as Reveal<SortingHostView>;
    expect(host.correctOrder.map((item) => [item.id, item.placedRight])).toEqual([
      ['a', 2],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
    expect(host.perfectCount).toBe(1);
    expect(frames.at(-1)?.playerViews.p3).toEqual({
      phase: 'REVEAL',
      labels: content.labels,
      correctOrder: content.items.map((item) => ({ id: item.id, text: item.text, mediaId: null })),
      submittedOrder: ['a', 'c', 'b', 'd'],
      correctPositions: 2,
      correct: false,
    });
  });
});
