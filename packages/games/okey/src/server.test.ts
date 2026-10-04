import { HOST_INPUT_SENDER } from '@loudroom/game-sdk';
import { describe, expect, it } from 'vitest';
import { FAKE, players, slots, t, table } from './fixtures.test-support.js';
import { OKEY_DEFAULT_SETTINGS, okeyModule, tilesOf, type OkeyState } from './server.js';

const CHOICE = { hands: 4, startPoints: 20, teams: false };
/** Indicator black 12: the okey is black 13. */
const INDICATOR = t('black', 12);
const OKEY = t('black', 13);

/** 14 tiles that finish with sets and runs (no okey among them). */
const WIN = [
  t('red', 1),
  t('red', 2),
  t('red', 3),
  t('red', 4),
  t('blue', 7),
  t('yellow', 7),
  t('black', 7),
  t('red', 7),
  t('yellow', 10),
  t('yellow', 11),
  t('yellow', 12),
  t('blue', 2),
  t('black', 2),
  t('yellow', 2),
];
/** Seven pairs. */
const PAIRS = [
  t('red', 4),
  t('red', 4, 1),
  t('blue', 9),
  t('blue', 9, 1),
  t('black', 11),
  t('black', 11, 1),
  t('yellow', 7),
  t('yellow', 7, 1),
  t('red', 11),
  t('red', 11, 1),
  t('blue', 1),
  t('blue', 1, 1),
  t('black', 6),
  t('black', 6, 1),
];

function started(settings: Record<string, unknown> = {}, roster = players.slice(0, 2)) {
  const game = table(settings, roster);
  game.start(CHOICE);
  return game;
}

/** The current seat holds `rack` (its 15th tile drawn) under the black-13 okey. */
function holding(game: ReturnType<typeof table>, rack: number[]) {
  game.set({
    indicator: INDICATOR,
    drew: true,
    racks: { ...game.state.racks, [game.turn]: slots(rack) },
  });
  return game.turn;
}

describe('okey setup', () => {
  it('fills the empty seats with bots and waits for the TV', () => {
    const game = table();
    expect(game.state.phase).toBe('SETUP');
    expect(game.state.seats).toEqual(['p1', 'p2', 'bot:1', 'bot:2']);
    expect(game.host()).toEqual({
      phase: 'SETUP',
      title: 'Okey',
      seats: [
        { id: 'p1', bot: null },
        { id: 'p2', bot: null },
        { id: 'bot:1', bot: 1 },
        { id: 'bot:2', bot: 2 },
      ],
      defaults: { hands: 4, startPoints: 20, teams: false },
    });
    expect(game.send('p1', { type: 'draw' })).toEqual([
      { type: 'reject', playerId: 'p1', code: 'ROUND_CLOSED' },
    ]);
  });

  it("deals with the TV's choices, or with the defaults when time runs out", () => {
    const chosen = table();
    chosen.start({ hands: 2, startPoints: 10, teams: true });
    expect(chosen.state).toMatchObject({ phase: 'TURN', hands: 2, teams: true, points: [10, 10] });
    expect(chosen.start(CHOICE)).toEqual([
      { type: 'reject', playerId: HOST_INPUT_SENDER, code: 'ROUND_CLOSED' },
    ]);

    const waited = table({ hands: 1, startPoints: 10 });
    waited.timer();
    expect(waited.state).toMatchObject({ phase: 'TURN', hands: 1, points: [10, 10, 10, 10] });
  });

  it('skips with fewer than two players', () => {
    const game = table({}, players.slice(0, 1));
    expect(game.state.phase).toBe('SKIPPED');
  });

  it('seats four players and lets the rest watch', () => {
    const roster = [
      ...players,
      { id: 'p5', nickname: 'Can', avatar: 'sun', color: '#000', connected: true },
    ];
    const game = started({}, roster);
    expect(game.state.seats).toEqual(['p1', 'p2', 'p3', 'p4']);
    const watcher = game.view('p5');
    expect(watcher.phase === 'TURN' && watcher.rack).toBeNull();
  });
});

