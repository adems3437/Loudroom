import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { content, duel, OTHER_FLEET, players } from './fixtures.test-support.js';
import { amiralModule, type AmiralState } from './server.js';

describeGameModuleContract(amiralModule, {
  content,
  players: players.slice(0, 2),
  settings: { fleet: 'mini' },
  script: duel(),
  // A fleet is its side's alone: another layout looks the same to everyone else.
  privateState: (state, playerId) => {
    const amiral = state as AmiralState;
    return {
      ...amiral,
      sides: amiral.sides.map((side) =>
        side.members.includes(playerId) && side.fleet ? { ...side, fleet: OTHER_FLEET } : side,
      ),
    };
  },
  // The seed (random fleets, bot shots, the bracket) is the server's alone.
  serverState: (state) => ({ ...(state as AmiralState), seed: (state as AmiralState).seed + 1 }),
  invalidInputs: [
    { type: 'shoot', x: 0, y: 0 },
    {
      type: 'place',
      ships: [
        { x: 0, y: 0, vertical: false },
        { x: 0, y: 0, vertical: true },
        { x: 0, y: 4, vertical: false },
      ],
    },
    {
      type: 'place',
      ships: [
        { x: 5, y: 5, vertical: false },
        { x: 0, y: 2, vertical: false },
        { x: 0, y: 4, vertical: false },
      ],
    },
    { type: 'place', ships: [{ x: 0, y: 0, vertical: false }] },
    { type: 'fire', x: 1 },
    null,
  ],
});
