import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, guess, players } from './fixtures.test-support.js';
import { drawingModule, type DrawingHostView, type DrawingPlayerView } from './server.js';

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(drawingModule, { content, players, script, ...overrides });
}

const open: ScriptStep = { type: 'timer' };
type View<T, P> = Extract<T, { phase: P }>;

describe('drawing turns and phases', () => {
  it('lets players draw in turn, in join order, among the connected ones', () => {
    const { context } = play([]);
    const drawerFor = (roundIndex: number, list = players) =>
      drawingModule.createRound({ ...context(), roundIndex, players: list } as never).state
        .drawerId;
    expect([0, 1, 2, 3, 4].map((index) => drawerFor(index))).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p1',
    ]);
    const offline = players.map((p) => (p.id === 'p2' ? { ...p, connected: false } : p));
    expect(drawerFor(1, offline)).toBe('p3');
  });

  it('skips the round without points when fewer than 2 players are connected', () => {
    const alone = players.map((p) => ({ ...p, connected: p.id === 'p1' }));
    const { frames, results } = play([], { players: alone });
    expect(frames[0]).toMatchObject({ phase: 'SKIPPED', ended: true });
    expect(results?.every((result) => result.points === 0)).toBe(true);
  });

  it('shows the word to the drawer only, letter boxes to everyone else', () => {
    const { frames } = play([open]);
    expect(frames[0]?.playerViews.p1).toEqual({ phase: 'INTRO', role: 'drawer', word: 'Zürafa' });
    expect(frames[1]?.playerViews.p2).toMatchObject({ role: 'guesser', slots: [6] });
    expect(frames[1]?.hostView).toMatchObject({ phase: 'DRAWING', slots: [6], guesserCount: 3 });
    for (const frame of frames) {
      expect(JSON.stringify([frame.hostView, frame.playerViews.p2])).not.toMatch(/zürafa/i);
    }
    const hidden = play([open], { settings: { showLetterSlots: false } });
    expect(hidden.frames[1]?.hostView).toMatchObject({ slots: null });
  });

  it('lets only the drawer stream, and only while drawing', () => {
    const accepts = (script: ScriptStep[], playerId: string) => {
      const played = play(script);
      return drawingModule.stream?.accepts(
        played.state as never,
        playerId,
        played.context() as never,
      );
    };
    expect(accepts([], 'p1')).toBe(false);
    expect(accepts([open], 'p1')).toBe(true);
    expect(accepts([open], 'p2')).toBe(false);
    expect(accepts([open, { type: 'timer' }], 'p1')).toBe(false);
  });
});

describe('drawing guesses', () => {
  it('shows wrong guesses to all, tells "close" only to the guesser, hides right ones', () => {
    const { frames, rejects } = play(
      [open, guess('p2', 'zebra'), guess('p3', 'zürfs'), guess('p4', 'ZURAFA'), guess('p4', 'x')],
      { blockedWords: ['küfürlü'] },
    );
    expect(rejects).toEqual([{ type: 'reject', playerId: 'p4', code: 'ALREADY_ANSWERED' }]);
    const host = frames.at(-1)?.hostView as View<DrawingHostView, 'DRAWING'>;
    expect(host.feed).toEqual([{ playerId: 'p2', text: 'zebra' }]);
    expect(host.solvers).toEqual(['p4']);
    expect(frames.at(-1)?.playerViews.p3).toMatchObject({
      solved: false,
      guesses: [{ text: 'zürfs', result: 'close' }],
    });
    expect(frames.at(-1)?.playerViews.p2).toMatchObject({
      guesses: [{ text: 'zebra', result: 'wrong' }],
    });
    expect(JSON.stringify(frames.at(-1)?.playerViews.p2)).not.toContain('zürfs');
  });

  it('refuses guesses from the drawer, outside drawing and with blocked words', () => {
    const { rejects } = play(
      [guess('p2', 'at'), open, guess('p1', 'zürafa'), guess('p2', 'küfürlü laf'), guess('p2', '')],
      { blockedWords: ['küfürlü'] },
    );
    expect(rejects.map((reject) => [reject.playerId, reject.code])).toEqual([
      ['p2', 'ROUND_CLOSED'],
      ['p1', 'INVALID_INPUT'],
      ['p2', 'TEXT_REJECTED'],
      ['p2', 'INVALID_INPUT'],
    ]);
  });

  it('reveals as soon as everyone who can guess has it', () => {
    const { frames, results } = play([
      open,
      guess('p3', 'zürafa', 2_000),
      guess('p2', 'zurafa', 3_000),
      guess('p4', 'zürafaa', 5_000),
    ]);
    expect(frames.at(-1)?.phase).toBe('REVEAL');
    expect(results?.map((result) => [result.playerId, result.points, result.correct])).toEqual([
      ['p1', 750, null],
      ['p2', 850, true],
      ['p3', 1000, true],
      ['p4', 700, true],
    ]);
    expect(results?.[2]).toMatchObject({ responseTimeMs: 2_000, breakdown: { rank: 1 } });
  });
});

describe('drawing scoring and reveal', () => {
  it('never goes below the minimum, applies the multiplier, scores wrong guessers 0', () => {
    const { results } = play(
      [open, guess('p2', 'zürafa'), guess('p3', 'zürafa'), guess('p4', 'aslan'), { type: 'timer' }],
      { settings: { rankStep: 900, minScore: 300 }, scoreMultiplier: 2 },
    );
    expect(results?.map((result) => [result.points, result.correct])).toEqual([
      [1000, null],
      [2000, true],
      [600, true],
      [0, false],
    ]);
  });

  it('shows the word and the order in the reveal', () => {
    const { frames } = play([open, guess('p3', 'zürafa'), { type: 'timer' }]);
    expect(frames.at(-1)?.hostView).toEqual({
      phase: 'REVEAL',
      drawerId: 'p1',
      word: 'Zürafa',
      feed: [],
      solvers: ['p3'],
    });
    expect(frames.at(-1)?.playerViews.p3 as View<DrawingPlayerView, 'REVEAL'>).toMatchObject({
      solved: true,
      rank: 1,
    });
    expect(frames.at(-1)?.playerViews.p2).toMatchObject({ solved: null, rank: null });
    expect(frames.at(-1)?.playerViews.p1).toMatchObject({ role: 'drawer', solved: null });
  });

  it('ends a skipped drawing with the word and the points so far', () => {
    const played = play([open, guess('p2', 'zürafa')]);
    const skipped = drawingModule.onSkip?.(played.state as never, played.context() as never);
    expect(skipped?.effects).toContainEqual({ type: 'endRound' });
    expect(drawingModule.score(skipped?.state as never, played.context() as never)[1]?.points).toBe(
      1000,
    );
    const over = play([open, { type: 'timer' }]);
    expect(drawingModule.onSkip?.(over.state as never, over.context() as never)).toBeNull();
  });
});
