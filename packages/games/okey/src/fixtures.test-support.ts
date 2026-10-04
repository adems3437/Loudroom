import type { GamePlayer, Transition } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { OKEY_COLORS, RACK_SLOTS, type OkeyColor, type OkeyContent } from './schema.js';
import { okeyModule, type OkeyHostInput, type OkeyInput, type OkeyState } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
  { id: 'p4', nickname: 'Deniz', avatar: 'drop', color: '#7bd389', connected: true },
];

export const content: OkeyContent = { title: 'Okey' };

/** A numbered tile's id (copy 0 or 1). */
export const t = (color: OkeyColor, number: number, copy = 0) =>
  OKEY_COLORS.indexOf(color) * 26 + copy * 13 + number - 1;
export const FAKE = 104;

/** A rack holding `ids` from the first slot on. */
export const slots = (ids: readonly number[]) =>
  Array.from({ length: RACK_SLOTS }, (_, i) => ids[i] ?? null);

/**
 * One hand: the setup times out, a player rearranges their rack, then every turn times out
 * (the bot's move) until the middle runs out or someone finishes.
 */
export function oneHand(roster: GamePlayer[]): ScriptStep[] {
  const dealt = playRound(okeyModule, {
    content,
    players: roster,
    settings: { hands: 1 },
    script: [{ type: 'timer' }],
  }).state as OkeyState;
  const first = roster[0]?.id ?? '';
  return [
    { type: 'timer' },
    {
      type: 'input',
      playerId: first,
      input: { type: 'arrange', slots: [...(dealt.racks[first] ?? [])].reverse() },
      afterMs: 1_000,
    },
    ...Array.from({ length: 120 }, (): ScriptStep => ({ type: 'timer' })),
  ];
}

/** Plays a match step by step with full control over the table. */
export function table(
  settings: Record<string, unknown> = {},
  roster: GamePlayer[] = players.slice(0, 2),
) {
  const played = playRound(okeyModule, { content, players: roster, settings, script: [] });
  let state = played.state as OkeyState;
  let members = roster;
  let now = played.context().now;
  const ctx = () => ({ ...played.context(), players: members, now }) as never;
  const apply = (transition: Transition<OkeyState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  const onPlayersChanged = okeyModule.onPlayersChanged?.bind(okeyModule);
  const onHostInput = okeyModule.onHostInput?.bind(okeyModule);
  if (!onPlayersChanged || !onHostInput) throw new Error('Okey takes host inputs and presence');
  return {
    get state() {
      return state;
    },
    set(patch: Partial<OkeyState>) {
      state = { ...state, ...patch };
    },
    /** Moves the clock on (the match time limit). */
    wait(ms: number) {
      now += ms;
    },
    start: (choice: Omit<OkeyHostInput, 'type'>) =>
      apply(onHostInput(state, { type: 'start', ...choice }, ctx())),
    presence(playerId: string, connected: boolean) {
      members = members.map((p) => (p.id === playerId ? { ...p, connected } : p));
      return apply(onPlayersChanged(state, ctx()));
    },
    timer: () => apply(okeyModule.onTimer(state, ctx())),
    send: (playerId: string, input: OkeyInput) =>
      apply(okeyModule.onInput(state, input, { playerId, receivedAt: now }, ctx())),
    host: () => okeyModule.getHostView(state, ctx()),
    view: (playerId: string) => okeyModule.getPlayerView(state, playerId, ctx()),
    score: () => okeyModule.score(state, ctx()),
    /** The seat whose turn it is. */
    get turn() {
      return state.seats[state.turn] ?? '';
    },
    rack: (seat: string) => (state.racks[seat] ?? []).filter((id): id is number => id !== null),
  };
}
