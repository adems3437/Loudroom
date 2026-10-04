import { playRound } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { content, duel, FLEET_1, FLEET_2, players, table } from './fixtures.test-support.js';
import { validFleet } from './fleet.js';
import { amiralModule, type AmiralHostView, type AmiralPlayerView } from './server.js';

type Battle<T> = Extract<T, { phase: 'BATTLE' }>;
type End = Extract<AmiralHostView, { phase: 'END' }>;

const reject = (playerId: string, code = 'INVALID_INPUT') => [{ type: 'reject', playerId, code }];

describe('amiral batti teams', () => {
  it('splits players into two teams; the captains place the fleets', () => {
    const game = table({}, players.slice(0, 4));
    expect(game.state.sides.map((side) => side.members)).toEqual([
      ['p1', 'p3'],
      ['p2', 'p4'],
    ]);
    expect(game.view('p1')).toMatchObject({ canPlace: true, myDuel: 'd1-1' });
    expect(game.view('p3')).toMatchObject({ canPlace: false });
    expect(game.send('p3', { type: 'place', ships: FLEET_1 })).toEqual(reject('p3'));
    game.send('p1', { type: 'place', ships: FLEET_1 });
    // Teammates see their fleet; the other team never does.
    expect(game.view('p3')).toMatchObject({ fleet: FLEET_1 });
    expect(game.view('p2')).toMatchObject({ fleet: null });
    expect(game.send('p2', { type: 'place', ships: FLEET_2 })).toEqual([
      { type: 'phase', phase: 'BATTLE', durationMs: 20_000 },
    ]);
  });

  it('lets team members take turns and refuses shots out of turn or twice', () => {
    const game = table({}, players.slice(0, 4));
    game.send('p1', { type: 'place', ships: FLEET_1 });
    game.send('p2', { type: 'place', ships: FLEET_2 });
    expect(game.send('p3', { type: 'shoot', x: 0, y: 0 })).toEqual(reject('p3'));
    game.send('p1', { type: 'shoot', x: 0, y: 5 });
    game.send('p2', { type: 'shoot', x: 5, y: 5 });
    // Now p3 fires for the first team, then p4 for the second.
    expect(game.view('p3')).toMatchObject({ canShoot: true });
    expect(game.send('p3', { type: 'shoot', x: 0, y: 5 })).toEqual(
      reject('p3', 'ALREADY_ANSWERED'),
    );
    game.send('p3', { type: 'shoot', x: 1, y: 5 });
    expect(game.view('p4')).toMatchObject({ canShoot: true });
  });

  it('records hits and sunk ships, and ends when a fleet is gone', () => {
    const { frames, results } = playRound(amiralModule, {
      content,
      players: players.slice(0, 2),
      settings: { fleet: 'mini' },
      script: duel(),
    });
    const before = frames.at(-2)?.hostView as Battle<AmiralHostView>;
    const shotsAtP2 = before.duels[0]?.b?.shotsTaken ?? [];
    expect(shotsAtP2.filter((s) => s.hit)).toHaveLength(6);
    expect(shotsAtP2.filter((s) => s.sunk).map((s) => s.sunk?.size)).toEqual([3, 2]);
    expect(frames.at(-1)).toMatchObject({ phase: 'END', ended: true });
    expect((frames.at(-1)?.hostView as End).winners).toEqual(['p1']);
    expect(results?.map((r) => [r.playerId, r.points, r.correct])).toEqual([
      ['p1', 1000, true],
      ['p2', 300, false],
    ]);
  });

  it('gives another shot after a hit when set', () => {
    const game = table({ extraShotOnHit: true });
    game.send('p1', { type: 'place', ships: FLEET_1 });
    game.send('p2', { type: 'place', ships: FLEET_2 });
    game.send('p1', { type: 'shoot', x: 5, y: 0 });
    expect(game.view('p1')).toMatchObject({ canShoot: true });
    game.send('p1', { type: 'shoot', x: 0, y: 5 });
    expect(game.view('p2')).toMatchObject({ canShoot: true });
  });

  it('lays out a fleet at random when the placing time runs out', () => {
    const game = table();
    game.send('p1', { type: 'place', ships: FLEET_1 });
    expect(game.timer()).toEqual([{ type: 'phase', phase: 'BATTLE', durationMs: 20_000 }]);
    const fleet = game.state.sides[1]?.fleet ?? [];
    expect(validFleet(fleet, game.state.sizes, game.state.grid)).toBe(true);
  });
});

describe('amiral batti tournament', () => {
  it('pairs players at random with a bye, plays the duels side by side, and ranks them', () => {
    const game = table({ mode: 'tournament' }, players);
    expect(game.state.sides).toHaveLength(5);
    const round1 = game.host() as Extract<AmiralHostView, { phase: 'PLACE' }>;
    expect(round1.duels.map((d) => d.b === null)).toEqual([false, false, true]);

    game.timer(); // fleets at random → battle
    const battle = game.host() as Battle<AmiralHostView>;
    expect(battle.duels.filter((d) => d.waiting)).toHaveLength(2);
    // One shooter fires: the step waits for the other duel.
    const shooter = battle.duels[0]?.shooter ?? '';
    game.send(shooter, { type: 'shoot', x: 0, y: 0 });
    expect((game.host() as Battle<AmiralHostView>).duels.map((d) => d.waiting)).toEqual([
      false,
      true,
      false,
    ]);

    // Time runs out over and over: bots fire until a champion is left.
    for (let i = 0; i < 400 && game.state.phase !== 'END'; i++) game.timer();
    const end = game.host() as End;
    expect(end.phase).toBe('END');
    expect(game.state.bracketRound).toBe(3);
    const places = end.ranking.map((row) => row.place).sort();
    expect(places).toEqual([1, 2, 3, 4, 4]);
    const points = game
      .score()
      .map((r) => r.points)
      .sort((a, b) => b - a);
    expect(points).toEqual([1000, 600, 400, 200, 200]);
  });
});

describe('amiral batti bots and views', () => {
  it('gives a bot the shot of an away shooter after a short pause', () => {
    const game = table();
    game.send('p1', { type: 'place', ships: FLEET_1 });
    game.send('p2', { type: 'place', ships: FLEET_2 });
    expect(game.presence('p1', false)).toEqual([
      { type: 'phase', phase: 'BATTLE', durationMs: 1_500 },
    ]);
    game.timer();
    expect(game.state.duels[0]?.shots.a).toHaveLength(1);
    expect(game.view('p2')).toMatchObject({ canShoot: true });
  });

  it('never shows a fleet to the other side or the TV', () => {
    const game = table();
    game.send('p1', { type: 'place', ships: FLEET_1 });
    game.send('p2', { type: 'place', ships: FLEET_2 });
    expect(JSON.stringify(game.host())).not.toContain('"fleet"');
    expect((game.view('p2') as Battle<AmiralPlayerView>).fleet).toEqual(FLEET_2);
    expect(JSON.stringify(game.view('p2'))).not.toContain(JSON.stringify(FLEET_1));
  });

  it('lets late joiners watch', () => {
    const game = table({}, players.slice(0, 2));
    expect(game.view('p5')).toMatchObject({ mySide: null, canPlace: false, myDuel: null });
  });
});
