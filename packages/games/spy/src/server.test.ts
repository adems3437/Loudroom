import type { GamePlayer, Transition } from '@loudroom/game-sdk';
import { playRound } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import {
  catchTheSpy,
  content,
  createdState,
  players,
  round,
  spy,
  town,
  voteAround,
} from './fixtures.test-support.js';
import { spyModule, type SpyInput, type SpyPlayerView, type SpyState } from './server.js';

/** Plays a round step by step from the talk on, with control over who is connected. */
function table(settings: Record<string, unknown> = {}, roster: GamePlayer[] = players) {
  const played = playRound(spyModule, {
    content,
    players: roster,
    settings,
    script: [{ type: 'timer' }],
  });
  let state = played.state as SpyState;
  let members = roster;
  const ctx = () => ({ ...played.context(), players: members }) as never;
  const apply = (transition: Transition<SpyState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  return {
    get state() {
      return state;
    },
    set(patch: Partial<SpyState>) {
      state = { ...state, ...patch };
    },
    disconnect(id: string) {
      members = members.map((p) => (p.id === id ? { ...p, connected: false } : p));
    },
    timer: () => apply(spyModule.onTimer(state, ctx())),
    send: (playerId: string, input: SpyInput) =>
      apply(spyModule.onInput(state, input, { playerId, receivedAt: Date.now() }, ctx())),
    host: () => spyModule.getHostView(state, ctx()),
    view: (playerId: string) => spyModule.getPlayerView(state, playerId, ctx()),
    score: () => spyModule.score(state, ctx()),
  };
}

const reject = (playerId: string, code: string) => [{ type: 'reject', playerId, code }];
const ids = players.map((player) => player.id);

describe('spy roles', () => {
  it('picks one spy, two from the set number of players', () => {
    expect(createdState().spies).toHaveLength(1);
    const eight = Array.from(
      { length: 8 },
      (_, i) => ({ ...players[0], id: `q${i}` }) as GamePlayer,
    );
    expect(createdState({}, eight).spies).toHaveLength(2);
    expect(createdState({ twoSpiesFrom: 0 }, eight).spies).toHaveLength(1);
    expect(createdState({ twoSpiesFrom: 5 }).spies).toHaveLength(2);
  });

  it('shows the place to everyone but the spy', () => {
    const game = table();
    expect(game.view(spy)).toMatchObject({ role: { spy: true } });
    const place = content.locations.find((location) => location.id === game.state.locationId);
    for (const id of town)
      expect(game.view(id)).toMatchObject({ role: { spy: false, location: place } });
    expect(JSON.stringify(game.view(spy))).not.toContain('"location"');
    expect(JSON.stringify(game.host())).not.toContain('"location"');
  });

  it('tells nobody but the spy who the spy is: the other views do not depend on it', () => {
    const game = table();
    const [a = '', b = '', c = ''] = town;
    game.set({ spies: [a] });
    const first = { host: game.host(), c: game.view(c) };
    game.set({ spies: [b] });
    expect({ host: game.host(), c: game.view(c) }).toEqual(first);
  });

  it('skips the round with fewer than 4 connected players', () => {
    const three = players.map((p, i) => ({ ...p, connected: i < 3 }));
    const { frames, results } = playRound(spyModule, { content, players: three, script: [] });
    expect(frames[0]).toMatchObject({ phase: 'SKIPPED', ended: true });
    expect(results?.every((result) => result.points === 0)).toBe(true);
  });

  it('lets a player who joins during the round watch, without a role or points', () => {
    const late = { id: 'p6', nickname: 'Ece', avatar: 'leaf', color: '#fff', connected: true };
    const game = table({}, [...players, late]);
    game.set({ roster: ids });
    expect(game.view('p6')).toMatchObject({ role: null });
    expect(game.send('p6', { type: 'requestVote', value: true })).toEqual(
      reject('p6', 'INVALID_INPUT'),
    );
  });
});

describe('spy talk', () => {
  it('passes the turn to whoever was asked; no asking straight back', () => {
    const game = table();
    const asker = game.state.asker;
    const [first = '', second = ''] = ids.filter((id) => id !== asker);
    expect(game.send(first, { type: 'ask', playerId: second })).toEqual(
      reject(first, 'INVALID_INPUT'),
    );
    expect(game.send(asker, { type: 'ask', playerId: asker })).toEqual(
      reject(asker, 'INVALID_INPUT'),
    );
    expect(game.send(asker, { type: 'ask', playerId: first })).toEqual([]);
    expect(game.host()).toMatchObject({
      asker: first,
      askedBy: asker,
      lastAsk: { from: asker, to: first },
    });
    expect(game.send(first, { type: 'ask', playerId: asker })).toEqual(
      reject(first, 'INVALID_INPUT'),
    );
    expect(game.send(first, { type: 'ask', playerId: second })).toEqual([]);
  });

  it('lets anyone carry on when the asker dropped out, and never asks someone offline', () => {
    const game = table();
    const asker = game.state.asker;
    const [other = '', third = ''] = ids.filter((id) => id !== asker);
    game.disconnect(asker);
    expect(game.send(other, { type: 'ask', playerId: asker })).toEqual(
      reject(other, 'INVALID_INPUT'),
    );
    expect(game.send(other, { type: 'ask', playerId: third })).toEqual([]);
    expect(game.host()).toMatchObject({ asker: third });
  });

  it('starts the vote early once more than half of the connected players ask for it', () => {
    const game = table();
    expect(game.send('p1', { type: 'requestVote', value: true })).toEqual([]);
    expect(game.send('p2', { type: 'requestVote', value: true })).toEqual([]);
    expect(game.send('p2', { type: 'requestVote', value: false })).toEqual([]);
    expect(game.host()).toMatchObject({ voteRequests: 1, votesNeeded: 3 });
    game.disconnect('p5');
    game.disconnect('p4');
    // 3 connected: 2 requests are a majority.
    expect(game.send('p3', { type: 'requestVote', value: true })).toEqual([
      { type: 'phase', phase: 'VOTE', durationMs: 30_000 },
    ]);
  });

  it('moves from the talk to the vote when the time is up', () => {
    const game = table();
    expect(game.timer()).toEqual([{ type: 'phase', phase: 'VOTE', durationMs: 30_000 }]);
    expect(game.send('p1', { type: 'ask', playerId: 'p2' })).toEqual(reject('p1', 'ROUND_CLOSED'));
  });
});

describe('spy vote and guess', () => {
  it('catches the spy when the spy alone gets the most votes', () => {
    const { frames, results } = playRound(spyModule, {
      content,
      players,
      script: round(...catchTheSpy),
    });
    expect(frames.at(-1)).toMatchObject({ phase: 'REVEAL', ended: true });
    expect(frames.at(-1)?.hostView).toMatchObject({ outcome: 'caught', spies: [spy] });
    for (const result of results ?? []) {
      const expected = result.playerId === spy ? 0 : 750;
      expect([result.playerId, result.points, result.correct]).toEqual([
        result.playerId,
        expected,
        result.playerId !== spy,
      ]);
    }
  });

  it('lets the spy escape when the vote misses or ties', () => {
    const missed = playRound(spyModule, { content, players, script: round(...voteAround) });
    expect(missed.frames.at(-1)?.hostView).toMatchObject({ outcome: 'escaped' });
    expect(missed.results?.find((r) => r.playerId === spy)).toMatchObject({
      points: 1_000,
      correct: true,
    });
    expect(missed.results?.find((r) => r.playerId !== spy)).toMatchObject({
      points: 0,
      correct: false,
    });

    const game = table();
    game.timer();
    const [a = ''] = town;
    game.send(a, { type: 'vote', playerId: spy });
    game.send(spy, { type: 'vote', playerId: a });
    game.timer();
    // One vote each: a tie catches nobody.
    expect(game.host()).toMatchObject({ phase: 'REVEAL', outcome: 'escaped' });
  });

  it('refuses votes for oneself and second votes', () => {
    const game = table();
    game.timer();
    expect(game.send('p1', { type: 'vote', playerId: 'p1' })).toEqual(
      reject('p1', 'INVALID_INPUT'),
    );
    game.send('p1', { type: 'vote', playerId: 'p2' });
    expect(game.send('p1', { type: 'vote', playerId: 'p3' })).toEqual(
      reject('p1', 'ALREADY_ANSWERED'),
    );
    expect((game.view('p1') as Extract<SpyPlayerView, { phase: 'VOTE' }>).votedFor).toBe('p2');
  });

  it('ends the round when the spy names the place: right wins, wrong loses', () => {
    const right = table();
    expect(
      right.send(town[0] ?? '', { type: 'guess', locationId: right.state.locationId }),
    ).toEqual(reject(town[0] ?? '', 'INVALID_INPUT'));
    expect(right.send(spy, { type: 'guess', locationId: right.state.locationId })).toContainEqual({
      type: 'endRound',
    });
    expect(right.host()).toMatchObject({
      outcome: 'guessed',
      guess: { playerId: spy, correct: true },
    });
    expect(right.score().find((r) => r.playerId === spy)).toMatchObject({ points: 1_500 });

    const wrong = table();
    wrong.timer(); // during the vote too
    const other = content.locations.find((l) => l.id !== wrong.state.locationId)?.id ?? '';
    wrong.send(spy, { type: 'guess', locationId: other });
    expect(wrong.host()).toMatchObject({ outcome: 'wrongGuess' });
    expect(wrong.score().map((r) => r.points)).toEqual(ids.map((id) => (id === spy ? 0 : 500)));
  });

  it('pays both spies when one of two names the place', () => {
    const game = table({ twoSpiesFrom: 5 });
    const [first = '', second = ''] = game.state.spies;
    game.send(first, { type: 'guess', locationId: game.state.locationId });
    const points = Object.fromEntries(game.score().map((r) => [r.playerId, r.points]));
    expect([points[first], points[second]]).toEqual([1_500, 1_000]);
  });

  it('shows each phone whether it won', () => {
    const { frames } = playRound(spyModule, { content, players, script: round(...catchTheSpy) });
    const last = frames.at(-1)?.playerViews ?? {};
    expect(last[spy]).toMatchObject({ won: false });
    expect(last[town[0] ?? '']).toMatchObject({ won: true });
  });
});
