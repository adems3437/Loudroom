import type { GamePlayer } from '@loudroom/game-sdk';
import { playRound } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { UNO_DECK, cardOf, cardPoints } from './cards.js';
import { botMatch, card, cards, content, players, table } from './fixtures.test-support.js';
import { unoModule, type UnoHostView, type UnoPlayerView } from './server.js';

type Turn<T> = Extract<T, { phase: 'TURN' }>;
type End<T> = Extract<T, { phase: 'END' }>;

const reject = (playerId: string, code = 'INVALID_INPUT') => [{ type: 'reject', playerId, code }];

/** A table where p1 is to play on a red 5 with the given hands. */
function setUp(hands: Record<string, number[]>, settings: Record<string, unknown> = {}) {
  const game = table(settings);
  const filler = (count: number, from: number) =>
    cards('number', 'green').slice(from, from + count);
  game.set({
    hands: { p1: filler(3, 0), p2: filler(3, 3), p3: filler(3, 6), ...hands },
    discard: [card('number', 'red', 5)],
    color: 'red',
    turn: 0,
    direction: 1,
    drawn: null,
    pending: 0,
    called: [],
    exposed: null,
  });
  return game;
}

describe('uno deck', () => {
  it('has the 108 cards of the classic game', () => {
    expect(UNO_DECK).toHaveLength(108);
    const count = (kind: string) => UNO_DECK.filter((c) => c.kind === kind).length;
    expect(['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'].map(count)).toEqual([
      76, 8, 8, 8, 4, 4,
    ]);
    expect(cards('number', 'red', 0)).toHaveLength(1);
    expect(cards('number', 'red', 7)).toHaveLength(2);
    expect(
      [card('number', 'red', 7), card('skip', 'blue'), card('wild4')].map((id) =>
        cardPoints(cardOf(id)),
      ),
    ).toEqual([7, 20, 50]);
  });
});

describe('uno deal', () => {
  it('seats up to 10 players, deals the hands and turns up a card that is not wild', () => {
    const eleven: GamePlayer[] = Array.from({ length: 11 }, (_, i) => ({
      ...players[0],
      id: `q${i}`,
    })) as GamePlayer[];
    const game = table({ startingCards: 5 }, eleven);
    expect(game.state.seats).toHaveLength(10);
    expect(
      Object.values(game.state.hands).every((hand) => hand.length === 5 || hand.length === 7),
    ).toBe(true);
    expect(cardOf(game.state.discard[0] ?? 0).color).not.toBeNull();
    expect(game.view('q10')).toMatchObject({ hand: null, playable: [] });
    const all = [
      ...Object.values(game.state.hands).flat(),
      ...game.state.deck,
      ...game.state.discard,
    ];
    expect(new Set(all).size).toBe(108);
  });

  it('skips the match with fewer than 2 connected players', () => {
    const one = players.map((p) => ({ ...p, connected: p.id === 'p1' }));
    const { frames } = playRound(unoModule, { content, players: one, script: [] });
    expect(frames[0]).toMatchObject({ phase: 'SKIPPED', ended: true });
  });
});

