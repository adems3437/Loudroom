import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, players } from './fixtures.test-support.js';
import {
  memoryModule,
  type MemoryHostView,
  type MemoryPlayerView,
  type MemoryState,
} from './server.js';

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(memoryModule, { content, players, script, ...overrides });
}

const timer: ScriptStep = { type: 'timer' };
const answer = (playerId: string, question: number, optionId: string): ScriptStep => ({
  type: 'input',
  playerId,
  input: { question, optionId },
  afterMs: 500,
});
type View<T, P> = Extract<T, { phase: P }>;

/** The right option ids of the round the harness plays. */
function rightOptions(): string[] {
  const state = play([]).state as MemoryState;
  return state.board.questions.map((question) => question.correctOptionId);
}

describe('memory round flow', () => {
  it('shows the board on the TV only, then asks every phone the same questions', () => {
    const { frames } = play([timer, timer]);
    expect(frames.map((frame) => frame.phase)).toEqual(['INTRO', 'SHOW', 'QUESTIONS']);
    const show = frames[1];
    expect((show?.hostView as View<MemoryHostView, 'SHOW'>).board).toHaveLength(9);
    expect(show?.playerViews.p1).toEqual({ phase: 'SHOW' });
    const questions = frames[2]?.hostView as View<MemoryHostView, 'QUESTIONS'>;
    expect(questions).not.toHaveProperty('board');
    const p1 = frames[2]?.playerViews.p1 as View<MemoryPlayerView, 'QUESTIONS'>;
    expect(p1.questions).toHaveLength(3);
    expect(frames[2]?.playerViews.p2).toEqual(p1);
  });

  it('never sends the answers or the board to phones before the reveal', () => {
    const { frames } = play([timer, timer, answer('p1', 0, 'o1')]);
    for (const frame of frames) {
      const phones = JSON.stringify(frame.playerViews);
      expect(phones).not.toMatch(/correct|board|slots/);
    }
    for (const frame of frames.filter((f) => f.phase !== 'SHOW')) {
      expect(JSON.stringify(frame.hostView)).not.toMatch(/correct|board/);
    }
  });

  it('takes one answer per question and reveals once everyone has answered all', () => {
    const right = rightOptions();
    const steps: ScriptStep[] = [timer, timer];
    for (let q = 0; q < 3; q++) {
      steps.push(
        answer('p1', q, right[q] ?? 'o1'),
        answer('p2', q, 'o1'),
        answer('p3', q, right[q] ?? 'o1'),
      );
    }
    steps.push(answer('p1', 0, 'o2'));
    const { frames, results, rejects } = play(steps.slice(0, -1));
    expect(frames.at(-1)?.phase).toBe('REVEAL');
    expect(rejects).toEqual([]);
    const twice = play([
      timer,
      timer,
      answer('p1', 0, 'o1'),
      answer('p1', 0, 'o2'),
      answer('p1', 3, 'o1'),
    ]);
    expect(twice.rejects.map((r) => r.code)).toEqual(['ALREADY_ANSWERED', 'INVALID_INPUT']);
    expect(results?.find((r) => r.playerId === 'p1')).toMatchObject({
      points: 1200,
      correct: true,
    });
  });
});

describe('memory scoring and reveal', () => {
  it('pays per right answer, with no speed bonus; nobody answering scores null', () => {
    const right = rightOptions();
    const wrong = (q: number) => ['o1', 'o2', 'o3', 'o4'].find((id) => id !== right[q]) ?? 'o1';
    const { results, frames } = play(
      [
        timer,
        timer,
        answer('p1', 0, right[0] ?? ''),
        answer('p1', 1, wrong(1)),
        answer('p2', 2, right[2] ?? ''),
        timer,
      ],
      { scoreMultiplier: 2 },
    );
    expect(results?.map((r) => [r.playerId, r.points, r.correct])).toEqual([
      ['p1', 800, false],
      ['p2', 800, false],
      ['p3', 0, null],
    ]);
    const host = frames.at(-1)?.hostView as View<MemoryHostView, 'REVEAL'>;
    expect(host.board).toHaveLength(9);
    expect(host.questions.map((q) => q.correctOptionId)).toEqual(right);
    expect(host.questions.map((q) => q.correctCount)).toEqual([1, 0, 1]);
    expect(frames.at(-1)?.playerViews.p1).toMatchObject({
      correctCount: 1,
      answers: { '0': right[0] },
    });
  });
});
