import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, fullRound, players, react } from './fixtures.test-support.js';
import { reactionModule, type ReactionHostView, type ReactionPlayerView } from './server.js';

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(reactionModule, { content, players, script, ...overrides });
}

const timer: ScriptStep = { type: 'timer' };
const early = (playerId: string, attempt: number): ScriptStep => ({
  type: 'input',
  playerId,
  input: { type: 'early', attempt },
  afterMs: 100,
});
type View<T, P> = Extract<T, { phase: P }>;

describe('reaction attempts', () => {
  it('waits a secret, seeded time before GO, never told to the clients', () => {
    const { context } = play([], { settings: { introMs: 0 } });
    const created = reactionModule.createRound(context() as never);
    expect(created.effects).toEqual([
      { type: 'phase', phase: 'ARMED', durationMs: expect.any(Number) as number, hidden: true },
    ]);
    const wait = (created.effects?.[0] as { durationMs: number }).durationMs;
    expect(wait).toBeGreaterThanOrEqual(1_500);
    expect(wait).toBeLessThanOrEqual(4_000);
    const { frames } = play([timer]);
    expect(JSON.stringify(frames)).not.toContain(String(wait));
  });

  it('plans decoys for goNoGo, never first', () => {
    const { state } = play([], {
      content: { title: 'Tuzak', variant: 'goNoGo' },
      settings: { attempts: 6 },
    });
    const kinds = (state as { attempts: { kind: string }[] }).attempts.map((a) => a.kind);
    expect(kinds.filter((kind) => kind === 'decoy')).toHaveLength(2);
    expect(kinds[0]).toBe('target');
  });

  it('moves on once everyone has a result, and ends after the last attempt', () => {
    const { frames, results } = play(
      fullRound({ p1: [250, 260, 270], p2: [300, 310, 320], p3: [350, 360, 370] }),
    );
    expect(frames.filter((frame) => frame.phase === 'RESULT')).toHaveLength(3);
    expect(frames.at(-1)?.phase).toBe('REVEAL');
    expect(
      results?.map((result) => [result.playerId, result.points, result.responseTimeMs]),
    ).toEqual([
      ['p1', 1000, 260],
      ['p2', 850, 310],
      ['p3', 700, 360],
    ]);
  });

  it('judges taps: impossible speed, no "shown", a mismatched gap, early taps and misses', () => {
    const { frames } = play([
      timer,
      early('p3', 0),
      timer,
      // p1: claims 80 ms → refused.
      ...react('p1', 0, 80),
      // p2: claims 200 ms but the tap arrived 700 ms after "shown".
      { type: 'input', playerId: 'p2', input: { type: 'shown', attempt: 0 }, afterMs: 10 },
      {
        type: 'input',
        playerId: 'p2',
        input: { type: 'tap', attempt: 0, reactionMs: 200 },
        afterMs: 700,
      },
    ]);
    const host = frames.at(-1)?.hostView as View<ReactionHostView, 'RESULT'>;
    expect(host.phase).toBe('RESULT');
    expect(Object.fromEntries(host.results.map((r) => [r.playerId, r.outcome]))).toEqual({
      p1: 'invalid',
      p2: 'invalid',
      p3: 'early',
    });
    const tapOnly = play([
      timer,
      timer,
      {
        type: 'input',
        playerId: 'p1',
        input: { type: 'tap', attempt: 0, reactionMs: 300 },
        afterMs: 300,
      },
      timer,
    ]);
    const results = (tapOnly.frames.at(-1)?.hostView as View<ReactionHostView, 'RESULT'>).results;
    expect(Object.fromEntries(results.map((r) => [r.playerId, r.outcome]))).toEqual({
      p1: 'invalid',
      p2: 'missed',
      p3: 'missed',
    });
  });

  it('refuses inputs for another attempt, at the wrong time or twice', () => {
    const { rejects } = play([
      timer,
      { type: 'input', playerId: 'p1', input: { type: 'shown', attempt: 0 } },
      timer,
      early('p1', 0),
      ...react('p1', 1, 300),
      ...react('p2', 0, 300),
      ...react('p2', 0, 300),
    ]);
    expect(rejects.map((reject) => [reject.playerId, reject.code])).toEqual([
      ['p1', 'ROUND_CLOSED'],
      ['p1', 'ROUND_CLOSED'],
      ['p1', 'ROUND_CLOSED'],
      ['p1', 'ROUND_CLOSED'],
      ['p2', 'ALREADY_ANSWERED'],
      ['p2', 'ALREADY_ANSWERED'],
    ]);
  });
});

