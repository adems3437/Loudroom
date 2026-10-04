import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import {
  dealRound,
  isAway,
  nextSeat,
  seatPlayers,
  shuffleWith,
  turnPhase,
  type Direction,
} from '@loudroom/table-kit';
import { unoImporter } from './import.js';
import {
  UNO_COLORS,
  UNO_DECK,
  UNO_DEFAULT_SETTINGS,
  UNO_GAME_TYPE,
  UNO_MAX_SEATS,
  UNO_MIN_PLAYERS,
  cardOf,
  cardPoints,
  compareCards,
  isWild,
  unoContentSchema,
  unoHostViewSchema,
  unoInputSchema,
  unoPlayerViewSchema,
  unoSettingsSchema,
  type UnoCard,
  type UnoColor,
  type UnoContent,
  type UnoEvent,
  type UnoHostView,
  type UnoInput,
  type UnoPlayerView,
  type UnoSettings,
} from './schema.js';

export * from './schema.js';
export { unoImporter } from './import.js';

export type UnoPhase = 'TURN' | 'END' | 'SKIPPED';

export interface UnoState {
  phase: UnoPhase;
  /** Seeds every later shuffle (a reshuffled discard pile). */
  seed: number;
  reshuffles: number;
  seats: string[];
  /** Card ids per seated player. Each hand reaches only its owner. */
  hands: Record<string, number[]>;
  /** Draw pile, top first. Never leaves the server. */
  deck: number[];
  /** Played cards, top last. */
  discard: number[];
  color: UnoColor;
  /** Seat index whose turn it is. */
  turn: number;
  direction: Direction;
  /** The card the current player drew this turn and may still play. */
  drawn: number | null;
  /** Cards stacked +2 / +4 make the next player draw (stacking only). */
  pending: number;
  /** Players who said "UNO!" (cleared when they have three cards again). */
  called: string[];
  /** Down to one card without "UNO!": catchable until the next player acts. */
  exposed: string | null;
  /** The running turn clock is a bot's pause. */
  bot: boolean;
  startedAt: number;
  last: UnoEvent | null;
  winner: string | null;
  endedBy: 'empty' | 'time' | null;
}

type Ctx = RoundContext<UnoContent, UnoSettings>;
type Step = Transition<UnoState>;

const top = (state: UnoState): UnoCard => cardOf(state.discard.at(-1) ?? 0);
const handOf = (state: UnoState, playerId: string) => state.hands[playerId] ?? [];
const currentPlayer = (state: UnoState) => state.seats[state.turn] ?? '';

/** Whether a card may go on the pile now (the +4 hand rule is checked separately). */
function matches(card: UnoCard, state: UnoState): boolean {
  const pile = top(state);
  if (state.pending > 0) {
    return card.kind === 'wild4' || (card.kind === 'draw2' && pile.kind === 'draw2');
  }
  if (isWild(card)) return true;
  if (card.color === state.color) return true;
  if (card.kind !== pile.kind) return false;
  return card.kind !== 'number' || card.value === pile.value;
}

/** A +4 may be played only without a card of the colour to follow (no challenge rule). */
function wild4Allowed(hand: readonly number[], color: UnoColor): boolean {
  return !hand.some((id) => cardOf(id).color === color);
}

function playable(state: UnoState, playerId: string): number[] {
  if (state.phase !== 'TURN' || currentPlayer(state) !== playerId) return [];
  const hand = handOf(state, playerId);
  const candidates = state.drawn === null ? hand : [state.drawn];
  return candidates.filter((id) => {
    const card = cardOf(id);
    if (!matches(card, state)) return false;
    return card.kind !== 'wild4' || state.pending > 0 || wild4Allowed(hand, state.color);
  });
}

/** Moves cards from the draw pile into a hand, reshuffling the played cards when it runs out. */
function drawCards(state: UnoState, playerId: string, count: number): UnoState {
  let deck = state.deck;
  let discard = state.discard;
  let reshuffles = state.reshuffles;
  const drawn: number[] = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0 && discard.length > 1) {
      reshuffles++;
      deck = shuffleWith(state.seed, `reshuffle:${reshuffles}`, discard.slice(0, -1));
      discard = discard.slice(-1);
    }
    const [card, ...rest] = deck;
    if (card === undefined) break;
    drawn.push(card);
    deck = rest;
  }
  const hand = [...handOf(state, playerId), ...drawn];
  return {
    ...state,
    deck,
    discard,
    reshuffles,
    hands: { ...state.hands, [playerId]: hand },
    called: hand.length >= 3 ? state.called.filter((id) => id !== playerId) : state.called,
  };
}

