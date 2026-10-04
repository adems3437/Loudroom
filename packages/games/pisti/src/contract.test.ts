import { describeGameModuleContract, playRound } from '@loudroom/game-sdk/testing';
import { content, oneDeal, players } from './fixtures.test-support.js';
import { pistiModule, type PistiState } from './server.js';

const settings = { maxDeals: 1, targetPoints: 0 };
// A card lying on the table is in nobody's hand.
const onTable = (
  playRound(pistiModule, { content, players: players.slice(0, 2), settings, script: [] })
    .state as PistiState
).pile[0];

describeGameModuleContract(pistiModule, {
  content,
  players: players.slice(0, 2),
  settings,
  script: oneDeal(),
  // A hand is its owner's alone: other cards (same count) look the same to everyone else.
  privateState: (state, playerId) => {
    const pisti = state as PistiState;
    if (pisti.phase !== 'TURN') return pisti;
    const hand = pisti.hands[playerId] ?? [];
    if (pisti.deck.length < hand.length) return pisti;
    return {
      ...pisti,
      hands: { ...pisti.hands, [playerId]: pisti.deck.slice(0, hand.length) },
      deck: [...hand, ...pisti.deck.slice(hand.length)],
    };
  },
  invalidInputs: [
    { type: 'play', cardId: 60 },
    { type: 'play', cardId: onTable },
    { type: 'throw', cardId: 1 },
    null,
  ],
});
