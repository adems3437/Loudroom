import { HOST_INPUT_SENDER, type GamePlayer, type Transition } from '@loudroom/game-sdk';
import { playRound } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { cardNumbers } from './card.js';
import { content, players } from './fixtures.test-support.js';
import {
  tombalaModule,
  type TombalaHostView,
  type TombalaInput,
  type TombalaPlayerView,
  type TombalaState,
} from './server.js';

/** Plays a round step by step, with control over the bag's order. */
function table(settings: Record<string, unknown> = {}, roster: GamePlayer[] = players) {
  const played = playRound(tombalaModule, { content, players: roster, settings, script: [] });
  let state = played.state as TombalaState;
  let now = played.context().now;
  let members = roster;
  const ctx = () => ({ ...played.context(), now, players: members }) as never;
  const apply = (transition: Transition<TombalaState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  const onHostInput = tombalaModule.onHostInput?.bind(tombalaModule);
  const onSkip = tombalaModule.onSkip?.bind(tombalaModule);
  if (!onHostInput || !onSkip) throw new Error('tombala takes host inputs and skips');
  return {
    get state() {
      return state;
    },
    /** Puts these numbers at the front of the bag, in this order. */
    drawFirst(numbers: readonly number[]) {
      state = { ...state, bag: [...numbers, ...state.bag.filter((n) => !numbers.includes(n))] };
    },
    timer: () => apply(tombalaModule.onTimer(state, ctx())),
    draw: () => apply(onHostInput(state, { type: 'draw' }, ctx())),
    send(playerId: string, input: TombalaInput, afterMs = 1_000) {
      now += afterMs;
      return apply(tombalaModule.onInput(state, input, { playerId, receivedAt: now }, ctx()));
    },
    join(player: GamePlayer) {
      members = [...members, player];
    },
    skip: () => apply(onSkip(state, ctx()) ?? { state }),
    host: () => tombalaModule.getHostView(state, ctx()),
    view: (playerId: string) => tombalaModule.getPlayerView(state, playerId, ctx()),
    score: () => tombalaModule.score(state, ctx()),
  };
}

type Table = ReturnType<typeof table>;
type Drawing<T> = Extract<T, { phase: 'DRAW' | 'CLAIM' | 'REVEAL' }>;

function row(state: TombalaState, playerId: string, index: number): number[] {
  return (state.cards[playerId]?.[index] ?? []).filter((cell): cell is number => cell !== null);
}

/** Manual mode: the host draws the given count of numbers. */
function drawMany(game: Table, count: number) {
  for (let i = 0; i < count; i++) expect(game.draw()).toMatchObject([{ phase: 'DRAW' }]);
}

const claim: TombalaInput = { type: 'claim' };

describe('tombala round flow', () => {
  it('deals every player a card and shuffles all 90 numbers into the bag', () => {
    const { state } = table();
    expect(Object.keys(state.cards)).toEqual(['p1', 'p2', 'p3']);
    expect(new Set(state.bag).size).toBe(90);
    expect([...state.bag].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 90 }, (_, i) => i + 1),
    );
  });

  it('draws on a timer in auto mode, and when the host says so in manual mode', () => {
    const auto = table();
    expect(auto.timer()).toEqual([{ type: 'phase', phase: 'DRAW', durationMs: 6_000 }]);
    expect(auto.timer()).toEqual([{ type: 'phase', phase: 'DRAW', durationMs: 6_000 }]);
    expect(auto.state.drawn).toHaveLength(2);
    // "Draw now" without waiting.
    auto.draw();
    expect(auto.state.drawn).toHaveLength(3);

    const manual = table({ drawMode: 'manual' });
    expect(manual.timer()).toEqual([{ type: 'phase', phase: 'DRAW', durationMs: null }]);
    manual.draw();
    expect(manual.state.drawn).toHaveLength(2);
    expect(manual.host()).toMatchObject({ phase: 'DRAW', remaining: 88 });
  });

  it('ends with the reveal when the bag runs out', () => {
    const game = table({ drawMode: 'manual' });
    drawMany(game, 90);
    expect(game.draw()).toEqual([
      { type: 'phase', phase: 'REVEAL', durationMs: null },
      { type: 'endRound' },
    ]);
  });

  it('skips the round without points when fewer than 2 players are connected', () => {
    const one = players.map((player) => ({ ...player, connected: player.id === 'p1' }));
    const { frames, results } = playRound(tombalaModule, { content, players: one, script: [] });
    expect(frames[0]).toMatchObject({ phase: 'SKIPPED', ended: true });
    expect(results?.every((result) => result.points === 0)).toBe(true);
  });

  it('deals a late joiner a card with the next draw', () => {
    const game = table();
    game.timer();
    const late = { id: 'p4', nickname: 'Can', avatar: 'sun', color: '#fff', connected: true };
    game.join(late);
    expect(game.view('p4')).toMatchObject({ card: null });
    game.timer();
    const card = game.state.cards.p4;
    expect(card).toBeDefined();
    const others = ['p1', 'p2', 'p3'].map((id) => cardNumbers(game.state.cards[id] ?? []).join());
    expect(others).not.toContain(cardNumbers(card ?? []).join());
    // Numbers drawn before the card came can still be marked.
    const early = game.state.drawn.find((n) => cardNumbers(card ?? []).includes(n));
    if (early !== undefined) {
      expect(game.send('p4', { type: 'mark', number: early, marked: true })).toEqual([]);
    }
  });
});

