import type { GamePlayer } from '@loudroom/game-sdk';
import type { ScriptStep } from '@loudroom/game-sdk/testing';
import type { WhoWouldContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
  { id: 'p4', nickname: 'Deniz', avatar: 'drop', color: '#7bd389', connected: true },
];

export const content: WhoWouldContent = {
  question: 'Kim en çok geç kalır?',
  title: 'Geç Kalma Şampiyonu',
};

/** Voting opens, then p1…p4 vote for the given players, one second apart. */
export function votes(...targets: string[]): ScriptStep[] {
  return [
    { type: 'timer' },
    ...targets.map((target, index): ScriptStep => ({
      type: 'input',
      playerId: `p${index + 1}`,
      input: { playerId: target },
      afterMs: 1_000,
    })),
  ];
}
