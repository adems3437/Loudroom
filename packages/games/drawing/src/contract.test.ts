import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { content, guess, players } from './fixtures.test-support.js';
import { drawingModule } from './server.js';

describeGameModuleContract(drawingModule, {
  content,
  players,
  // The drawer (p1) knows the word; nobody else may learn it before the reveal. The letter
  // boxes show the length, so the variants have as many letters.
  secretHolders: ['p1'],
  secretVariants: [{ word: 'Kaplan' }, { word: 'Tavşan', alternatives: ['Tavsan'] }],
  blockedWords: ['küfürlü'],
  script: [
    { type: 'timer' },
    guess('p2', 'araba'),
    guess('p3', 'top'),
    guess('p4', 'ev'),
    { type: 'timer' },
  ],
  invalidInputs: [
    { type: 'guess', text: '' },
    { type: 'guess', text: 'x'.repeat(50) },
    { type: 'guess', text: 'Zürafa' },
    { type: 'draw', text: 'x' },
    null,
  ],
});