describe('okey deal and turns', () => {
  it('turns up an indicator, deals 15 to the starter and 14 to the others', () => {
    const game = started();
    const { state } = game;
    expect(state.seats.map((seat) => game.rack(seat).length)).toEqual(
      state.seats.map((_, seat) => (seat === state.starter ? 15 : 14)),
    );
    expect(state.deck).toHaveLength(48);
    const all = [state.indicator, ...state.deck, ...state.seats.flatMap((seat) => game.rack(seat))];
    expect(new Set(all).size).toBe(106);
    expect(state.indicator).toBeLessThan(FAKE);
    // The starter discards without drawing.
    expect(state.turn).toBe(state.starter);
    expect(state.drew).toBe(true);
  });

  it('draws or takes the left tile, then discards to the right', () => {
    const game = started();
    const starter = game.turn;
    const thrown = game.rack(starter)[0] ?? 0;
    game.send(starter, { type: 'discard', tile: thrown });
    const next = game.turn;
    expect(next).not.toBe(starter);
    expect(game.host()).toMatchObject({ phase: 'TURN', turn: next, drew: false });

    // Nothing to discard yet; then take the tile the starter threw.
    expect(game.send(next, { type: 'discard', tile: game.rack(next)[0] ?? 0 })).toEqual([
      { type: 'reject', playerId: next, code: 'INVALID_INPUT' },
    ]);
    game.send(next, { type: 'take', slot: 29 });
    expect(game.state.racks[next]?.[29]).toBe(thrown);
    expect(game.state.discards[starter]).toEqual([]);
    expect(game.send(next, { type: 'draw' })).toEqual([
      { type: 'reject', playerId: next, code: 'INVALID_INPUT' },
    ]);
    game.send(next, { type: 'discard', tile: thrown });
    expect(game.state.discards[next]).toEqual([thrown]);

    // The third seat draws from the middle.
    const third = game.turn;
    game.send(third, { type: 'draw' });
    expect(game.state.deck).toHaveLength(47);
    expect(game.rack(third)).toHaveLength(15);
  });

  it('refuses moves out of turn', () => {
    const game = started();
    const other = game.state.seats.find((seat) => seat !== game.turn && !seat.startsWith('bot:'));
    expect(game.send(other ?? '', { type: 'draw' })).toEqual([
      { type: 'reject', playerId: other, code: 'INVALID_INPUT' },
    ]);
  });

  it("keeps a player's own layout of their rack, and only of their own tiles", () => {
    const game = started();
    const rack = game.state.racks.p1 ?? [];
    const reversed = [...rack].reverse();
    expect(game.send('p1', { type: 'arrange', slots: reversed })).toEqual([]);
    expect(game.state.racks.p1).toEqual(reversed);
    const missing = reversed.map((id, i) =>
      i === reversed.findIndex((x) => x !== null) ? null : id,
    );
    const foreign = reversed.map((id) =>
      id === tilesOf(reversed)[0] ? (game.rack('p2')[0] ?? 0) : id,
    );
    const twice = reversed.map((id, i) =>
      id === null && i === reversed.indexOf(null) ? (tilesOf(reversed)[0] ?? 0) : id,
    );
    for (const bad of [missing, foreign, twice]) {
      expect(game.send('p1', { type: 'arrange', slots: bad })).toEqual([
        { type: 'reject', playerId: 'p1', code: 'INVALID_INPUT' },
      ]);
    }
  });

  it('shows each rack to its owner only', () => {
    const game = started();
    const p1 = game.view('p1');
    expect(p1.phase === 'TURN' && tilesOf(p1.rack ?? []).sort()).toEqual(game.rack('p1').sort());
    expect(JSON.stringify(game.host())).not.toContain('"rack"');
    const p2 = game.view('p2');
    expect(p2.phase === 'TURN' && tilesOf(p2.rack ?? []).sort()).toEqual(game.rack('p2').sort());
  });
});

