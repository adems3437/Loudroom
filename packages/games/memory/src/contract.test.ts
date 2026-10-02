import { describeGameModuleContract, type ScriptStep } from '@loudroom/game-sdk/testing';
import { content, players } from './fixtures.test-support.js';
import { memoryModule } from './server.js';

const answer = (playerId: string, question: number, optionId: string): ScriptStep => ({
  type: 'input',
  playerId,
  input: { question, optionId },
  afterMs: 700,
});

/** INTRO → SHOW → QUESTIONS, then everyone answers the three questions. */
const round = (choices: Record<string, [string, string, string]>): ScriptStep[] => [
  { type: 'timer' },
  { type: 'timer' },
  ...[0, 1, 2].flatMap((question) =>
    Object.entries(choices).map(([playerId, picks]) =>
      answer(playerId, question, picks[question] ?? 'o1'),
    ),
  ),
];

describeGameModuleContract(memoryModule, {
  content,
  players,
  script: round({ p1: ['o1', 'o2', 'o3'], p2: ['o2', 'o2', 'o2'], p3: ['o4', 'o3', 'o1'] }),
  // Other answers at the same moments stay with their authors until the reveal.
  secretScripts: [
    round({ p1: ['o4', 'o4', 'o4'], p2: ['o2', 'o2', 'o2'], p3: ['o4', 'o3', 'o1'] }),
  ],
  invalidInputs: [
    { question: 7, optionId: 'o1' },
    { question: 0, optionId: 'o9' },
    { question: -1, optionId: 'o1' },
    { optionId: 'o1' },
    null,
  ],
});
