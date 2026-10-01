import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, contentWithImages, players } from './fixtures.test-support.js';
import { quizContentSchema, quizModule, type QuizHostView, type QuizPlayerView } from './server.js';

const open: ScriptStep = { type: 'timer' };
const answer = (playerId: string, optionId: string, afterMs = 0): ScriptStep => ({
  type: 'input',
  playerId,
  input: { optionId },
  afterMs,
});

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(quizModule, { content, players, script, ...overrides });
}

describe('quiz round flow', () => {
  it('shows the question first, then opens answering for the time limit', () => {
    const { frames } = play([open]);
    expect(frames.map((frame) => frame.phase)).toEqual(['INTRO', 'ANSWERING']);
    expect((frames[0]?.playerViews.p1 as QuizPlayerView).phase).toBe('INTRO');
  });

  it('skips the intro when introMs is 0', () => {
    const { frames } = play([], { settings: { introMs: 0 } });
    expect(frames[0]?.phase).toBe('ANSWERING');
  });

  it('shuffles options deterministically and numbers their display slots', () => {
    const host = play([]).frames[0]?.hostView as QuizHostView;
    expect(host.options.map((option) => option.slot)).toEqual([0, 1, 2, 3]);
    expect(host.options.map((option) => option.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(play([]).frames[0]?.hostView).toEqual(host);
  });

  it('ends early once every connected player answered', () => {
    const { frames, results } = play([
      open,
      answer('p1', 'b', 1000),
      answer('p2', 'a', 1000),
      answer('p3', 'b', 1000),
    ]);
    expect(frames.at(-1)?.phase).toBe('REVEAL');
    expect(results).not.toBeNull();
  });

  it('does not wait for disconnected players', () => {
    const offline = players.map((player) =>
      player.id === 'p3' ? { ...player, connected: false } : player,
    );
    const { results } = play([open, answer('p1', 'b'), answer('p2', 'b')], { players: offline });
    expect(results?.find((result) => result.playerId === 'p3')).toMatchObject({
      points: 0,
      correct: null,
    });
  });

  it('ends when the time runs out, scoring missing answers as 0', () => {
    const { results } = play([open, answer('p1', 'b', 1000), { type: 'timer' }]);
    expect(results?.map((result) => [result.playerId, result.correct])).toEqual([
      ['p1', true],
      ['p2', null],
      ['p3', null],
    ]);
  });

  it('refuses answers outside ANSWERING, repeated answers and unknown options', () => {
    const early = playRound(quizModule, { content, players, script: [] });
    const ctx = early.context();
    const inIntro = quizModule.onInput(
      early.state as never,
      { optionId: 'b' },
      { playerId: 'p1', receivedAt: ctx.now },
      ctx as never,
    );
    expect(inIntro.effects).toEqual([{ type: 'reject', playerId: 'p1', code: 'ROUND_CLOSED' }]);

    const { rejects } = play([open, answer('p1', 'b'), answer('p1', 'a'), answer('p2', 'x')]);
    expect(rejects).toEqual([
      { type: 'reject', playerId: 'p1', code: 'ALREADY_ANSWERED' },
      { type: 'reject', playerId: 'p2', code: 'INVALID_INPUT' },
    ]);
  });

  it('lets players change their answer when allowed, and then waits for the clock', () => {
    const { frames, results, rejects } = play(
      [open, answer('p1', 'a'), answer('p1', 'b'), answer('p2', 'b'), answer('p3', 'b')],
      { settings: { allowAnswerChange: true } },
    );
    expect(rejects).toEqual([]);
    expect(frames.at(-1)?.phase).toBe('ANSWERING');
    expect(results).toBeNull();
    expect((frames.at(-1)?.playerViews.p1 as QuizPlayerView & { locked: boolean }).locked).toBe(
      false,
    );
  });
});

describe('quiz scoring', () => {
  it('rewards faster correct answers and gives wrong answers nothing', () => {
    const { results } = play([
      open,
      answer('p1', 'b', 5_000), // 15 s of 20 s left → 875
      answer('p2', 'a', 1_000), // wrong
      answer('p3', 'b', 4_000), // 10 s left → 750
    ]);
    expect(results?.map((result) => [result.playerId, result.points])).toEqual([
      ['p1', 875],
      ['p2', 0],
      ['p3', 750],
    ]);
    expect(results?.[0]).toMatchObject({
      responseTimeMs: 5_000,
      answer: { optionId: 'b' },
      breakdown: { base: 875, streakBonus: 0 },
    });
  });

  it('adds the streak bonus from earlier rounds and applies the pack multiplier', () => {
    const zero = { score: 0, streak: 0, correctCount: 0, totalAnswerMs: 0 };
    const { results } = play([open, answer('p1', 'b'), answer('p2', 'b'), answer('p3', 'a')], {
      scoreMultiplier: 2,
      stats: { p1: { ...zero, streak: 2 }, p2: zero, p3: { ...zero, streak: 5 } },
    });
    expect(results?.map((result) => [result.playerId, result.points])).toEqual([
      ['p1', 2000 + 100],
      ['p2', 2000],
      ['p3', 0],
    ]);
  });
});

describe('quiz reveal', () => {
  it('shows the correct answer and the answer distribution only in REVEAL', () => {
    const { frames } = play([open, answer('p1', 'b'), answer('p2', 'a'), answer('p3', 'b')]);
    const host = frames.at(-1)?.hostView as Extract<QuizHostView, { phase: 'REVEAL' }>;
    expect(host.correctOptionId).toBe('b');
    expect(
      Object.fromEntries(host.distribution.map((entry) => [entry.optionId, entry.count])),
    ).toEqual({ a: 1, b: 2, c: 0, d: 0 });
    expect(frames.at(-1)?.playerViews.p2).toMatchObject({
      phase: 'REVEAL',
      selectedOptionId: 'a',
      correctOptionId: 'b',
      correct: false,
    });
    for (const frame of frames.slice(0, -1)) {
      expect(JSON.stringify(frame)).not.toContain('correct');
    }
  });
});

describe('quiz images (version 2)', () => {
  it('keeps version 1 content valid', () => {
    expect(quizContentSchema.safeParse(content).success).toBe(true);
    expect(
      quizContentSchema.safeParse({ ...content, media: { type: 'video', mediaId: 'x' } }).success,
    ).toBe(false);
  });

  it('shows the question image on the host and option images everywhere', () => {
    const { frames } = playRound(quizModule, {
      content: contentWithImages,
      players,
      script: [open],
    });
    const host = frames.at(-1)?.hostView as QuizHostView;
    expect(host.media).toEqual(contentWithImages.media);
    const withImage = host.options.filter((option) => option.mediaId !== null);
    expect(withImage.map((option) => option.id).sort()).toEqual(['a', 'b']);
    const phone = frames.at(-1)?.playerViews.p1 as QuizPlayerView;
    expect(phone.phase === 'ANSWERING' && phone.options).toEqual(host.options);

    const plain = play([open]).frames.at(-1)?.hostView as QuizHostView;
    expect(plain.media).toBeNull();
  });
});
