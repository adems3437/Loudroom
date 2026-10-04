import { describeGameModuleContract } from '@loudroom/game-sdk/testing';
import { cardNumbers } from './card.js';
import { content, createdState, fullRound, players } from './fixtures.test-support.js';
import { tombalaModule, type TombalaState } from './server.js';

const state = createdState();
// A number on p1's card that is drawn last of all: never markable before the round ends.
const undrawn = cardNumbers(state.cards.p1 ?? []).sort(
  (a, b) => state.bag.indexOf(b) - state.bag.indexOf(a),
)[0];

describeGameModuleContract(tombalaModule, {
  content,
  players,
  script: fullRound(true),
  // A player's marks are their own: p2 marking or not looks the same to everyone else.
  secretScripts: [fullRound(false)],
  // The bag's order is the server's alone.
  serverState: (state) => ({
    ...(state as TombalaState),
    bag: [...(state as TombalaState).bag].reverse(),
  }),
  invalidInputs: [
    { type: 'mark', number: undrawn, marked: true },
    { type: 'mark', number: 91, marked: true },
    { type: 'shout' },
    null,
  ],
  invalidHostInputs: [{ type: 'shuffle' }, { draw: true }, null],
});
