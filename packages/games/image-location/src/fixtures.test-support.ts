import type { GamePlayer } from '@loudroom/game-sdk';
import type { ScriptStep } from '@loudroom/game-sdk/testing';
import type { ImageLocationContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const MEDIA_ID = '0b6f7c2e-3d4a-4e5f-8a9b-1c2d3e4f5a6b';
/** A 2:1 map. */
export const media = { [MEDIA_ID]: { width: 2000, height: 1000 } };

export const content: ImageLocationContent = {
  question: 'Ankara nerede?',
  mediaId: MEDIA_ID,
  target: { x: 0.4, y: 0.5 },
};

/** Answering opens, then p1…p3 drop their pins, one second apart. */
export function pins(...points: { x: number; y: number }[]): ScriptStep[] {
  return [
    { type: 'timer' },
    ...points.map((point, index): ScriptStep => ({
      type: 'input',
      playerId: `p${index + 1}`,
      input: { point },
      afterMs: 1_000,
    })),
  ];
}
