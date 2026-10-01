import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { content, players } from './fixtures.test-support.js';
import { quizModule } from './server.js';

describeGameModuleContract(quizModule, {
  content,
  // Same question, another correct answer: nothing before the reveal may differ.
  secretVariants: ['a', 'c', 'd'].map((correctOptionId) => ({ ...content, correctOptionId })),
  players,
  script: [
    { type: 'timer' },
    { type: 'input', playerId: 'p1', input: { optionId: 'b' }, afterMs: 2_000 },
    { type: 'input', playerId: 'p2', input: { optionId: 'a' }, afterMs: 1_000 },
    { type: 'input', playerId: 'p3', input: { optionId: 'b' }, afterMs: 3_000 },
  ],
  invalidInputs: [{ optionId: 'zzz' }, { nope: 1 }, { optionId: 5 }, null],
});
