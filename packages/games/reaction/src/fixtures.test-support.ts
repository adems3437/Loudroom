import type { GamePlayer } from '@loudroom/game-sdk';
import type { ScriptStep } from '@loudroom/game-sdk/testing';
import type { ReactionContent } from './schema.js';

export const players: GamePlayer[] = [
  { id: 'p1', nickname: 'Ayşe', avatar: 'star', color: '#ff5d5d', connected: true },
  { id: 'p2', nickname: 'Mehmet', avatar: 'moon', color: '#3a86ff', connected: true },
  { id: 'p3', nickname: 'Zeynep', avatar: 'cloud', color: '#ffd23f', connected: true },
];

export const content: ReactionContent = { title: 'Klasik', variant: 'classic' };

/**
 * The phone drew the target `delay` ms after the previous step and reports `ms`; its tap
 * arrives `gap` ms after "shown" (normally as long as it measured).
 */
export function react(
  playerId: string,
  attempt: number,
  ms: number,
  delay = 40,
  gap = ms,
): ScriptStep[] {
  return [
    { type: 'input', playerId, input: { type: 'shown', attempt }, afterMs: delay },
    { type: 'input', playerId, input: { type: 'tap', attempt, reactionMs: ms }, afterMs: gap },
  ];
}

/** INTRO → ARMED → GO for attempt 0; later attempts: RESULT → ARMED → GO. */
export const toGo = (first: boolean): ScriptStep[] =>
  first ? [{ type: 'timer' }, { type: 'timer' }] : [{ type: 'timer' }, { type: 'timer' }];

/**
 * A whole classic round: three attempts in which everyone taps (taps arriving 300 ms after
 * "shown" whatever was measured, so variants keep the same timing); then the reveal.
 */
export function fullRound(times: Record<string, [number, number, number]>): ScriptStep[] {
  const steps: ScriptStep[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    steps.push(...toGo(attempt === 0));
    for (const [playerId, ms] of Object.entries(times)) {
      steps.push(...react(playerId, attempt, ms[attempt] ?? 300, 40, 300));
    }
  }
  steps.push({ type: 'timer' });
  return steps;
}
