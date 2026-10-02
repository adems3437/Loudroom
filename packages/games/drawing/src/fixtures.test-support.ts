import type { GamePlayer } from '@loudroom/game-sdk';
import type { ScriptStep } from '@loudroom/game-sdk/testing';
import type { DrawingContent } from './schema.js';

/** In the first round p1 draws (turns follow join order). */
export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
  { id: 'p4', nickname: 'Deniz', avatar: 'drop', color: '#7bd389', connected: true },
];

export const content: DrawingContent = { word: 'Zürafa' };

export const guess = (playerId: string, text: string, afterMs = 1_000): ScriptStep => ({
  type: 'input',
  playerId,
  input: { type: 'guess', text },
  afterMs,
});