describe('okey finishing', () => {
  it('ends the hand when the other 14 finish: the others lose 2', () => {
    const game = started();
    const seat = holding(game, [...WIN, t('blue', 13)]);
    const side = game.state.seats.indexOf(seat);
    game.send(seat, { type: 'finish', tile: t('blue', 13) });
    expect(game.state.phase).toBe('TALLY');
    expect(game.state.points).toEqual([0, 1, 2, 3].map((s) => (s === side ? 20 : 18)));
    expect(game.state.wins[side]).toBe(1);
    const host = game.host();
    expect(host.phase === 'TALLY' && host.tally).toMatchObject({
      winner: seat,
      kind: 'normal',
      tile: t('blue', 13),
      lost: [0, 1, 2, 3].map((s) => (s === side ? 0 : 2)),
    });
    expect(host.phase === 'TALLY' && host.tally.groups?.flat().sort()).toEqual([...WIN].sort());
  });

  it('doubles for finishing on the okey and for seven pairs, and both', () => {
    const cases: [number[], number, string, number][] = [
      [[...WIN, OKEY], OKEY, 'okey', 4],
      [[...PAIRS, t('blue', 13)], t('blue', 13), 'pairs', 4],
      [[...PAIRS, OKEY], OKEY, 'both', 8],
    ];
    for (const [rack, tile, kind, lost] of cases) {
      const game = started();
      const seat = holding(game, rack);
      game.send(seat, { type: 'finish', tile });
      const host = game.host();
      expect(host.phase === 'TALLY' && host.tally.kind).toBe(kind);
      expect(Math.min(...game.state.points)).toBe(20 - lost);
    }
  });

  it('refuses a finish that does not work, without a penalty', () => {
    const game = started();
    const rack = [...WIN.slice(0, 13), t('blue', 13), t('red', 9)];
    const seat = holding(game, rack);
    expect(game.send(seat, { type: 'finish', tile: t('red', 9) })).toEqual([
      { type: 'reject', playerId: seat, code: 'INVALID_INPUT' },
    ]);
    expect(game.state.phase).toBe('TURN');
    expect(game.state.points).toEqual([20, 20, 20, 20]);
  });

  it("lets the indicator's twin be shown once, on the holder's first turn: the others lose 1", () => {
    const game = started();
    const seat = game.turn;
    const twin = t('black', 12, 1);
    holding(game, [twin, ...game.rack(seat).slice(1)]);
    expect(game.view(seat)).toMatchObject({ canShow: true });
    game.send(seat, { type: 'show' });
    const side = game.state.seats.indexOf(seat);
    expect(game.state.points).toEqual([0, 1, 2, 3].map((s) => (s === side ? 20 : 19)));
    expect(game.send(seat, { type: 'show' })).toEqual([
      { type: 'reject', playerId: seat, code: 'INVALID_INPUT' },
    ]);
    expect(game.host()).toMatchObject({ last: { kind: 'show', seat, tile: twin } });
  });

  it('ends the hand without a winner when the middle runs out', () => {
    const game = started();
    const starter = game.turn;
    game.set({ deck: [] });
    game.send(starter, { type: 'discard', tile: game.rack(starter)[0] ?? 0 });
    const host = game.host();
    expect(host.phase === 'TALLY' && host.tally).toMatchObject({ winner: null, kind: 'draw' });
    expect(game.state.points).toEqual([20, 20, 20, 20]);
  });
});

describe('okey match', () => {
  it('deals the next hand to the next starter after the scoreboard', () => {
    const game = started();
    const starter = game.state.starter;
    game.set({ deck: [] });
    game.send(game.turn, { type: 'discard', tile: game.rack(game.turn)[0] ?? 0 });
    game.timer();
    expect(game.state).toMatchObject({ phase: 'TURN', hand: 2, starter: (starter + 1) % 4 });
    expect(game.state.deck).toHaveLength(48);
  });

  it('ends after the chosen hands, when a side hits zero, or when time is up', () => {
    const hands = table();
    hands.start({ ...CHOICE, hands: 1 });
    hands.set({ deck: [] });
    hands.send(hands.turn, { type: 'discard', tile: hands.rack(hands.turn)[0] ?? 0 });
    hands.timer();
    expect(hands.state).toMatchObject({ phase: 'END', endedBy: 'hands' });

    const zero = started();
    const seat = holding(zero, [...WIN, t('blue', 13)]);
    zero.set({ points: [2, 2, 2, 2] });
    zero.send(seat, { type: 'finish', tile: t('blue', 13) });
    zero.timer();
    expect(zero.state).toMatchObject({ phase: 'END', endedBy: 'zero' });

    const time = started();
    time.wait(OKEY_DEFAULT_SETTINGS.matchMs);
    time.send(time.turn, { type: 'discard', tile: time.rack(time.turn)[0] ?? 0 });
    expect(time.state).toMatchObject({ phase: 'END', endedBy: 'time' });
  });

  it('ranks by points left, then hands won; bots take places but no points', () => {
    const game = started();
    game.set({ phase: 'END', endedBy: 'hands', points: [14, 16, 20, 2], wins: [1, 0, 2, 0] });
    const host = game.host();
    expect(host.phase === 'END' && host.ranking.map((row) => [row.id, row.place])).toEqual([
      ['bot:1', 1],
      ['p2', 2],
      ['p1', 3],
      ['bot:2', 4],
    ]);
    expect(game.score().map((result) => [result.playerId, result.points])).toEqual([
      ['p1', 400],
      ['p2', 600],
    ]);
  });

  it('plays partners as one side: 0+2 against 1+3', () => {
    const game = table();
    game.start({ ...CHOICE, teams: true });
    expect(game.host()).toMatchObject({ sides: [{ points: 20 }, { points: 20 }] });
    // p1 (seat 0) and bot:1 (seat 2) are partners.
    game.set({ turn: 0 });
    const seat = holding(game, [...WIN, t('blue', 13)]);
    expect(seat).toBe('p1');
    game.send(seat, { type: 'finish', tile: t('blue', 13) });
    expect(game.state.points).toEqual([20, 18]);
    game.set({ phase: 'END', endedBy: 'hands' });
    const host = game.host();
    expect(host.phase === 'END' && host.ranking.map((row) => [row.id, row.place])).toEqual([
      ['p1', 1],
      ['bot:1', 1],
      ['p2', 2],
      ['bot:2', 2],
    ]);
    expect(game.score().map((result) => result.points)).toEqual([1_000, 300]);
  });
});