function handPoints(state: UnoState, playerId: string): number {
  return handOf(state, playerId).reduce((sum, id) => sum + cardPoints(cardOf(id)), 0);
}

/** Winner first (when a hand emptied), then the fewest points in hand, fewest cards, seat. */
function ranking(state: UnoState) {
  const rows = state.seats.map((playerId, seat) => ({
    playerId,
    seat,
    cards: handOf(state, playerId).length,
    handPoints: handPoints(state, playerId),
  }));
  return rows.sort(
    (a, b) =>
      Number(b.playerId === state.winner) - Number(a.playerId === state.winner) ||
      a.handPoints - b.handPoints ||
      a.cards - b.cards ||
      a.seat - b.seat,
  );
}

function finish(state: UnoState, endedBy: 'empty' | 'time'): Step {
  const winner = endedBy === 'empty' ? state.winner : (ranking(state)[0]?.playerId ?? null);
  return {
    state: { ...state, phase: 'END', winner, endedBy, drawn: null, exposed: null },
    effects: [{ type: 'phase', phase: 'END', durationMs: null }, { type: 'endRound' }],
  };
}

/** Starts the current seat's turn (or ends the match when its time is up). */
function beginTurn(state: UnoState, ctx: Ctx): Step {
  if (ctx.now - state.startedAt >= ctx.settings.matchMs) return finish(state, 'time');
  const { effect, bot } = turnPhase('TURN', currentPlayer(state), ctx.players, ctx.settings);
  return { state: { ...state, phase: 'TURN', drawn: null, bot }, effects: [effect] };
}

const advance = (state: UnoState, steps = 1): UnoState => ({
  ...state,
  turn: nextSeat(state.turn, state.seats.length, state.direction, steps),
});

/** Someone else acting closes the window to catch a player who did not say "UNO!". */
function closeWindow(state: UnoState, actor: string): UnoState {
  return state.exposed && state.exposed !== actor ? { ...state, exposed: null } : state;
}

function play(state: UnoState, playerId: string, card: UnoCard, chosen: UnoColor, ctx: Ctx): Step {
  const hand = handOf(state, playerId).filter((id) => id !== card.id);
  let next: UnoState = {
    ...closeWindow(state, playerId),
    hands: { ...state.hands, [playerId]: hand },
    discard: [...state.discard, card.id],
    color: card.color ?? chosen,
    drawn: null,
    last: { kind: 'play', playerId, card, color: card.color ?? chosen },
  };
  if (hand.length === 0) return finish({ ...next, winner: playerId }, 'empty');
  if (hand.length === 1 && !next.called.includes(playerId)) next = { ...next, exposed: playerId };

  const seats = next.seats.length;
  const penalty = card.kind === 'draw2' ? 2 : card.kind === 'wild4' ? 4 : 0;
  if (penalty > 0) {
    if (ctx.settings.stacking)
      return beginTurn(advance({ ...next, pending: next.pending + penalty }), ctx);
    const victim = next.seats[nextSeat(next.turn, seats, next.direction)] ?? '';
    return beginTurn(advance(drawCards(next, victim, penalty), 2), ctx);
  }
  if (card.kind === 'skip') return beginTurn(advance(next, 2), ctx);
  if (card.kind === 'reverse') {
    if (seats === 2) return beginTurn(advance(next, 2), ctx);
    return beginTurn(advance({ ...next, direction: next.direction === 1 ? -1 : 1 }), ctx);
  }
  return beginTurn(advance(next), ctx);
}

/** Draws for the turn: the stacked total (turn over), or one card that may still be played. */
function draw(state: UnoState, playerId: string, ctx: Ctx): Step {
  const open = closeWindow(state, playerId);
  if (state.pending > 0) {
    const drawn = drawCards({ ...open, pending: 0 }, playerId, state.pending);
    return beginTurn(
      advance({ ...drawn, last: { kind: 'draw', playerId, count: state.pending } }),
      ctx,
    );
  }
  const before = handOf(open, playerId).length;
  const next = {
    ...drawCards(open, playerId, 1),
    last: { kind: 'draw', playerId, count: 1 } as UnoEvent,
  };
  const card = handOf(next, playerId)[before];
  if (card !== undefined && matches(cardOf(card), next)) {
    const hand = handOf(next, playerId);
    if (cardOf(card).kind !== 'wild4' || wild4Allowed(hand, next.color))
      return { state: { ...next, drawn: card } };
  }
  return beginTurn(advance(next), ctx);
}

