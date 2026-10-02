import type { GamePlayer } from '@loudroom/game-sdk';
import type { SortingContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

/** Correct order: a, b, c, d. */
export const content: SortingContent = {
  question: 'Bu olayları eskiden yeniye sırala.',
  items: [
    { id: 'a', text: 'İstanbul’un fethi' },
    { id: 'b', text: 'Fransız Devrimi' },
    { id: 'c', text: 'Cumhuriyet’in ilanı' },
    { id: 'd', text: 'Ay’a ilk iniş' },
  ],
  labels: { first: 'En eski', last: 'En yeni' },
};

/** The same items in other correct orders. */
export function reordered(ids: string[]): SortingContent {
  return {
    ...content,
    items: ids.map((id) => {
      const item = content.items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(id);
      return item;
    }),
  };
}
