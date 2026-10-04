import type { GamePlayer, Transition } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { rollDie } from '@loudroom/table-kit';
import type { KizmaContent } from './schema.js';
import { kizmaModule, type KizmaInput, type KizmaState } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: KizmaContent = { title: 'Kızma Birader' };

/** A one-pawn match: p1 rolls by hand, then every turn times out (the bot plays). */
export function botMatch(): ScriptStep[] {
  return [
    { type: 'input', playerId: 'p1', input: { type: 'roll' }, afterMs: 2_000 },
    ...Array.from({ length: 400 }, (): ScriptStep => ({ type: 'timer' })),
  ];
}

/** Plays a match step by step: the board can be set and the next die chosen. */
export function table(
  settings: Record<string, unknown> = {},
  roster: GamePlayer[] = players.slice(0, 2),
) {
  const played = playRound(kizmaModule, { content, players: roster, settings, script: [] });
  let state = played.state as KizmaState;
  let now = played.context().now;
  let members = roster;
  const ctx = () => ({ ...played.context(), now, players: members }) as never;
  const apply = (transition: Transition<KizmaState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  const onPlayersChanged = kizmaModule.onPlayersChanged?.bind(kizmaModule);
  if (!onPlayersChanged) throw new Error('Kızma Birader reacts to players changing');
  return {
    get state() {
      return state;
    },
    set(patch: Partial<KizmaState>) {
      state = { ...state, ...patch };
    },
    /** Sets a player's pawns. */
    pawns(playerId: string, pawns: number[]) {
      state = {
        ...state,
        seats: state.seats.map((seat) => (seat.playerId === playerId ? { ...seat, pawns } : seat)),
      };
    },
    /** Makes the next roll come up `value`. */
    nextDie(value: number) {
      let rolls = state.rolls;
      while (rollDie(state.seed, rolls) !== value) rolls++;
      state = { ...state, rolls };
    },
    wait(ms: number) {
      now += ms;
    },
    presence(playerId: string, connected: boolean) {
      members = members.map((p) => (p.id === playerId ? { ...p, connected } : p));
      return apply(onPlayersChanged(state, ctx()));
    },
    timer: () => apply(kizmaModule.onTimer(state, ctx())),
    send: (playerId: string, input: KizmaInput) =>
      apply(kizmaModule.onInput(state, input, { playerId, receivedAt: now }, ctx())),
    host: () => kizmaModule.getHostView(state, ctx()),
    view: (playerId: string) => kizmaModule.getPlayerView(state, playerId, ctx()),
    score: () => kizmaModule.score(state, ctx()),
  };
}
