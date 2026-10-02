import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, players, yearContent } from './fixtures.test-support.js';
import {
  closestNumberModule,
  type ClosestNumberHostView,
  type ClosestNumberPlayerView,
} from './server.js';

const open: ScriptStep = { type: 'timer' };
const guess = (playerId: string, value: number, afterMs = 0): ScriptStep => ({
  type: 'input',
  playerId,
  input: { value },
  afterMs,
});

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(closestNumberModule, { content, players, script, ...overrides });
}

type Reveal<T> = Extract<T, { phase: 'REVEAL' }>;

describe('closest number round flow', () => {
  it('shows the question, opens answering, and reveals once everyone guessed', () => {
    const { frames, results } = play([
      open,
      guess('p1', 8000, 1000),
      guess('p2', 9000, 1000),
      guess('p3', 7000, 1000),
    ]);
    expect(frames.map((frame) => frame.phase)).toEqual([
      'INTRO',
      'ANSWERING',
      'ANSWERING',
      'ANSWERING',
      'REVEAL',
    ]);
    expect(results).not.toBeNull();
  });

  it('ends when the time runs out and does not wait for disconnected players', () => {
    const offline = players.map((p) => (p.id === 'p3' ? { ...p, connected: false } : p));
    expect(play([open, guess('p1', 1), guess('p2', 2)], { players: offline }).results).not.toBe(
      null,
    );
    const { results } = play([open, guess('p1', 8000), { type: 'timer' }]);
    expect(results?.map((result) => result.correct)).toEqual([true, null, null]);
  });

  it('refuses guesses outside answering, a second guess and fractional years', () => {
    const { rejects } = play([open, guess('p1', 1), guess('p1', 2)]);
    expect(rejects).toEqual([{ type: 'reject', playerId: 'p1', code: 'ALREADY_ANSWERED' }]);

    const early = playRound(closestNumberModule, { content, players, script: [] });
    const ctx = early.context();
    expect(
      closestNumberModule.onInput(
        early.state as never,
        { value: 1 },
        { playerId: 'p1', receivedAt: ctx.now },
        ctx as never,
      ).effects,
    ).toEqual([{ type: 'reject', playerId: 'p1', code: 'ROUND_CLOSED' }]);

    const years = playRound(closestNumberModule, {
      content: yearContent,
      players,
      script: [open, guess('p1', 1453.5)],
    });
    expect(years.rejects).toEqual([{ type: 'reject', playerId: 'p1', code: 'INVALID_INPUT' }]);
  });

  it('keeps the answer and the guesses off every screen until the reveal', () => {
    const { frames } = play([open, guess('p1', 8000), guess('p2', 9000)]);
    for (const frame of frames) {
      expect(JSON.stringify(frame)).not.toMatch(/8849|"answer"/);
      const others = [frame.hostView, frame.playerViews.p3];
      expect(JSON.stringify(others)).not.toMatch(/8000|9000/);
      expect(JSON.stringify(frame.playerViews.p1)).not.toContain('9000');
    }
    expect((frames.at(-1)?.playerViews.p2 as ClosestNumberPlayerView).phase).toBe('ANSWERING');
    expect(frames.at(-1)?.playerViews.p2).toMatchObject({ guess: 9000 });
    expect(frames.at(-1)?.playerViews.p1).toMatchObject({ guess: 8000 });
  });
});

describe('closest number scoring', () => {
  it('scores by relative error on a log curve; a guess off by 100 % or more gets nothing', () => {
    const { results } = play([
      open,
      guess('p1', 8849, 1000),
      guess('p2', 8849 * 1.1, 1000),
      guess('p3', 20_000, 1000),
    ]);
    expect(results?.map((result) => [result.playerId, result.points, result.correct])).toEqual([
      ['p1', 1000, true],
      ['p2', 862, false],
      ['p3', 0, false],
    ]);
    expect(results?.[1]).toMatchObject({ answer: { value: 8849 * 1.1 }, responseTimeMs: 2000 });
  });

  it('gives equal guesses equal points; both count as closest', () => {
    const { results } = play([
      open,
      guess('p1', 9000, 500),
      guess('p2', 8698, 3000),
      { type: 'timer' },
    ]);
    expect(results?.[0]?.points).toBe(results?.[1]?.points);
    expect(results?.map((result) => result.correct)).toEqual([true, true, null]);
  });

  it('ranks by distance in rank mode, the faster guess first on a tie', () => {
    const { results } = play(
      [open, guess('p1', 8000, 500), guess('p2', 9698, 500), guess('p3', 8849, 500)],
      { settings: { scoring: 'rank' }, scoreMultiplier: 2 },
    );
    expect(results?.map((result) => [result.playerId, result.points])).toEqual([
      ['p1', 1334],
      ['p2', 666],
      ['p3', 2000],
    ]);
  });

  it('judges years in years', () => {
    const { results } = playRound(closestNumberModule, {
      content: yearContent,
      players,
      script: [open, guess('p1', 1453), guess('p2', 1463), guess('p3', 1600)],
    });
    expect(results?.map((result) => result.points)).toEqual([1000, 480, 0]);
  });
});

describe('closest number reveal', () => {
  it('shows the answer and every guess, closest first', () => {
    const { frames } = play([open, guess('p1', 8000), guess('p2', 8800), guess('p3', -3)]);
    const host = frames.at(-1)?.hostView as Reveal<ClosestNumberHostView>;
    expect(host).toMatchObject({ answer: 8849, unit: 'm', zeroPointDistance: 8849 });
    expect(host.guesses).toEqual([
      { playerId: 'p2', value: 8800, closest: true },
      { playerId: 'p1', value: 8000, closest: false },
      { playerId: 'p3', value: -3, closest: false },
    ]);
    expect(frames.at(-1)?.playerViews.p1).toEqual({
      phase: 'REVEAL',
      question: content.question,
      unit: 'm',
      displayFormat: 'number',
      answer: 8849,
      guess: 8000,
      correct: false,
      rank: 2,
      answeredCount: 3,
    });
  });

  it('tells a player without a guess so', () => {
    const { frames } = play([open, guess('p1', 8000), { type: 'timer' }]);
    expect(frames.at(-1)?.playerViews.p3).toMatchObject({ guess: null, correct: null, rank: null });
  });
});
