import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, players, votes } from './fixtures.test-support.js';
import { whoWouldModule, type WhoWouldHostView, type WhoWouldPlayerView } from './server.js';

function play(script: ScriptStep[], overrides: Partial<Parameters<typeof playRound>[1]> = {}) {
  return playRound(whoWouldModule, { content, players, script, ...overrides });
}

type Reveal<T> = Extract<T, { phase: 'REVEAL' }>;

describe('who would round flow', () => {
  it('offers the connected players as options and reveals once everyone voted', () => {
    const { frames, results } = play(votes('p2', 'p3', 'p2', 'p1'));
    expect(frames.map((frame) => frame.phase)).toEqual([
      'INTRO',
      'VOTING',
      'VOTING',
      'VOTING',
      'VOTING',
      'REVEAL',
    ]);
    expect(frames[1]?.hostView).toMatchObject({ candidates: ['p1', 'p2', 'p3', 'p4'] });
    expect(results).not.toBeNull();
  });

  it('keeps a player who drops out during the round as an option', () => {
    const opened = play([{ type: 'timer' }]);
    const offline = players.map((p) => (p.id === 'p4' ? { ...p, connected: false } : p));
    const ctx = { ...opened.context(), players: offline } as never;
    const vote = whoWouldModule.onInput(
      opened.state as never,
      { playerId: 'p4' },
      { playerId: 'p1', receivedAt: opened.context().now },
      ctx,
    );
    expect(vote.effects ?? []).toEqual([]);
    expect(whoWouldModule.getHostView(vote.state, ctx)).toMatchObject({
      candidates: ['p1', 'p2', 'p3', 'p4'],
      votedCount: 1,
    });
  });

  it('does not offer players who were offline when the round began, nor wait for them', () => {
    const offline = players.map((p) => (p.id === 'p4' ? { ...p, connected: false } : p));
    const { frames, rejects } = play([{ type: 'timer' }, ...votes('p1', 'p4', 'p1').slice(1)], {
      players: offline,
    });
    expect(frames[1]?.hostView).toMatchObject({ candidates: ['p1', 'p2', 'p3'] });
    expect(rejects).toEqual([{ type: 'reject', playerId: 'p2', code: 'INVALID_INPUT' }]);
  });

  it('ends without points when fewer than 3 players are connected', () => {
    const two = players.map((p) => ({ ...p, connected: p.id === 'p1' || p.id === 'p2' }));
    const { frames, results } = play([], { players: two });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      phase: 'SKIPPED',
      ended: true,
      hostView: { phase: 'SKIPPED', minPlayers: 3 },
    });
    expect(results?.every((result) => result.points === 0 && result.correct === null)).toBe(true);
  });

  it('refuses a second vote, unknown players and, when switched off, self votes', () => {
    const twice = play([
      ...votes('p2'),
      { type: 'input', playerId: 'p1', input: { playerId: 'p3' } },
    ]);
    expect(twice.rejects).toEqual([{ type: 'reject', playerId: 'p1', code: 'ALREADY_ANSWERED' }]);

    const self = play(votes('p1', 'p2'), { settings: { allowSelfVote: false } });
    expect(self.rejects).toEqual([
      { type: 'reject', playerId: 'p1', code: 'INVALID_INPUT' },
      { type: 'reject', playerId: 'p2', code: 'INVALID_INPUT' },
    ]);
    expect(play(votes('p1')).rejects).toEqual([]);
  });
});

describe('who would scoring', () => {
  it('rewards voting for the most voted player; the winner gets nothing by default', () => {
    const { results } = play(votes('p2', 'p3', 'p2', 'p1'));
    expect(results?.map((result) => [result.playerId, result.points, result.correct])).toEqual([
      ['p1', 1000, true],
      ['p2', 0, false],
      ['p3', 1000, true],
      ['p4', 0, false],
    ]);
    expect(results?.[0]).toMatchObject({ answer: { playerId: 'p2' }, responseTimeMs: 1_000 });
  });

  it('counts any of the most voted on a tie, and pays the winners when set', () => {
    const { results } = play(votes('p2', 'p1', 'p3', 'p3'), {
      settings: { winnerPoints: 300 },
      scoreMultiplier: 2,
    });
    // p3: 2 votes, wins alone.
    expect(results?.map((result) => result.points)).toEqual([0, 0, 2000 + 600, 2000]);
    const tie = play(votes('p2', 'p1', 'p2', 'p1'), { settings: { winnerPoints: 300 } });
    expect(tie.results?.map((result) => [result.points, result.correct])).toEqual([
      [1300, true],
      [1300, true],
      [1000, true],
      [1000, true],
    ]);
  });

  it('gives nobody points when nobody voted', () => {
    const { results } = play([{ type: 'timer' }, { type: 'timer' }], {
      settings: { winnerPoints: 500 },
    });
    expect(results?.map((result) => result.points)).toEqual([0, 0, 0, 0]);
  });
});

describe('who would reveal', () => {
  it('shows only counts, winners and the title; each phone its own vote', () => {
    const { frames } = play(votes('p2', 'p3', 'p2', 'p1'));
    const host = frames.at(-1)?.hostView as Reveal<WhoWouldHostView>;
    expect(host).toMatchObject({
      title: 'Geç Kalma Şampiyonu',
      winners: ['p2'],
      distribution: [
        { playerId: 'p2', count: 2 },
        { playerId: 'p1', count: 1 },
        { playerId: 'p3', count: 1 },
        { playerId: 'p4', count: 0 },
      ],
      votedCount: 4,
    });
    expect(frames.at(-1)?.playerViews.p4 as Reveal<WhoWouldPlayerView>).toMatchObject({
      votedFor: 'p1',
      correct: false,
    });
    for (const frame of frames) {
      expect(JSON.stringify(frame.hostView)).not.toContain('votedFor');
    }
  });
});
