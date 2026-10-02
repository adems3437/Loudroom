import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { content, fullRound, players } from './fixtures.test-support.js';
import { reactionModule } from './server.js';

describeGameModuleContract(reactionModule, {
  content,
  players,
  script: fullRound({ p1: [250, 260, 270], p2: [300, 310, 320], p3: [350, 360, 370] }),
  // The TV shows every attempt's results live; phones must only ever see their own.
  secretHolders: ['host'],
  secretScripts: [fullRound({ p1: [400, 410, 420], p2: [300, 310, 320], p3: [350, 360, 370] })],
  // Checked while the first target is up (GO).
  invalidInputs: [
    { type: 'early', attempt: 0 },
    { type: 'shown', attempt: 1 },
    { type: 'tap', attempt: 2, reactionMs: 200 },
    { type: 'tap', attempt: 0 },
    { type: 'jump' },
    null,
  ],
});