describe('tombala marking', () => {
  it('marks drawn numbers of the own card only, and unmarks', () => {
    const game = table({ drawMode: 'manual' });
    const mine = row(game.state, 'p1', 0);
    const notMine = Array.from({ length: 90 }, (_, i) => i + 1).find(
      (n) => !cardNumbers(game.state.cards.p1 ?? []).includes(n),
    );
    game.drawFirst([mine[0] ?? 0, notMine ?? 0]);
    game.draw();
    game.draw();
    const reject = [{ type: 'reject', playerId: 'p1', code: 'INVALID_INPUT' }];
    expect(game.send('p1', { type: 'mark', number: mine[1] ?? 0, marked: true })).toEqual(reject);
    expect(game.send('p1', { type: 'mark', number: notMine ?? 0, marked: true })).toEqual(reject);
    expect(game.send('p1', { type: 'mark', number: mine[0] ?? 0, marked: true })).toEqual([]);
    expect(game.view('p1')).toMatchObject({ marked: [mine[0]] });
    expect(game.view('p2')).toMatchObject({ marked: [] });
    game.send('p1', { type: 'mark', number: mine[0] ?? 0, marked: false });
    expect(game.view('p1')).toMatchObject({ marked: [] });
  });

  it('marks drawn numbers by itself with auto marking, and refuses manual marks', () => {
    const game = table({ drawMode: 'manual', autoMark: true });
    const mine = row(game.state, 'p1', 0);
    game.drawFirst(mine.slice(0, 2));
    game.draw();
    game.draw();
    expect((game.view('p1') as Drawing<TombalaPlayerView>).marked.sort()).toEqual(
      mine.slice(0, 2).sort(),
    );
    expect(game.send('p1', { type: 'mark', number: mine[0] ?? 0, marked: false })).toEqual([
      { type: 'reject', playerId: 'p1', code: 'INVALID_INPUT' },
    ]);
  });
});

