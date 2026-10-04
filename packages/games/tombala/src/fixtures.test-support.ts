import type { GamePlayer } from '@loudroom/game-sdk';
import { playRound, type ScriptStep } from '@loudroom/game-sdk/testing';
import { cardNumbers, completeRows } from './card.js';
import type { TombalaContent } from './schema.js';
import { tombalaModule, type TombalaState } from './server.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: TombalaContent = { title: 'Klasik Tombala' };

/** The round as created with the fixture seed: cards and the bag's order. */
export function createdState(settings: Record<string, unknown> = {}): TombalaState {
  return playRound(tombalaModule, { content, players, settings, script: [] }).state as TombalaState;
}

/**
 * A full auto-drawn round: numbers are drawn until p1's card is complete; p1 calls each prize
 * as soon as the card has it, and p2 marks the first drawn number of its card (`p2Mark`
 * decides how, for the secrecy variants).
 */
export function fullRound(p2Mark: boolean): ScriptStep[] {
  const state = createdState();
  const p1 = state.cards.p1;
  const p2 = state.cards.p2;
  if (!p1 || !p2) throw new Error('fixture cards missing');
  const p2Numbers = new Set(cardNumbers(p2));
  const steps: ScriptStep[] = [{ type: 'timer' }]; // INTRO → first draw
  const drawn = new Set<number>();
  let called = 0;
  let p2Marked = false;
  for (const number of state.bag) {
    drawn.add(number);
    if (!p2Marked && p2Numbers.has(number)) {
      steps.push({
        type: 'input',
        playerId: 'p2',
        input: { type: 'mark', number, marked: p2Mark },
        afterMs: 500,
      });
      p2Marked = true;
    }
    if (completeRows(p1, drawn) > called) {
      called++;
      steps.push({ type: 'input', playerId: 'p1', input: { type: 'claim' }, afterMs: 800 });
      // CLAIM ends: the next number (or, after "Tombala!", the reveal).
      steps.push({ type: 'timer' });
      if (called === 3) return steps;
      continue;
    }
    steps.push({ type: 'timer' });
  }
  throw new Error('fixture: p1 never completed the card');
}
