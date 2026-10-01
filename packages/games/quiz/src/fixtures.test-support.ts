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

/** Version 2 content: an image on the question and on two options. */
export const contentWithImages: QuizContent = {
  ...content,
  media: { type: 'image', mediaId: '0b6f7c2e-3d4a-4e5f-8a9b-1c2d3e4f5a6b' },
  options: content.options.map((option, index) =>
    index < 2 ? { ...option, mediaId: `1c7a8d3f-4e5b-4f6a-9b0c-2d3e4f5a6b7${index}` } : option,
  ),
};
