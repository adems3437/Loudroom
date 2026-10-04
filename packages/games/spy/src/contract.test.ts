import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import {
  catchTheSpy,
  content,
  players,
  reordered,
  round,
  town,
  voteAround,
} from './fixtures.test-support.js';
import { spyModule } from './server.js';

describeGameModuleContract(spyModule, {
  content,
  players,
  script: round(...catchTheSpy),
  // Another place: only the non-spies may tell — neither the spy nor the TV.
  secretVariants: [reordered],
  secretHolders: town,
  // Other votes at the same moments stay hidden until the reveal.
  secretScripts: [round(...voteAround)],
  invalidInputs: [
    { type: 'ask', playerId: 'p1' },
    { type: 'ask', playerId: 'ghost' },
    { type: 'vote', playerId: 'p2' },
    { type: 'guess', locationId: 'nowhere' },
    { type: 'requestVote' },
    null,
  ],
});
