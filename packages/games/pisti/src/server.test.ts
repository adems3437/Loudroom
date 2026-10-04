import { playRound } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, id, oneDeal, players, table } from './fixtures.test-support.js';
import {
  botCard,
  pistiModule,
  type PistiHostView,
  type PistiPlayerView,
  type PistiState,
} from './server.js';

type Turn<T> = Extract<T, { phase: 'TURN' }>;
type Tally<T> = Extract<T, { phase: 'TALLY' }>;

const reject = (playerId: string, code = 'INVALID_INPUT') => [{ type: 'reject', playerId, code }];

/** p1 to play with the given hands and table; the rest of the deck as dealt. */
function setUp(patch: Partial<PistiState>, settings: Record<string, unknown> = {}) {
  const game = table({ targetPoints: 0, maxDeals: 1, ...settings });
  game.set({ turn: 0, hidden: 0, lastCapture: null, pistis: [], ...patch });
  return game;
}

describe('pisti deal', () => {
  it('lays four cards on the table, three face down, and deals four to each hand', () => {
    const game = table();
    const { state } = game;
    expect(state.pile).toHaveLength(4);
    expect(state.hidden).toBe(3);
    expect(Object.values(state.hands).map((hand) => hand.length)).toEqual([4, 4]);
    expect(state.deck).toHaveLength(40);
    const host = game.host() as Turn<PistiHostView>;
    expect(host.pile).toMatchObject({ count: 4, hidden: 3 });
    expect(host.pile.visible).toHaveLength(1);
  });

  it('deals again when the hands are empty, until the deck is out', () => {
    const { frames } = playRound(pistiModule, {
      content,
      players: players.slice(0, 2),
      settings: { maxDeals: 1, targetPoints: 0 },
      script: oneDeal(),
    });
    const phases = frames.map((frame) => frame.phase);
    // 48 cards in hand: 48 turns, then the score, then the end.
    expect(phases.filter((phase) => phase === 'TURN')).toHaveLength(48);
    expect(phases.slice(-2)).toEqual(['TALLY', 'END']);
  });

  it('seats at most four; with four, partners sit opposite', () => {
    const five = [...players, { ...players[0], id: 'p5' }] as typeof players;
    const game = table({}, five);
    expect(game.state.seats).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(game.state.teams).toBe(true);
    expect(game.view('p5')).toMatchObject({ hand: null, mySide: null });
    expect((game.host() as Turn<PistiHostView>).sides.map((side) => side.players)).toEqual([
      ['p1', 'p3'],
      ['p2', 'p4'],
    ]);
    expect(table({ teams: false }, players).state.teams).toBe(false);
  });

  it('skips the match with fewer than 2 connected players', () => {
    const one = players.map((p) => ({ ...p, connected: p.id === 'p1' }));
    const { frames } = playRound(pistiModule, { content, players: one, script: [] });
    expect(frames[0]).toMatchObject({ phase: 'SKIPPED', ended: true });
  });
});

describe('pisti plays', () => {
  it('takes the pile with the same rank or a Jack, otherwise adds to it', () => {
    const same = setUp({
      pile: [id('H', 4), id('S', 9)],
      hands: { p1: [id('C', 9), id('D', 2)], p2: [id('H', 3)] },
    });
    same.send('p1', { type: 'play', cardId: id('C', 9) });
    expect(same.state.captured[0]).toEqual([id('H', 4), id('S', 9), id('C', 9)]);
    expect(same.host()).toMatchObject({ last: { captured: true, pisti: null }, turn: 'p2' });

    const jack = setUp({
      pile: [id('H', 4), id('S', 9)],
      hands: { p1: [id('C', 11)], p2: [id('H', 3)] },
    });
    jack.send('p1', { type: 'play', cardId: id('C', 11) });
    expect(jack.state.captured[0]).toHaveLength(3);

    const miss = setUp({ pile: [id('S', 9)], hands: { p1: [id('C', 5)], p2: [id('H', 3)] } });
    miss.send('p1', { type: 'play', cardId: id('C', 5) });
    expect(miss.state.pile).toEqual([id('S', 9), id('C', 5)]);
  });

  it('scores a pişti on a single card, a Jack pişti on a single Jack', () => {
    const pisti = setUp({ pile: [id('S', 9)], hands: { p1: [id('C', 9)], p2: [id('H', 3)] } });
    pisti.send('p1', { type: 'play', cardId: id('C', 9) });
    expect(pisti.state.pistis).toEqual([{ side: 0, kind: 'normal' }]);

    const jackPisti = setUp({
      pile: [id('S', 11)],
      hands: { p1: [id('C', 11)], p2: [id('H', 3)] },
    });
    jackPisti.send('p1', { type: 'play', cardId: id('C', 11) });
    expect(jackPisti.state.pistis).toEqual([{ side: 0, kind: 'jack' }]);

    // A Jack on a single other card takes it, but is no pişti.
    const plain = setUp({ pile: [id('S', 4)], hands: { p1: [id('C', 11)], p2: [id('H', 3)] } });
    plain.send('p1', { type: 'play', cardId: id('C', 11) });
    expect(plain.state.pistis).toEqual([]);
    expect(plain.state.captured[0]).toHaveLength(2);
  });

  it('refuses cards out of turn or not in hand', () => {
    const game = setUp({ hands: { p1: [id('C', 9)], p2: [id('H', 3)] } });
    expect(game.send('p2', { type: 'play', cardId: id('H', 3) })).toEqual(reject('p2'));
    expect(game.send('p1', { type: 'play', cardId: id('H', 3) })).toEqual(reject('p1'));
  });
});

