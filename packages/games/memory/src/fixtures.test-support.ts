import type { GamePlayer } from '@loudroom/game-sdk';
import type { MemoryContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

const fruits: [string, string][] = [
  ['elma', '🍎'],
  ['armut', '🍐'],
  ['muz', '🍌'],
  ['kiraz', '🍒'],
  ['uzum', '🍇'],
  ['karpuz', '🍉'],
  ['cilek', '🍓'],
  ['limon', '🍋'],
  ['seftali', '🍑'],
  ['ananas', '🍍'],
];

export const content: MemoryContent = {
  title: 'Meyveler',
  items: fruits.map(([id, emoji]) => ({ id, label: id, emoji })),
};
