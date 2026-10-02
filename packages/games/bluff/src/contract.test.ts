import { describeGameModuleContract, type ScriptStep } from '@loudroom/game-sdk/testing';
import { content, optionIds, players, vote, writes } from './fixtures.test-support.js';
import { bluffModule } from './server.js';

const id = optionIds(['Yedi', 'Sekiz', 'Dokuz']);
const round = (lies: [string, string, string], votes: [string, string, string]): ScriptStep[] => [
  ...writes(...lies),
  vote('p1', id(votes[0])),
  vote('p2', id(votes[1])),
  vote('p3', id(votes[2])),
  { type: 'timer' },
];

describeGameModuleContract(bluffModule, {
  content,
  players,
  blockedWords: ['küfürlü'],
  revealPhase: 'REVEAL',
  script: round(['Yedi', 'Sekiz', 'Dokuz'], ['ÜÇ', 'YEDİ', 'YEDİ']),
  secretScripts: [
    // Mehmet and Zeynep swap lies: until the reveal nobody can tell who wrote which.
    round(['Yedi', 'Dokuz', 'Sekiz'], ['ÜÇ', 'YEDİ', 'YEDİ']),
    // The real answer swapped with Ayşe's lie: nothing tells the truth apart from the lies.
    {
      content: { ...content, answer: 'Yedi', acceptedAnswers: ['7'] },
      script: round(['Üç', 'Sekiz', 'Dokuz'], ['YEDİ', 'YEDİ', 'YEDİ']),
    },
  ],
  invalidInputs: [
    { type: 'lie', text: '' },
    { type: 'lie', text: ' ​ ' },
    { type: 'lie', text: 'x'.repeat(41) },
    { type: 'lie', text: 'üç' },
    { type: 'lie', text: '3' },
    { type: 'lie', text: 'küfürlü bir söz' },
    { type: 'vote', optionId: 'o1' },
    { type: 'guess', text: 'x' },
    null,
  ],
});