describe('uno plays', () => {
  it('matches colour, number or symbol; wild colours need a colour', () => {
    const game = setUp({
      p1: [
        card('number', 'red', 2),
        card('number', 'blue', 5),
        card('number', 'blue', 7),
        card('wild'),
      ],
    });
    expect((game.view('p1') as Turn<UnoPlayerView>).playable.sort()).toEqual(
      [card('number', 'red', 2), card('number', 'blue', 5), card('wild')].sort(),
    );
    expect(game.send('p1', { type: 'play', cardId: card('number', 'blue', 7) })).toEqual(
      reject('p1'),
    );
    expect(game.send('p2', { type: 'play', cardId: game.state.hands.p2?.[0] ?? 0 })).toEqual(
      reject('p2'),
    );
    expect(game.send('p1', { type: 'play', cardId: card('wild') })).toEqual(reject('p1'));
    game.send('p1', { type: 'play', cardId: card('wild'), color: 'green' });
    expect(game.host()).toMatchObject({ color: 'green', turn: 'p2', top: { kind: 'wild' } });
  });

  it('allows +4 only without a card of the colour to follow', () => {
    const blocked = setUp({ p1: [card('wild4'), card('number', 'red', 1)] });
    expect(blocked.send('p1', { type: 'play', cardId: card('wild4'), color: 'blue' })).toEqual(
      reject('p1'),
    );
    const allowed = setUp({ p1: [card('wild4'), card('number', 'blue', 1)] });
    allowed.send('p1', { type: 'play', cardId: card('wild4'), color: 'blue' });
    // p2 draws four and is skipped.
    expect(allowed.state.hands.p2).toHaveLength(7);
    expect(allowed.host()).toMatchObject({ turn: 'p3', color: 'blue' });
  });

  it('skips, reverses and makes the next player draw two', () => {
    const skip = setUp({ p1: [card('skip', 'red'), card('number', 'red', 1)] });
    skip.send('p1', { type: 'play', cardId: card('skip', 'red') });
    expect(skip.host()).toMatchObject({ turn: 'p3' });

    const reverse = setUp({ p1: [card('reverse', 'red'), card('number', 'red', 1)] });
    reverse.send('p1', { type: 'play', cardId: card('reverse', 'red') });
    expect(reverse.host()).toMatchObject({ turn: 'p3', direction: -1 });

    const two = setUp({ p1: [card('draw2', 'red'), card('number', 'red', 1)] });
    two.send('p1', { type: 'play', cardId: card('draw2', 'red') });
    expect(two.state.hands.p2).toHaveLength(5);
    expect(two.host()).toMatchObject({ turn: 'p3', last: { kind: 'play' } });
  });

  it('turns Reverse into Skip with two players', () => {
    const game = table({}, players.slice(0, 2));
    game.set({
      hands: {
        p1: [card('reverse', 'red'), card('number', 'red', 1)],
        p2: cards('number', 'green').slice(0, 3),
      },
      discard: [card('number', 'red', 5)],
      color: 'red',
      turn: 0,
      direction: 1,
    });
    game.send('p1', { type: 'play', cardId: card('reverse', 'red') });
    expect(game.host()).toMatchObject({ turn: 'p1' });
  });

  it('stacks +2 and +4 when switched on: the next player draws the total', () => {
    const game = setUp(
      {
        p1: [card('draw2', 'red'), card('number', 'red', 1)],
        p2: [cards('draw2', 'blue')[0] ?? 0, card('number', 'green', 4)],
      },
      { stacking: true },
    );
    game.send('p1', { type: 'play', cardId: card('draw2', 'red') });
    expect(game.host()).toMatchObject({ turn: 'p2', pending: 2 });
    game.send('p2', { type: 'play', cardId: cards('draw2', 'blue')[0] ?? 0 });
    expect(game.host()).toMatchObject({ turn: 'p3', pending: 4 });
    // p3 has nothing to stack: draws all four, the turn moves on.
    game.send('p3', { type: 'draw' });
    expect(game.state.hands.p3).toHaveLength(7);
    expect(game.host()).toMatchObject({ turn: 'p1', pending: 0 });
  });
});

describe('uno drawing', () => {
  it('passes the turn after an unplayable card, or lets the drawn card be played', () => {
    const miss = setUp({});
    miss.set({
      deck: [
        card('number', 'green', 9),
        ...miss.state.deck.filter((id) => id !== card('number', 'green', 9)),
      ],
    });
    miss.send('p1', { type: 'draw' });
    expect(miss.host()).toMatchObject({ turn: 'p2', last: { kind: 'draw', count: 1 } });

    const hit = setUp({});
    const red9 = card('number', 'red', 9);
    hit.set({ deck: [red9, ...hit.state.deck.filter((id) => id !== red9)] });
    hit.send('p1', { type: 'draw' });
    expect(hit.view('p1')).toMatchObject({ drawn: red9, playable: [red9] });
    // Only the drawn card may be played now.
    expect(hit.send('p1', { type: 'draw' })).toEqual(reject('p1'));
    hit.send('p1', { type: 'play', cardId: red9 });
    expect(hit.host()).toMatchObject({ turn: 'p2', top: { id: red9 } });

    const keep = setUp({});
    keep.set({ deck: [red9, ...keep.state.deck.filter((id) => id !== red9)] });
    keep.send('p1', { type: 'draw' });
    keep.send('p1', { type: 'pass' });
    expect(keep.host()).toMatchObject({ turn: 'p2' });
    expect(keep.state.hands.p1).toContain(red9);
  });

  it('reshuffles the played cards when the draw pile runs out', () => {
    const game = setUp({});
    const played = cards('number', 'yellow').slice(0, 5);
    game.set({ deck: [], discard: [...played, card('number', 'red', 5)] });
    game.send('p1', { type: 'draw' });
    expect(game.state.discard).toEqual([card('number', 'red', 5)]);
    expect(game.state.deck).toHaveLength(4);
    expect(game.state.reshuffles).toBe(1);
  });
});