describe('reaction scoring', () => {
  it('takes the median with penalties; no valid tap scores 0; good medians are "correct"', () => {
    const script: ScriptStep[] = [
      timer,
      early('p2', 0),
      timer,
      ...react('p1', 0, 300),
      ...react('p3', 0, 900),
      timer,
      timer,
      ...react('p1', 1, 320),
      ...react('p2', 1, 250),
      ...react('p3', 1, 900),
      timer,
      timer,
      ...react('p1', 2, 340),
      ...react('p2', 2, 260),
      timer,
      timer,
    ];
    const { results, frames } = play(script, { scoreMultiplier: 2 });
    // p2: [1500 (early), 250, 260] → 260; p1: 320; p3: [900, 900, 1500 (missed)] → 900.
    expect(results?.map((r) => [r.playerId, r.responseTimeMs, r.points, r.correct])).toEqual([
      ['p2', 260, 2000, true],
      ['p1', 320, 1700, true],
      ['p3', 900, 1400, false],
    ]);
    const reveal = frames.at(-1)?.hostView as View<ReactionHostView, 'REVEAL'>;
    expect(reveal.ranking[0]).toEqual({ playerId: 'p2', medianMs: 260, bestMs: 250, penalties: 1 });
    expect(frames.at(-1)?.playerViews.p3).toMatchObject({ medianMs: 900, rank: 3 });
  });

  it('penalises tapping a decoy and leaves the decoy out otherwise', () => {
    const goNoGo = { title: 'Tuzak', variant: 'goNoGo' as const };
    const { state } = play([], { content: goNoGo, settings: { attempts: 3 } });
    const kinds = (state as { attempts: { kind: string }[] }).attempts.map((a) => a.kind);
    const steps: ScriptStep[] = [];
    kinds.forEach((kind, attempt) => {
      // INTRO → ARMED → GO first; afterwards the previous RESULT → ARMED, then → GO.
      steps.push(...(attempt === 0 ? [timer, timer] : [timer]));
      if (kind === 'decoy') {
        steps.push(...react('p1', attempt, 300), timer);
      } else {
        for (const id of ['p1', 'p2', 'p3']) steps.push(...react(id, attempt, 300));
      }
      steps.push(timer);
    });
    const { results } = play(steps, { content: goNoGo });
    const byId = Object.fromEntries((results ?? []).map((r) => [r.playerId, r]));
    expect(byId.p1?.breakdown).toMatchObject({ penalties: 1 });
    expect(byId.p2?.breakdown).toMatchObject({ penalties: 0, medianMs: 300 });
  });

  it('ends a skipped round with the attempts so far', () => {
    const played = play([timer, timer, ...react('p1', 0, 300)]);
    const skipped = reactionModule.onSkip?.(played.state as never, played.context() as never);
    expect(skipped?.effects).toContainEqual({ type: 'endRound' });
    const scores = reactionModule.score(skipped?.state as never, played.context() as never);
    expect(scores[0]).toMatchObject({ playerId: 'p1', points: 1000 });
    expect(
      reactionModule.onSkip?.(play([]).state as never, play([]).context() as never),
    ).toBeNull();
  });
});

describe('reaction views', () => {
  it('shows phones only their own results; the TV shows everyone’s', () => {
    const { frames } = play([
      timer,
      timer,
      ...react('p1', 0, 250),
      ...react('p2', 0, 300),
      ...react('p3', 0, 350),
    ]);
    expect(frames.at(-1)?.playerViews.p2).toEqual({
      phase: 'RESULT',
      attempt: 0,
      total: 3,
      kind: 'target',
      outcome: 'ok',
      ms: 300,
    });
    const host = frames.at(-1)?.hostView as View<ReactionHostView, 'RESULT'>;
    expect(host.results.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    const goFrame = frames.find((frame) => frame.phase === 'GO');
    expect(goFrame?.playerViews.p1 as View<ReactionPlayerView, 'GO'>).toMatchObject({
      kind: 'target',
      done: null,
    });
  });
});
