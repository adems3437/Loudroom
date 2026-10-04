import { describeGameModuleContract, playRound } from '@loudroom/game-sdk/testing';
import { content, oneHand, players } from './fixtures.test-support.js';
import { okeyModule, tilesOf, type OkeyState } from './server.js';

const roster = players.slice(0, 2);
const settings = { hands: 1 };
const dealt = playRound(okeyModule, {
  content,
  players: roster,
  settings,
  script: [{ type: 'timer' }],
}).state as OkeyState;
// A tile in another player's rack is not this player's.
const foreign = tilesOf(dealt.racks.p2 ?? [])[0] ?? 0;

describeGameModuleContract(okeyModule, {
  content,
  players: roster,
  settings,
  script: oneHand(roster),
  // A rack is its owner's alone: other tiles from the middle (same slots) look the same to
  // everyone else.
  privateState: (state, playerId) => {
    const okey = state as OkeyState;
    if (okey.phase !== 'TURN') return okey;
    const slots = okey.racks[playerId] ?? [];
    const count = tilesOf(slots).length;
    if (okey.deck.length < count) return okey;
    let next = 0;
    const swapped = slots.map((id) => (id === null ? null : (okey.deck[next++] ?? id)));
    return {
      ...okey,
      racks: { ...okey.racks, [playerId]: swapped },
      deck: [...tilesOf(slots), ...okey.deck.slice(count)],
    };
  },
  // The middle's order and the seed of the deals are the server's alone.
  serverState: (state) => ({
    ...(state as OkeyState),
    seed: (state as OkeyState).seed + 1,
    deck: [...(state as OkeyState).deck].reverse(),
  }),
  invalidInputs: [
    { type: 'discard', tile: foreign },
    { type: 'finish', tile: foreign },
    { type: 'arrange', slots: Array.from({ length: 30 }, () => null) },
    { type: 'show' },
    { type: 'draw', slot: 40 },
    null,
  ],
  invalidHostInputs: [
    { type: 'start', hands: 4, startPoints: 20, teams: false },
    { type: 'start', hands: 0, startPoints: 20, teams: false },
    { type: 'shuffle' },
    null,
  ],
});