describe('okey bots', () => {
  /** Puts a bot seat on turn (before drawing) with `rack`, and `left` on its left pile. */
  function botTurn(rack: number[], left: number[] = [], deck?: number[]) {
    const game = started();
    const seat = 2; // bot:1, whose left neighbour is p2
    game.set({
      turn: seat,
      drew: false,
      indicator: INDICATOR,
      racks: { ...game.state.racks, 'bot:1': slots(rack) },
      discards: { ...game.state.discards, p2: left },
      played: ['p1', 'p2', 'bot:1', 'bot:2'],
      ...(deck ? { deck } : {}),
    });
    return game;
  }

  it('plays an empty seat after a short pause: draws, then discards', () => {
    const game = started();
    while (!game.turn.startsWith('bot:')) {
      game.send(game.turn, { type: 'draw' });
      game.send(game.turn, { type: 'discard', tile: game.rack(game.turn)[0] ?? 0 });
    }
    const bot = game.turn;
    const effects = game.timer();
    expect(game.rack(bot).length).toBe(14);
    expect(game.state.discards[bot]).toHaveLength(1);
    expect(effects).toContainEqual({
      type: 'phase',
      phase: 'TURN',
      durationMs: expect.any(Number) as number,
    });
  });

  it('finishes when it can', () => {
    // It draws the last tile it needs and puts the blue 13 down.
    const game = botTurn([...WIN.slice(0, 13), t('blue', 13)], [], [WIN[13] ?? 0]);
    game.timer();
    expect(game.state.phase).toBe('TALLY');
    expect(game.state.tally).toMatchObject({ winner: 'bot:1' });
  });

  it('takes a tile that fits, and never throws the okey away', () => {
    const rack = [
      OKEY,
      t('red', 5),
      t('red', 6),
      t('blue', 1),
      t('yellow', 3),
      t('black', 9),
      t('blue', 12),
      t('red', 13),
      t('yellow', 8),
      t('black', 4),
      t('blue', 6),
      t('yellow', 11),
      t('black', 1),
      t('red', 10),
    ];
    const game = botTurn(rack, [t('red', 7)]);
    game.timer();
    expect(game.state.last).toMatchObject({ kind: 'discard', seat: 'bot:1' });
    expect(game.rack('bot:1')).toContain(t('red', 7));
    expect(game.rack('bot:1')).toContain(OKEY);
  });

  it("plays an away player's turn after the bot's pause, and gives it back", () => {
    const game = started();
    game.set({ turn: 1, drew: false });
    expect(game.presence('p2', false)).toEqual([
      { type: 'phase', phase: 'TURN', durationMs: OKEY_DEFAULT_SETTINGS.botDelayMs },
    ]);
    expect(game.host()).toMatchObject({ bot: true });
    expect(game.presence('p2', true)).toEqual([
      { type: 'phase', phase: 'TURN', durationMs: OKEY_DEFAULT_SETTINGS.turnMs },
    ]);
  });

  it('plays whole matches with bots to the end', () => {
    for (const teams of [false, true]) {
      const game = table();
      game.start({ hands: 2, startPoints: 20, teams });
      game.presence('p1', false);
      game.presence('p2', false);
      for (let step = 0; step < 400 && game.state.phase !== 'END'; step++) game.timer();
      expect(game.state.phase).toBe('END');
      const host = game.host();
      expect(host.phase === 'END' && host.ranking).toHaveLength(4);
      expect(okeyModule.hostViewSchema.safeParse(host).success).toBe(true);
      const state: OkeyState = game.state;
      expect(state.hand).toBeLessThanOrEqual(2);
    }
  });
});