describe('tombala prizes', () => {
  it('checks a call against the drawn numbers, even unmarked ones', () => {
    const game = table({ drawMode: 'manual' });
    game.drawFirst(row(game.state, 'p1', 1));
    drawMany(game, 5);
    expect(game.send('p1', claim)).toEqual([{ type: 'phase', phase: 'CLAIM', durationMs: 4_000 }]);
    expect(game.host()).toMatchObject({
      phase: 'CLAIM',
      claim: { prize: 'firstLine', winners: ['p1'] },
    });
    expect(game.view('p1')).toMatchObject({ myPrizes: ['firstLine'], nextPrize: 'secondLine' });
  });

  it('shares a prize among everyone who calls it before the next number', () => {
    const game = table({ drawMode: 'manual' });
    const p1 = row(game.state, 'p1', 0);
    const p2 = row(game.state, 'p2', 0);
    game.drawFirst([...new Set([...p1, ...p2])]);
    drawMany(game, new Set([...p1, ...p2]).size);
    game.send('p1', claim);
    // Already stopped for this draw: the clock is not restarted.
    expect(game.send('p2', claim)).toEqual([]);
    expect(game.host()).toMatchObject({ claim: { prize: 'firstLine', winners: ['p1', 'p2'] } });
    // Drawing goes on after the pause; the host cannot cut it short.
    expect(game.draw()).toEqual([
      { type: 'reject', playerId: HOST_INPUT_SENDER, code: 'ROUND_CLOSED' },
    ]);
    expect(game.timer()).toEqual([{ type: 'phase', phase: 'DRAW', durationMs: null }]);
  });

  it('refuses a call that comes after the next number without a penalty', () => {
    const game = table({ drawMode: 'manual' });
    const p1 = row(game.state, 'p1', 0);
    const p2 = row(game.state, 'p2', 0);
    game.drawFirst([...new Set([...p1, ...p2])]);
    drawMany(game, new Set([...p1, ...p2]).size);
    game.send('p1', claim);
    game.timer();
    game.draw();
    expect(game.send('p2', claim)).toEqual([
      { type: 'reject', playerId: 'p2', code: 'ROUND_CLOSED' },
    ]);
    expect(game.view('p2')).toMatchObject({ lockedDraws: 0, falseClaims: 0 });
  });

  it('locks a wrong caller for some draws, and takes points off when set', () => {
    const game = table({ drawMode: 'manual', falseClaimPenalty: 100 });
    game.timer();
    expect(game.send('p2', claim)).toEqual([]);
    expect(game.view('p2')).toMatchObject({ lockedDraws: 3, falseClaims: 1 });
    expect(game.send('p2', claim)).toEqual([
      { type: 'reject', playerId: 'p2', code: 'INVALID_INPUT' },
    ]);
    drawMany(game, 3);
    expect(game.view('p2')).toMatchObject({ lockedDraws: 0 });
    game.send('p2', claim);
    expect(game.skip()).toContainEqual({ type: 'endRound' });
    const p2 = game.score().find((result) => result.playerId === 'p2');
    expect(p2).toMatchObject({ points: -200, correct: false, breakdown: { penalty: -200 } });
  });

  it('ends the round with "Tombala!" after its pause, and scores every prize', () => {
    const game = table({ drawMode: 'manual' }, players);
    game.drawFirst(cardNumbers(game.state.cards.p1 ?? []));
    drawMany(game, 15);
    game.send('p1', claim, 2_000);
    game.send('p1', claim);
    expect(game.view('p1')).toMatchObject({ myPrizes: ['firstLine', 'secondLine'] });
    game.send('p1', claim);
    expect(game.host()).toMatchObject({ claim: { prize: 'tombala', winners: ['p1'] } });
    expect(game.timer()).toEqual([
      { type: 'phase', phase: 'REVEAL', durationMs: null },
      { type: 'endRound' },
    ]);
    expect(game.score()[0]).toMatchObject({
      playerId: 'p1',
      points: 2_100,
      correct: true,
      breakdown: { firstLine: 300, secondLine: 600, tombala: 1_200, penalty: 0 },
    });
    expect(game.score()[1]).toMatchObject({ points: 0, correct: false });
  });

  it('keeps the prizes won so far when the host skips', () => {
    const game = table({ drawMode: 'manual' });
    game.drawFirst(row(game.state, 'p3', 2));
    drawMany(game, 5);
    game.send('p3', claim);
    expect(game.skip()).toEqual([
      { type: 'phase', phase: 'REVEAL', durationMs: null },
      { type: 'endRound' },
    ]);
    expect(game.score().map((result) => result.points)).toEqual([0, 0, 300]);
  });
});

describe('tombala views', () => {
  it('never show the bag nor other players’ cards', () => {
    const game = table();
    game.timer();
    game.timer();
    const host = game.host() as Drawing<TombalaHostView>;
    expect(host.drawn).toEqual(game.state.drawn);
    expect(JSON.stringify(host)).not.toContain('bag');
    expect(JSON.stringify(host)).not.toContain('card');
    const p1 = JSON.stringify(game.view('p1'));
    expect(p1).toContain(JSON.stringify(game.state.cards.p1));
    expect(p1).not.toContain(JSON.stringify(game.state.cards.p2));
    expect(p1).not.toContain(JSON.stringify(game.state.bag.slice(0, 3)).slice(1, -1));
  });
});