describe('pisti scoring', () => {
  it('gives the table to the last taker and scores the deal', () => {
    // p1 took the ♣2 and ♦10 earlier; the last card goes down, the rest goes to p1.
    const game = setUp({
      deck: [],
      pile: [id('H', 5)],
      captured: [[id('C', 2), id('D', 10), id('S', 1), id('H', 7)], [id('S', 3)]],
      pistis: [{ side: 0, kind: 'normal' }],
      lastCapture: 0,
      hands: { p1: [], p2: [id('S', 12)] },
      turn: 1,
    });
    expect(game.send('p2', { type: 'play', cardId: id('S', 12) })).toEqual([
      { type: 'phase', phase: 'TALLY', durationMs: 6_000 },
    ]);
    const tally = (game.host() as Tally<PistiHostView>).tally;
    // Side 0: 6 cards (most: 3), A + ♣2 + ♦10 = 6, one pişti 10.
    expect(tally[0]).toMatchObject({ cards: 6, mostCards: 3, cardPoints: 6, pistis: 1, total: 19 });
    expect(tally[1]).toMatchObject({ cards: 1, mostCards: 0, total: 0 });
    expect(game.state.scores).toEqual([19, 0]);
    // One deal was asked for: the match ends.
    expect(game.timer()).toEqual([
      { type: 'phase', phase: 'END', durationMs: null },
      { type: 'endRound' },
    ]);
    expect(game.score().map((r) => [r.playerId, r.points, r.correct])).toEqual([
      ['p1', 190, true],
      ['p2', 0, false],
    ]);
  });

  it('gives nobody the 3 for most cards on a tie', () => {
    const game = setUp({
      deck: [],
      pile: [],
      captured: [[id('S', 4)], [id('S', 5)]],
      lastCapture: 1,
      hands: { p1: [id('H', 6)], p2: [] },
    });
    game.send('p1', { type: 'play', cardId: id('H', 6) });
    // The ♥6 goes to side 1, the last taker: 2 cards against 1.
    expect((game.host() as Tally<PistiHostView>).tally.map((row) => row.mostCards)).toEqual([0, 3]);
    const tie = setUp({
      deck: [],
      pile: [],
      captured: [[id('S', 4)], [id('S', 5)]],
      lastCapture: null,
      hands: { p1: [id('H', 6)], p2: [] },
    });
    tie.send('p1', { type: 'play', cardId: id('H', 6) });
    expect((tie.host() as Tally<PistiHostView>).tally.map((row) => row.mostCards)).toEqual([0, 0]);
  });

  it('plays another deal until a side reaches the target', () => {
    const game = table({ targetPoints: 50, maxDeals: 0 });
    game.set({ phase: 'TALLY', scores: [30, 20] });
    expect(game.timer()).toEqual([{ type: 'phase', phase: 'TURN', durationMs: 20_000 }]);
    expect(game.state.deal).toBe(2);
    // The second deal starts one seat further.
    expect(game.host()).toMatchObject({ turn: 'p2' });
    game.set({ phase: 'TALLY', scores: [55, 20] });
    expect(game.timer()).toContainEqual({ type: 'endRound' });
  });

  it('shares the points between partners and breaks ties on cards', () => {
    const game = table({ targetPoints: 50 }, players);
    game.set({ phase: 'END', scores: [60, 60], totalCards: [27, 25] });
    expect(game.host()).toMatchObject({ winners: [0] });
    expect(game.score().map((r) => [r.playerId, r.points, r.correct])).toEqual([
      ['p1', 600, true],
      ['p2', 600, false],
      ['p3', 600, true],
      ['p4', 600, false],
    ]);
  });
});

describe('pisti clock and bots', () => {
  it('takes with the same rank, then a Jack on two or more, else throws the cheapest card', () => {
    const base = {
      turn: 0,
      hands: { p1: [id('S', 11), id('H', 9), id('C', 2), id('D', 6)], p2: [] },
    };
    const game = setUp({ ...base, pile: [id('C', 9)] });
    expect(botCard(game.state, 'p1')).toBe(id('H', 9));
    game.set({ pile: [id('C', 4), id('C', 8)] });
    expect(botCard(game.state, 'p1')).toBe(id('S', 11));
    game.set({ pile: [id('C', 4)] });
    expect(botCard(game.state, 'p1')).toBe(id('D', 6));
  });

  it('throws a card for a player whose time ran out, and lets a bot play for an away one', () => {
    const game = setUp({
      pile: [id('C', 9)],
      hands: { p1: [id('H', 9), id('D', 6)], p2: [id('S', 3)] },
    });
    game.timer();
    expect(game.state.captured[0]).toHaveLength(2);
    expect(game.presence('p2', false)).toEqual([
      { type: 'phase', phase: 'TURN', durationMs: 1_500 },
    ]);
    expect(game.host()).toMatchObject({ bot: true, turn: 'p2' });
    expect(game.presence('p2', true)).toEqual([
      { type: 'phase', phase: 'TURN', durationMs: 20_000 },
    ]);
  });
});

describe('pisti views', () => {
  it('show a hand to its owner only, and never the face-down table cards', () => {
    const game = table();
    const host = JSON.stringify(game.host());
    for (const card of game.state.hands.p1 ?? []) expect(host).not.toContain(`"id":${card},`);
    for (const card of game.state.pile.slice(0, 3)) expect(host).not.toContain(`"id":${card},`);
    const p2 = game.view('p2') as Turn<PistiPlayerView>;
    expect(p2.hand?.map((card) => card.id).sort()).toEqual([...(game.state.hands.p2 ?? [])].sort());
    expect(JSON.stringify(p2)).not.toContain(`"id":${game.state.hands.p1?.[0] ?? -1},`);
  });
});
