import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { botMatch, card, content, players } from './fixtures.test-support.js';
import { unoModule, type UnoState } from './server.js';

describeGameModuleContract(unoModule, {
  content,
  players,
  settings: { startingCards: 3 },
  script: botMatch(),
  // A hand is its owner's alone: other cards (same count) look the same to everyone else.
  privateState: (state, playerId) => {
    const uno = state as UnoState;
    if (uno.phase !== 'TURN') return uno;
    const hand = uno.hands[playerId] ?? [];
    return {
      ...uno,
      hands: { ...uno.hands, [playerId]: uno.deck.slice(0, hand.length) },
      deck: [...hand, ...uno.deck.slice(hand.length)],
      drawn: null,
    };
  },
  // The draw pile's order is the server's alone.
  serverState: (state) => ({
    ...(state as UnoState),
    deck: [...(state as UnoState).deck].reverse(),
  }),
  invalidInputs: [
    { type: 'play', cardId: 500 },
    { type: 'play', cardId: card('wild4') },
    { type: 'pass' },
    { type: 'catch' },
    { type: 'uno' },
    { type: 'shout' },
    null,
  ],
});
