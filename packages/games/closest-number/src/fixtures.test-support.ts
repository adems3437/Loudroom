import type { GamePlayer } from '@loudroom/game-sdk';
import type { ClosestNumberContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: ClosestNumberContent = {
  question: 'Everest Dağı kaç metre yüksekliğindedir?',
  answer: 8_849,
  unit: 'm',
  displayFormat: 'number',
};

export const yearContent: ClosestNumberContent = {
  question: 'İstanbul hangi yıl fethedildi?',
  answer: 1453,
  displayFormat: 'year',
};
