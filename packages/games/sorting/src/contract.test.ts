import { describeGameModuleContract, type ScriptStep } from '@loudroom/game-sdk/testing';
import { content, players, reordered } from './fixtures.test-support.js';
import { sortingModule } from './server.js';

const script = (p1: string[], p2: string[], p3: string[]): ScriptStep[] => [
  { type: 'timer' },
  { type: 'input', playerId: 'p1', input: { order: p1 }, afterMs: 2_000 },
  { type: 'input', playerId: 'p2', input: { order: p2 }, afterMs: 1_000 },
  { type: 'input', playerId: 'p3', input: { order: p3 }, afterMs: 3_000 },
];

describeGameModuleContract(sortingModule, {
  content,
  // Another correct order: the starting order and everything before the reveal stay the same.
  secretVariants: [reordered(['d', 'c', 'b', 'a']), reordered(['b', 'd', 'a', 'c'])],
  // Other orders sent at the same moments must not reach anyone else before the reveal.
  secretScripts: [
    script(['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd'], ['c', 'a', 'd', 'b']),
    script(['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd'], ['b', 'a', 'd', 'c']),
  ],
  players,
  script: script(['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd'], ['d', 'c', 'b', 'a']),
  invalidInputs: [
    { order: ['a', 'b', 'c'] },
    { order: ['a', 'a', 'b', 'c'] },
    { order: ['a', 'b', 'c', 'x'] },
    { order: ['a', 'b', 'c', 'd', 'a'] },
    { order: 'abcd' },
    null,
  ],
});
