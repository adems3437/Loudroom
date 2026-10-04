import type { GamePlayer, Transition } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { SUITS, type Suit } from './cards.js';
import type { PistiContent } from './schema.js';
import { pistiModule, type PistiInput, type PistiState } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
  { id: 'p4', nickname: 'Deniz', avatar: 'drop', color: '#7bd389', connected: true },
];

export const content: PistiContent = { title: 'Pişti' };

/** A card id from its suit and rank (1 = Ace … 13 = King). */
export const id = (suit: Suit, rank: number) => SUITS.indexOf(suit) * 13 + rank - 1;

/** One deal for two players: the first card is thrown by hand, every other turn times out. */
export function oneDeal(): ScriptStep[] {
  const created = playRound(pistiModule, {
    content,
    players: players.slice(0, 2),
    settings: { maxDeals: 1, targetPoints: 0 },
    script: [],
  });
  const state = created.state as PistiState;
  const first = state.seats[state.turn] ?? '';
  return [
    {
      type: 'input',
      playerId: first,
      input: { type: 'play', cardId: state.hands[first]?.[0] ?? 0 },
      afterMs: 3_000,
    },
    ...Array.from({ length: 60 }, (): ScriptStep => ({ type: 'timer' })),
  ];
}

/** Plays a match step by step with full control over the table. */
export function table(
  settings: Record<string, unknown> = {},
  roster: GamePlayer[] = players.slice(0, 2),
) {
  const played = playRound(pistiModule, { content, players: roster, settings, script: [] });
  let state = played.state as PistiState;
  let members = roster;
  const ctx = () => ({ ...played.context(), players: members }) as never;
  const apply = (transition: Transition<PistiState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  const onPlayersChanged = pistiModule.onPlayersChanged?.bind(pistiModule);
  if (!onPlayersChanged) throw new Error('Pişti reacts to players changing');
  return {
    get state() {
      return state;
    },
    set(patch: Partial<PistiState>) {
      state = { ...state, ...patch };
    },
    presence(playerId: string, connected: boolean) {
      members = members.map((p) => (p.id === playerId ? { ...p, connected } : p));
      return apply(onPlayersChanged(state, ctx()));
    },
    timer: () => apply(pistiModule.onTimer(state, ctx())),
    send: (playerId: string, input: PistiInput) =>
      apply(pistiModule.onInput(state, input, { playerId, receivedAt: 0 }, ctx())),
    host: () => pistiModule.getHostView(state, ctx()),
    view: (playerId: string) => pistiModule.getPlayerView(state, playerId, ctx()),
    score: () => pistiModule.score(state, ctx()),
  };
}
