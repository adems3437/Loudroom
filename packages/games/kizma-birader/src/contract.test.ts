import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { botMatch, content, players } from './fixtures.test-support.js';
import { kizmaModule, type KizmaState } from './server.js';

describeGameModuleContract(kizmaModule, {
  content,
  players: players.slice(0, 2),
  settings: { pawns: 1 },
  script: botMatch(),
  // The dice are the server's: another seed changes nothing anyone sees until it is rolled.
  serverState: (state) => ({ ...(state as KizmaState), seed: (state as KizmaState).seed + 1 }),
  invalidInputs: [{ type: 'move', pawn: 0 }, { type: 'move', pawn: 7 }, { type: 'jump' }, null],
});
