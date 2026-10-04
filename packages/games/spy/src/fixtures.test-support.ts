import type { GamePlayer } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import type { SpyContent } from './schema.js';
import { spyModule, type SpyState } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
  { id: 'p4', nickname: 'Deniz', avatar: 'drop', color: '#7bd389', connected: true },
  { id: 'p5', nickname: 'Can', avatar: 'sun', color: '#c77dff', connected: true },
];

const places: [string, string][] = [
  ['Hastane', '🏥'],
  ['Okul', '🏫'],
  ['Havalimanı', '✈️'],
  ['Restoran', '🍽️'],
  ['Sinema', '🎬'],
  ['Plaj', '🏖️'],
  ['Market', '🛒'],
  ['Banka', '🏦'],
];

export const content: SpyContent = {
  title: 'Şehir',
  locations: places.map(([name, emoji], index) => ({ id: `l${index + 1}`, name, emoji })),
};

/** The same places in another order: the round's pick (by index) is another place. */
export const reordered: SpyContent = {
  ...content,
  locations: [...content.locations.slice(3), ...content.locations.slice(0, 3)],
};

export function createdState(
  settings: Record<string, unknown> = {},
  roster: GamePlayer[] = players,
): SpyState {
  return playRound(spyModule, { content, players: roster, settings, script: [] }).state as SpyState;
}

const state = createdState();
export const spy = state.spies[0] ?? '';
export const town = players.map((player) => player.id).filter((id) => id !== spy);

/**
 * The talk opens, the asker asks someone, p1–p3 ask to vote (a majority of 5), then p1…p5
 * vote for the given players, one second apart.
 */
export function round(...targets: string[]): ScriptStep[] {
  const asked = players.map((p) => p.id).find((id) => id !== state.asker) ?? '';
  return [
    { type: 'timer' },
    {
      type: 'input',
      playerId: state.asker,
      input: { type: 'ask', playerId: asked },
      afterMs: 5_000,
    },
    ...['p1', 'p2', 'p3'].map((playerId): ScriptStep => ({
      type: 'input',
      playerId,
      input: { type: 'requestVote', value: true },
      afterMs: 2_000,
    })),
    ...targets.map((target, index): ScriptStep => ({
      type: 'input',
      playerId: `p${index + 1}`,
      input: { type: 'vote', playerId: target },
      afterMs: 1_000,
    })),
  ];
}

/** Everyone votes for the spy; the spy votes for someone else. */
export const catchTheSpy = players.map((player) => (player.id === spy ? (town[0] ?? '') : spy));
/** Everyone votes for the next player. */
export const voteAround = players.map((_, index) => `p${((index + 1) % players.length) + 1}`);