function pass(state: UnoState, playerId: string, ctx: Ctx): Step {
  return beginTurn(
    advance({ ...closeWindow(state, playerId), drawn: null, last: { kind: 'pass', playerId } }),
    ctx,
  );
}

/** The colour a bot or a timed-out player names: the one they hold most of. */
function favouriteColor(hand: readonly number[]): UnoColor {
  const counts = UNO_COLORS.map((color) => hand.filter((id) => cardOf(id).color === color).length);
  return UNO_COLORS[counts.indexOf(Math.max(...counts))] ?? 'red';
}

/** A simple move: a card of the colour to follow, then any match, then wilds; else draw. */
function botMove(state: UnoState, ctx: Ctx): Step {
  const playerId = currentPlayer(state);
  const options = playable(state, playerId).map(cardOf);
  const rank = (card: UnoCard) =>
    card.kind === 'wild4' ? 3 : card.kind === 'wild' ? 2 : card.color === state.color ? 0 : 1;
  const choice = [...options].sort((a, b) => rank(a) - rank(b) || cardPoints(b) - cardPoints(a))[0];
  if (choice) {
    const hand = handOf(state, playerId);
    // A bot never forgets to say "UNO!".
    const said = hand.length === 2 ? { ...state, called: [...state.called, playerId] } : state;
    const rest = hand.filter((id) => id !== choice.id);
    return play(said, playerId, choice, favouriteColor(rest), ctx);
  }
  if (state.drawn !== null) return pass(state, playerId, ctx);
  const drew = draw(state, playerId, ctx);
  // The drawn card is playable: the bot plays it at once.
  if (drew.state.drawn !== null) return botMove(drew.state, ctx);
  return drew;
}

/** A present player's time ran out: the bot's move, or draw a card and pass. */
function timeout(state: UnoState, ctx: Ctx): Step {
  if (state.bot || ctx.settings.timeoutAction === 'autoPlay') return botMove(state, ctx);
  const playerId = currentPlayer(state);
  if (state.drawn !== null) return pass(state, playerId, ctx);
  const drew = draw(state, playerId, ctx);
  return drew.state.drawn !== null ? pass(drew.state, playerId, ctx) : drew;
}

const tableOf = (state: UnoState, ctx: Ctx) => ({
  title: ctx.content.title,
  seats: state.seats.map((playerId) => ({
    playerId,
    count: handOf(state, playerId).length,
    called: state.called.includes(playerId) && handOf(state, playerId).length <= 2,
  })),
  turn: currentPlayer(state),
  direction: state.direction,
  top: top(state),
  color: state.color,
  deckCount: state.deck.length,
  pending: state.pending,
  bot: state.bot,
  last: state.last,
});

const resultOf = (state: UnoState, ctx: Ctx) => ({
  title: ctx.content.title,
  winner: state.winner ?? '',
  endedBy: state.endedBy ?? 'empty',
  ranking: ranking(state).map(({ playerId, cards, handPoints: points }) => ({
    playerId,
    cards,
    handPoints: points,
  })),
});

const sortedHand = (state: UnoState, playerId: string) =>
  handOf(state, playerId).map(cardOf).sort(compareCards);

export const unoModule: GameModule<
  UnoContent,
  UnoSettings,
  UnoState,
  UnoInput,
  UnoHostView,
  UnoPlayerView
