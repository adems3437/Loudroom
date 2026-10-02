import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { content, media, pins, players } from './fixtures.test-support.js';
import { imageLocationModule } from './server.js';

describeGameModuleContract(imageLocationModule, {
  content,
  media,
  players,
  script: pins({ x: 0.41, y: 0.5 }, { x: 0.6, y: 0.2 }, { x: 0.1, y: 0.9 }),
  // Another target (and radius): nothing before the reveal may differ.
  secretVariants: [
    { ...content, target: { x: 0.9, y: 0.1 } },
    { ...content, target: { x: 0, y: 1 }, radius: 0.2 },
  ],
  // Other pins at the same moments stay with their owners until the reveal.
  secretScripts: [pins({ x: 0.9, y: 0.9 }, { x: 0.6, y: 0.2 }, { x: 0.5, y: 0.5 })],
  invalidInputs: [
    { point: { x: 1.2, y: 0.5 } },
    { point: { x: 0.5 } },
    { point: { x: '0.5', y: 0.5 } },
    { x: 0.5, y: 0.5 },
    null,
  ],
});
