import { describeGameModuleContract, type ScriptStep } from '@loudroom/game-sdk/testing';
import { content, players, yearContent } from './fixtures.test-support.js';
import { closestNumberModule } from './server.js';

const script = (p1: number, p2: number, p3: number): ScriptStep[] => [
  { type: 'timer' },
  { type: 'input', playerId: 'p1', input: { value: p1 }, afterMs: 2_000 },
  { type: 'input', playerId: 'p2', input: { value: p2 }, afterMs: 1_000 },
  { type: 'input', playerId: 'p3', input: { value: p3 }, afterMs: 3_000 },
];

describeGameModuleContract(closestNumberModule, {
  content,
  // Another answer, unit unchanged: nothing before the reveal may differ.
  secretVariants: [
    { ...content, answer: 1 },
    { ...content, answer: -42.5 },
  ],
  // Other guesses at the same moments must not reach anyone else before the reveal.
  secretScripts: [script(1, 2, 3), script(9_000, 8_000, 10_000)],
  players,
  script: script(8_000, 8_850, 12_000),
  invalidInputs: [{ value: 'çok' }, { value: Infinity }, { value: 1e13 }, { nope: 1 }, null],
});

describeGameModuleContract(closestNumberModule, {
  content: yearContent,
  secretVariants: [{ ...yearContent, answer: 1071 }],
  players,
  script: script(1453, 1400, 1500),
  invalidInputs: [{ value: 1453.5 }],
});
