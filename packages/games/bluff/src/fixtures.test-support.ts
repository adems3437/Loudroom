import type { GamePlayer } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import type { BluffContent, BluffHostView } from './schema.js';
import { bluffModule } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: BluffContent = {
  question: 'Bir ahtapotun kaç kalbi vardır?',
  answer: 'Üç',
  acceptedAnswers: ['3'],
  decoys: ['Bir', 'İki', 'Dört', 'Altı'],
};

export const lie = (playerId: string, text: string, afterMs = 1_000): ScriptStep => ({
  type: 'input',
  playerId,
  input: { type: 'lie', text },
  afterMs,
});

export const vote = (playerId: string, optionId: string, afterMs = 1_000): ScriptStep => ({
  type: 'input',
  playerId,
  input: { type: 'vote', optionId },
  afterMs,
});

/** Writing opens, then p1…p3 write the given lies. */
export function writes(...lies: string[]): ScriptStep[] {
  return [{ type: 'timer' }, ...lies.map((text, index) => lie(`p${index + 1}`, text))];
}

/** Option id by shown text, once these lies are in (ids are positions, so play to find out). */
export function optionIds(
  lies: string[],
  played: BluffContent = content,
): (text: string) => string {
  const { frames } = playRound(bluffModule, {
    content: played,
    players,
    // With fewer lies than players the writing clock has to run out.
    script: [
      ...writes(...lies),
      ...(lies.length < players.length ? [{ type: 'timer' as const }] : []),
    ],
  });
  const view = frames.at(-1)?.hostView as Extract<BluffHostView, { phase: 'VOTE' }>;
  return (text) => {
    const option = view.options.find((candidate) => candidate.text === text);
    if (!option) throw new Error(`no option ${text}`);
    return option.id;
  };
}
