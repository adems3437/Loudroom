import type { GamePlayer } from '@loudroom/game-sdk';
import type { QuizContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: QuizContent = {
  question: 'Türkiye’nin başkenti neresidir?',
  options: [
    { id: 'a', text: 'İstanbul' },
    { id: 'b', text: 'Ankara' },
    { id: 'c', text: 'İzmir' },
    { id: 'd', text: 'Bursa' },
  ],
  correctOptionId: 'b',
};
