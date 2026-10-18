import type { GamePlayer, Transition } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { UNO_DECK, type UnoColor, type UnoKind } from './cards.js';
import type { UnoContent } from './schema.js';
import { unoModule, type UnoInput, type UnoState } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: UnoContent = { title: 'Klasik Renk Kartları' };

/** Ids of the cards of a kind (and colour / value), in deck order. */
export function cards(kind: UnoKind, color: UnoColor | null = null, value: number | null = null) {
  return UNO_DECK.filter(
    (card) =>
      card.kind === kind && card.color === color && (value === null || card.value === value),
  ).map((card) => card.id);
}
export const card = (kind: UnoKind, color: UnoColor | null = null, value: number | null = null) =>
  cards(kind, color, value)[0] ?? -1;

/** A short match: the first player plays a card, then every turn times out (the bot moves). */
export function botMatch(): ScriptStep[] {
  const created = playRound(unoModule, {
    content,
    players,
    settings: { startingCards: 3 },
    script: [],
  });
  const state = created.state as UnoState;
  const first = state.seats[state.turn] ?? '';
  const view = unoModule.getPlayerView(state, first, created.context() as never);
  const playable = view.phase === 'TURN' ? view.playable[0] : undefined;
  const opening: ScriptStep[] =
    playable === undefined
      ? [{ type: 'input', playerId: first, input: { type: 'draw' }, afterMs: 2_000 }]
      : [
          {
            type: 'input',
            playerId: first,
            input: { type: 'play', cardId: playable, color: 'blue' },
            afterMs: 2_000,
          },
        ];
  return [...opening, ...Array.from({ length: 200 }, (): ScriptStep => ({ type: 'timer' }))];
}

/** Plays a match step by step with full control over the table. */
export function table(settings: Record<string, unknown> = {}, roster: GamePlayer[] = players) {
  const played = playRound(unoModule, { content, players: roster, settings, script: [] });
  let state = played.state as UnoState;
  let now = played.context().now;
  let members = roster;
  const ctx = () => ({ ...played.context(), now, players: members }) as never;
  const apply = (transition: Transition<UnoState>) => {
    state = transition.state;
    return transition.effects ?? [];
  };
  const onPlayersChanged = unoModule.onPlayersChanged?.bind(unoModule);
  if (!onPlayersChanged) throw new Error('UNO reacts to players changing');
  return {
    get state() {
      return state;
    },
    set(patch: Partial<UnoState>) {
      state = { ...state, ...patch };
    },
    wait(ms: number) {
      now += ms;
    },
    presence(playerId: string, connected: boolean) {
      members = members.map((p) => (p.id === playerId ? { ...p, connected } : p));
      return apply(onPlayersChanged(state, ctx()));
    },
    timer: () => apply(unoModule.onTimer(state, ctx())),
    send: (playerId: string, input: UnoInput) =>
      apply(unoModule.onInput(state, input, { playerId, receivedAt: now }, ctx())),
    host: () => unoModule.getHostView(state, ctx()),
    view: (playerId: string) => unoModule.getPlayerView(state, playerId, ctx()),
    score: () => unoModule.score(state, ctx()),
  };
}