describe('uno "UNO!"', () => {
  it('lets anyone catch a player down to one card who did not say it, until the next move', () => {
    const game = setUp({ p1: [card('number', 'red', 1), card('number', 'red', 2)] });
    game.send('p1', { type: 'play', cardId: card('number', 'red', 1) });
    expect(game.view('p3')).toMatchObject({ canCatch: true });
    game.send('p3', { type: 'catch' });
    expect(game.state.hands.p1).toHaveLength(3);
    expect(game.host()).toMatchObject({ last: { kind: 'caught', playerId: 'p1', by: 'p3' } });
    // Nobody left to catch.
    expect(game.send('p2', { type: 'catch' })).toEqual(reject('p2'));
  });

  it('protects a player who says it in time, before or after playing', () => {
    const before = setUp({ p1: [card('number', 'red', 1), card('number', 'red', 2)] });
    before.send('p1', { type: 'uno' });
    before.send('p1', { type: 'play', cardId: card('number', 'red', 1) });
    expect(before.send('p2', { type: 'catch' })).toEqual(reject('p2'));
    expect(before.host()).toMatchObject({
      seats: [{ playerId: 'p1', count: 1, called: true }, {}, {}],
    });

    const after = setUp({ p1: [card('number', 'red', 1), card('number', 'red', 2)] });
    after.send('p1', { type: 'play', cardId: card('number', 'red', 1) });
    after.send('p1', { type: 'uno' });
    expect(after.send('p3', { type: 'catch' })).toEqual(reject('p3'));
  });

  it('closes the window once the next player moves', () => {
    const game = setUp({
      p1: [card('number', 'red', 1), card('number', 'red', 2)],
      p2: [card('number', 'red', 3), card('number', 'blue', 3), card('number', 'blue', 4)],
    });
    game.send('p1', { type: 'play', cardId: card('number', 'red', 1) });
    game.send('p2', { type: 'play', cardId: card('number', 'red', 3) });
    expect(game.send('p3', { type: 'catch' })).toEqual(reject('p3'));
    expect(game.send('p1', { type: 'uno' })).toEqual([]);
    expect(setUp({}).send('p1', { type: 'uno' })).toEqual(reject('p1'));
  });
});

describe('uno end', () => {
  it('ends when a hand is empty and ranks the rest by points in hand', () => {
    const game = setUp({
      p1: [card('number', 'red', 1)],
      p2: [card('wild')],
      p3: [card('number', 'blue', 9), card('number', 'blue', 8)],
    });
    expect(game.send('p1', { type: 'play', cardId: card('number', 'red', 1) })).toEqual([
      { type: 'phase', phase: 'END', durationMs: null },
      { type: 'endRound' },
    ]);
    const end = game.host() as End<UnoHostView>;
    expect(end).toMatchObject({ winner: 'p1', endedBy: 'empty' });
    expect(end.ranking.map((row) => [row.playerId, row.handPoints])).toEqual([
      ['p1', 0],
      ['p3', 17],
      ['p2', 50],
    ]);
    expect(game.score().map((r) => [r.playerId, r.points, r.correct])).toEqual([
      ['p1', 1000, true],
      ['p2', 400, false],
      ['p3', 600, false],
    ]);
  });

  it('ends on time at the next turn: the fewest points in hand wins', () => {
    const game = setUp({ p2: [card('number', 'blue', 1)] }, { matchMs: 120_000 });
    // The drawn card does not fit, so the turn moves on and the clock is checked.
    game.set({ deck: [cards('number', 'green', 9)[1] ?? 0] });
    game.wait(121_000);
    game.send('p1', { type: 'draw' });
    expect(game.host()).toMatchObject({ phase: 'END', endedBy: 'time', winner: 'p2' });
  });
});

describe('uno clock and bots', () => {
  it('plays for a present player whose time ran out, or draws and passes when set', () => {
    const auto = setUp({ p1: [card('number', 'red', 1), card('number', 'blue', 2)] });
    auto.timer();
    expect(auto.host()).toMatchObject({ turn: 'p2', top: { id: card('number', 'red', 1) } });

    const pass = setUp(
      { p1: [card('number', 'red', 1), card('number', 'blue', 2)] },
      { timeoutAction: 'drawAndPass' },
    );
    pass.timer();
    expect(pass.state.hands.p1).toHaveLength(3);
    expect(pass.host()).toMatchObject({ turn: 'p2' });
  });

  it('hands an away player’s turn to a bot at once, and gives it back on return', () => {
    const game = setUp({});
    expect(game.presence('p1', false)).toEqual([
      { type: 'phase', phase: 'TURN', durationMs: 1_500 },
    ]);
    expect(game.host()).toMatchObject({ bot: true });
    expect(game.presence('p1', true)).toEqual([
      { type: 'phase', phase: 'TURN', durationMs: 30_000 },
    ]);
    expect(game.host()).toMatchObject({ bot: false });
    // Someone else dropping out changes nothing now.
    expect(game.presence('p3', false)).toEqual([]);
    // Without bots an away player just runs out of time.
    expect(setUp({}, { bots: false }).presence('p1', false)).toEqual([]);
  });

  it('plays a whole match with bots', () => {
    const { frames, results } = playRound(unoModule, {
      content,
      players,
      settings: { startingCards: 3 },
      script: botMatch(),
    });
    expect(frames.at(-1)).toMatchObject({ phase: 'END', ended: true });
    expect(results?.filter((result) => result.correct)).toHaveLength(1);
  });
});

describe('uno views', () => {
  it('show a hand to its owner only', () => {
    const game = setUp({});
    const host = JSON.stringify(game.host());
    expect(host).not.toContain('"hand"');
    expect(host).not.toContain('"deck"');
    const p1 = game.view('p1') as Turn<UnoPlayerView>;
    expect(p1.hand?.map((c) => c.id).sort()).toEqual([...(game.state.hands.p1 ?? [])].sort());
    const p2 = JSON.stringify(game.view('p2'));
    for (const id of game.state.hands.p1 ?? []) expect(p2).not.toContain(`"id":${id},`);
  });
});
