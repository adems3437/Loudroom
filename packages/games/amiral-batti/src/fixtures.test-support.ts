import type { GamePlayer, Transition } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import type { AmiralContent, Placement } from './schema.js';
import { amiralModule, type AmiralInput, type AmiralState } from './server.js';

export const players: GamePlayer[] = ['Ayşe', 'Mehmet', 'Zeynep', 'Deniz', 'Can'].map(
  (nickname, i) => ({
    id: `p${i + 1}`,
    nickname,
    avatar: 'star',
    color: '#ff5d5d',
    connected: true,
  }),
);

export const content: AmiralContent = { title: 'Amiral Battı' };

/** Mini fleets (6×6, ships of 3, 2, 2). */
export const FLEET_1: Placement[] = [
  { x: 0, y: 0, vertical: false },
  { x: 0, y: 2, vertical: false },
  { x: 0, y: 4, vertical: false },
];
export const FLEET_2: Placement[] = [
  { x: 5, y: 0, vertical: true },
  { x: 3, y: 5, vertical: false },
  { x: 3, y: 3, vertical: false },
];
export const OTHER_FLEET: Placement[] = [
  { x: 0, y: 5, vertical: false },
  { x: 4, y: 0, vertical: true },
  { x: 2, y: 2, vertical: true },
];
const FLEET_2_CELLS: [number, number][] = [
  [5, 0],
  [5, 1],
  [5, 2],
  [3, 5],
  [4, 5],
  [3, 3],
  [4, 3],
];
const MISSES: [number, number][] = [
  [5, 5],
  [5, 4],
  [4, 4],
  [3, 4],
  [2, 5],
  [2, 3],
];

/** A duel: both place, then p1 sinks p2's fleet while p2 misses every time. */
export function duel(): ScriptStep[] {
  const shots: ScriptStep[] = [];
  FLEET_2_CELLS.forEach(([x, y], i) => {
    shots.push({ type: 'input', playerId: 'p1', input: { type: 'shoot', x, y }, afterMs: 1_000 });
    const miss = MISSES[i];
    if (miss) {
      shots.push({
        type: 'input',
        playerId: 'p2',
        input: { type: 'shoot', x: miss[0], y: miss[1] },
        afterMs: 1_000,
      });
    }
  });
  return [
    { type: 'input', playerId: 'p1', input: { type: 'place', ships: FLEET_1 }, afterMs: 5_000 },
    { type: 'input', playerId: 'p2', input: { type: 'place', ships: FLEET_2 }, afterMs: 5_000 },
    ...shots,
  ];
}

/** Plays a match step by step. */
export function table(
  settings: Record<string, unknown> = {},
  roster: GamePlayer[] = players.slice(0, 2),
) {
  const played = playRound(amiralModule, {
    content,
    players: roster,
    settings: { fleet: 'mini', ...settings },
    script: [],
  });
  let state = played.state as AmiralState;
  let members = roster;
  const ctx = () => ({ ...played.context(), players: members }) as never;
  const apply = (transition: Transition<AmiralState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  const onPlayersChanged = amiralModule.onPlayersChanged?.bind(amiralModule);
  if (!onPlayersChanged) throw new Error('Amiral Battı reacts to players changing');
  return {
    get state() {
      return state;
    },
    presence(playerId: string, connected: boolean) {
      members = members.map((p) => (p.id === playerId ? { ...p, connected } : p));
      return apply(onPlayersChanged(state, ctx()));
    },
    timer: () => apply(amiralModule.onTimer(state, ctx())),
    send: (playerId: string, input: AmiralInput) =>
      apply(amiralModule.onInput(state, input, { playerId, receivedAt: 0 }, ctx())),
    host: () => amiralModule.getHostView(state, ctx()),
    view: (playerId: string) => amiralModule.getPlayerView(state, playerId, ctx()),
    score: () => amiralModule.score(state, ctx()),
  };
}
