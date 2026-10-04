import { playRound } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { botMatch, content, players, table } from './fixtures.test-support.js';
import { botMove, kizmaModule, type KizmaHostView } from './server.js';

type End = Extract<KizmaHostView, { phase: 'END' }>;

const reject = (playerId: string, code = 'INVALID_INPUT') => [{ type: 'reject', playerId, code }];

describe('kizma birader turns', () => {
  it('seats two players opposite with every pawn in the yard', () => {
    const game = table();
    expect(game.state.seats.map((seat) => [seat.playerId, seat.slot, seat.pawns])).toEqual([
      ['p1', 0, [-1, -1, -1, -1]],
      ['p2', 2, [-1, -1, -1, -1]],
    ]);
    expect(game.host()).toMatchObject({ phase: 'ROLL', turn: 'p1', triesLeft: 3, die: null });
  });

  it('gives three tries for a 6 when no pawn is out, then moves on', () => {
    const game = table();
    for (const left of [2, 1]) {
      game.nextDie(3);
      game.send('p1', { type: 'roll' });
      expect(game.host()).toMatchObject({ phase: 'ROLL', turn: 'p1', triesLeft: left, die: null });
    }
    game.nextDie(4);
    game.send('p1', { type: 'roll' });
    expect(game.host()).toMatchObject({ turn: 'p2', last: { kind: 'pass', value: 4 } });
  });

  it('brings a pawn out with a 6 and rolls again', () => {
    const game = table({ pawns: 1 });
    game.nextDie(6);
    game.send('p1', { type: 'roll' });
    expect(game.state.seats[0]?.pawns).toEqual([0]);
    expect(game.host()).toMatchObject({ phase: 'ROLL', turn: 'p1' });
  });

  it('asks which pawn when there is a choice, and refuses others', () => {
    const game = table();
    game.pawns('p1', [5, 12, -1, -1]);
    game.nextDie(3);
    game.send('p1', { type: 'roll' });
    expect(game.host()).toMatchObject({ phase: 'MOVE', movable: [0, 1] });
    expect(game.send('p2', { type: 'move', pawn: 0 })).toEqual(reject('p2'));
    expect(game.send('p1', { type: 'move', pawn: 2 })).toEqual(reject('p1'));
    expect(game.send('p1', { type: 'roll' })).toEqual(reject('p1'));
    game.send('p1', { type: 'move', pawn: 1 });
    expect(game.state.seats[0]?.pawns).toEqual([5, 15, -1, -1]);
    expect(game.host()).toMatchObject({ phase: 'ROLL', turn: 'p2' });
  });

  it('sends a pawn home when another lands on it', () => {
    const game = table();
    game.pawns('p1', [8, -1, -1, -1]);
    // p2 starts at square 20: progress 31 is square 11.
    game.pawns('p2', [31, -1, -1, -1]);
    game.nextDie(3);
    game.send('p1', { type: 'roll' });
    expect(game.state.seats[1]?.pawns).toEqual([-1, -1, -1, -1]);
    expect(game.host()).toMatchObject({
      last: { kind: 'move', captured: { playerId: 'p2', pawn: 0 } },
    });
  });
});

describe('kizma birader end', () => {
  it('ranks players as they finish; the match ends when one is left', () => {
    const game = table({ pawns: 2 }, players);
    // Only the second pawn can move: it goes home, and p1 is done.
    game.pawns('p1', [43, 38]);
    game.nextDie(2);
    game.send('p1', { type: 'roll' });
    expect(game.host()).toMatchObject({ phase: 'ROLL', turn: 'p2' });
    expect(game.state.finished).toEqual(['p1']);
    game.pawns('p2', [43, 41]);
    game.nextDie(1);
    game.send('p2', { type: 'roll' });
    // Only p3 is left: last place.
    const end = game.host() as End;
    expect(end).toMatchObject({ phase: 'END', endedBy: 'finished' });
    expect(end.ranking.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(game.score().map((r) => [r.playerId, r.points, r.correct])).toEqual([
      ['p1', 1000, true],
      ['p2', 600, false],
      ['p3', 400, false],
    ]);
  });

  it('ranks by pawns home and progress when the match time is up', () => {
    const game = table({ matchMs: 120_000 }, players);
    game.pawns('p2', [40, 10, -1, -1]);
    game.pawns('p3', [20, 25, -1, -1]);
    game.wait(121_000);
    // The time is checked when the next roll begins.
    game.nextDie(3);
    game.send('p1', { type: 'roll' });
    const end = game.host() as End;
    expect(end).toMatchObject({ phase: 'END', endedBy: 'time' });
    expect(end.ranking.map((row) => row.playerId)).toEqual(['p2', 'p3', 'p1']);
  });

  it('plays a whole one-pawn match with bots', () => {
    const { frames, results } = playRound(kizmaModule, {
      content,
      players: players.slice(0, 2),
      settings: { pawns: 1 },
      script: botMatch(),
    });
    expect(frames.at(-1)).toMatchObject({ phase: 'END', ended: true });
    expect(results?.filter((r) => r.correct)).toHaveLength(1);
  });
});

describe('kizma birader bots', () => {
  it('prefer taking, then coming out, then going home, then the pawn in front', () => {
    const move = (pawn: number, from: number, to: number, captured = false) => ({
      pawn,
      from,
      to,
      captured: captured ? { playerId: 'x', pawn: 0 } : null,
    });
    expect(botMove([move(0, 3, 6), move(1, 10, 13, true)], 40)?.pawn).toBe(1);
    expect(botMove([move(0, 3, 6), move(1, -1, 0)], 40)?.pawn).toBe(1);
    expect(botMove([move(0, 3, 6), move(1, 38, 41)], 40)?.pawn).toBe(1);
    expect(botMove([move(0, 3, 6), move(1, 12, 15)], 40)?.pawn).toBe(1);
  });

  it('rolls and moves for a player whose time ran out, or who is away', () => {
    const game = table({ autoMove: false });
    game.pawns('p1', [5, 12, -1, -1]);
    game.nextDie(3);
    game.timer();
    expect(game.state.seats[0]?.pawns).toEqual([5, 15, -1, -1]);
    expect(game.presence('p2', false)).toEqual([
      { type: 'phase', phase: 'ROLL', durationMs: 1_500 },
    ]);
    expect(game.presence('p2', true)).toEqual([
      { type: 'phase', phase: 'ROLL', durationMs: 15_000 },
    ]);
  });
});

describe('kizma birader views', () => {
  it('never show the dice seed', () => {
    const game = table();
    expect(JSON.stringify(game.host())).not.toMatch(/seed|rolls/);
    expect(JSON.stringify(game.view('p1'))).not.toMatch(/seed|rolls/);
    expect(game.view('p3')).toMatchObject({ seated: false });
  });

  it('use the 6-seat board when set', () => {
    const game = table({ board: 6 }, players);
    expect(game.state.seats.map((seat) => seat.slot)).toEqual([0, 2, 4]);
    expect(game.host()).toMatchObject({ board: { slots: 6, track: 48 } });
  });
});