> = {
  id: UNO_GAME_TYPE,
  name: 'UNO',
  version: 1,
  contentSchema: unoContentSchema,
  settingsSchema: unoSettingsSchema,
  defaultSettings: UNO_DEFAULT_SETTINGS,
  inputSchema: unoInputSchema,
  hostViewSchema: unoHostViewSchema,
  playerViewSchema: unoPlayerViewSchema,
  capabilities: { minPlayers: UNO_MIN_PLAYERS, maxPlayers: 100 },
  importer: unoImporter,

  createRound(ctx) {
    const { seats } = seatPlayers(ctx.players, UNO_MAX_SEATS);
    const seed = ctx.random.int(0, 2 ** 31 - 1);
    const shuffled = shuffleWith(
      seed,
      'deck',
      UNO_DECK.map((card) => card.id),
    );
    const dealt = dealRound(shuffled, seats.length, ctx.settings.startingCards);
    // The first card turned up is never a wild one.
    const start = dealt.rest.find((id) => !isWild(cardOf(id))) ?? 0;
    const startCard = cardOf(start);
    let state: UnoState = {
      phase: 'TURN',
      seed,
      reshuffles: 0,
      seats,
      hands: Object.fromEntries(seats.map((id, seat) => [id, dealt.hands[seat] ?? []])),
      deck: dealt.rest.filter((id) => id !== start),
      discard: [start],
      color: startCard.color ?? 'red',
      turn: 0,
      direction: 1,
      drawn: null,
      pending: 0,
      called: [],
      exposed: null,
      bot: false,
      startedAt: ctx.now,
      last: null,
      winner: null,
      endedBy: null,
    };
    if (seats.length < UNO_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    // The first card acts on the first player, as if the dealer had played it.
    if (startCard.kind === 'skip') state = advance(state);
    if (startCard.kind === 'reverse') {
      state =
        seats.length === 2 ? advance(state) : { ...state, direction: -1, turn: seats.length - 1 };
    }
    if (startCard.kind === 'draw2') state = advance(drawCards(state, seats[0] ?? '', 2));
    return beginTurn(state, ctx);
  },

  onTimer(state, ctx) {
    if (state.phase !== 'TURN') return { state };
    return timeout(state, ctx);
  },

  onPlayersChanged(state, ctx) {
    if (state.phase !== 'TURN') return { state };
    const away = isAway(currentPlayer(state), ctx.players);
    // An away player's turn goes to a bot at once; a returning one gets their turn back.
    if ((ctx.settings.bots && away && !state.bot) || (!away && state.bot)) {
      const { effect, bot } = turnPhase('TURN', currentPlayer(state), ctx.players, ctx.settings);
      return { state: { ...state, bot }, effects: [effect] };
    }
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const playerId = meta.playerId;
    const reject = (code: InputRejectCode): Step => ({
      state,
      effects: [{ type: 'reject', playerId, code }],
    });
    if (state.phase !== 'TURN') return reject('ROUND_CLOSED');
    if (!state.seats.includes(playerId)) return reject('INVALID_INPUT');
    const hand = handOf(state, playerId);

    if (input.type === 'uno') {
      if (hand.length > 2 || state.called.includes(playerId)) return reject('INVALID_INPUT');
      return {
        state: {
          ...state,
          called: [...state.called, playerId],
          exposed: state.exposed === playerId ? null : state.exposed,
          last: { kind: 'uno', playerId },
        },
      };
    }
    if (input.type === 'catch') {
      const caught = state.exposed;
      if (!caught || caught === playerId) return reject('INVALID_INPUT');
      return {
        state: {
          ...drawCards({ ...state, exposed: null }, caught, 2),
          last: { kind: 'caught', playerId: caught, by: playerId },
        },
      };
    }

    if (currentPlayer(state) !== playerId) return reject('INVALID_INPUT');
    if (input.type === 'draw') {
      if (state.drawn !== null) return reject('INVALID_INPUT');
      return draw(state, playerId, ctx);
    }
    if (input.type === 'pass') {
      if (state.drawn === null) return reject('INVALID_INPUT');
      return pass(state, playerId, ctx);
    }
    if (!playable(state, playerId).includes(input.cardId)) return reject('INVALID_INPUT');
    const card = cardOf(input.cardId);
    if (isWild(card) && !input.color) return reject('INVALID_INPUT');
    return play(state, playerId, card, input.color ?? state.color, ctx);
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    const { firstPoints, secondPoints, thirdPoints, otherPoints } = ctx.settings;
    const placePoints = [firstPoints, secondPoints, thirdPoints];
    const order = state.phase === 'END' ? ranking(state) : [];
    return ctx.players.map((player): ScoreResult => {
      const place = order.findIndex((row) => row.playerId === player.id);
      if (place === -1) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const points = scaled(placePoints[place] ?? otherPoints);
      return {
        playerId: player.id,
        points,
        correct: place === 0,
        responseTimeMs: null,
        answer: { place: place + 1, cards: order[place]?.cards ?? 0 },
        breakdown: { place: points },
      };
    });
  },

  getHostView(state, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: UNO_MIN_PLAYERS };
    }
    if (state.phase === 'END') return { phase: 'END', ...resultOf(state, ctx) };
    return { phase: 'TURN', ...tableOf(state, ctx) };
  },

  getPlayerView(state, playerId, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: UNO_MIN_PLAYERS };
    }
    const seated = state.seats.includes(playerId);
    const hand = seated ? sortedHand(state, playerId) : null;
    if (state.phase === 'END') return { phase: 'END', ...resultOf(state, ctx), hand };
    return {
      phase: 'TURN',
      ...tableOf(state, ctx),
      hand,
      playable: playable(state, playerId),
      drawn: currentPlayer(state) === playerId ? state.drawn : null,
      called: state.called.includes(playerId),
      canCatch:
        seated && state.seats.some((id) => id !== playerId && handOf(state, id).length === 1),
    };
  },
};
