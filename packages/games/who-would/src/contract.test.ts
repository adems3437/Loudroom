import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { content, players, votes } from './fixtures.test-support.js';
import { whoWouldModule } from './server.js';

describeGameModuleContract(whoWouldModule, {
  content,
  players,
  // p2: 2 votes, p3: 1, p1: 1.
  script: votes('p2', 'p3', 'p2', 'p1'),
  // Other votes at the same moments stay hidden until the reveal.
  secretScripts: [votes('p1', 'p1', 'p1', 'p1'), votes('p4', 'p3', 'p2', 'p3')],
  // Same counts from other voters (p1 and p2 swap targets): nobody can tell, even afterwards.
  anonymousScripts: [votes('p3', 'p2', 'p2', 'p1')],
  invalidInputs: [{ playerId: 'nobody' }, { playerId: 5 }, { player: 'p1' }, null],
});
