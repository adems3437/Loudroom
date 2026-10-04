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
  sideOf,
  sideSeats,
  turnPhase,
} from '@loudroom/table-kit';
import { pistiImporter } from './import.js';
import {
  ALL_CARDS,
  JACK,
  PISTI_DEFAULT_SETTINGS,
  PISTI_GAME_TYPE,
  PISTI_MAX_SEATS,
  PISTI_MIN_PLAYERS,
  PISTI_POINT_SCALE,
  cardOf,
  cardPoints,
  compareCards,
  pistiContentSchema,
  pistiHostViewSchema,
  pistiInputSchema,
  pistiPlayerViewSchema,
  pistiSettingsSchema,
  type PistiContent,
  type PistiHostView,
  type PistiInput,
  type PistiPlay,
  type PistiPlayerView,
  type PistiSettings,
  type TallyRow,
} from './schema.js';

export * from './schema.js';
export { pistiImporter } from './import.js';

export type PistiPhase = 'TURN' | 'TALLY' | 'END' | 'SKIPPED';

/** Cards dealt to the table and to each hand at a time. */
const DEAL = 4;

export interface PistiState {
  phase: PistiPhase;
  /** Seeds each deal's shuffle. */
  seed: number;
  deal: number;
  seats: string[];
  /** Partners (0+2, 1+3) with four players and the setting on. */
  teams: boolean;
  /** Card ids per seated player. Each hand reaches only its owner. */
  hands: Record<string, number[]>;
  /** Never leaves the server. */
  deck: number[];
  /** Table cards, bottom first. */
  pile: number[];
  /** How many of the bottom pile cards lie face down (the first three of a deal). */
  hidden: number;
  /** Cards taken this deal, per side. */
  captured: number[][];
  pistis: { side: number; kind: 'normal' | 'jack' }[];
  lastCapture: number | null;
  /** Game points per side over the match. */
  scores: number[];
  /** Cards taken per side over the match (the tie-break). */
  totalCards: number[];
  turn: number;
  bot: boolean;
  last: PistiPlay | null;
  tally: TallyRow[];
}

type Ctx = RoundContext<PistiContent, PistiSettings>;
type Step = Transition<PistiState>;

const handOf = (state: PistiState, playerId: string) => state.hands[playerId] ?? [];
const currentPlayer = (state: PistiState) => state.seats[state.turn] ?? '';
const sideCount = (state: PistiState) => (state.teams ? 2 : state.seats.length);
const sideOfPlayer = (state: PistiState, playerId: string) =>
  sideOf(state.seats.indexOf(playerId), state.teams);

function beginTurn(state: PistiState, ctx: Ctx): Step {
  const { effect, bot } = turnPhase('TURN', currentPlayer(state), ctx.players, ctx.settings);
  return { state: { ...state, phase: 'TURN', bot }, effects: [effect] };
}

/** A new deal: a fresh deck, four cards on the table (three face down), four to each hand. */
function startDeal(state: PistiState, deal: number, ctx: Ctx): Step {
  const deck = shuffleWith(state.seed, `deal:${deal}`, ALL_CARDS);
  const pile = deck.slice(0, DEAL);
  const dealt = dealRound(deck.slice(DEAL), state.seats.length, DEAL);
  return beginTurn(
    {
      ...state,
      deal,
      deck: dealt.rest,
      pile,
      hidden: DEAL - 1,
      hands: Object.fromEntries(state.seats.map((id, seat) => [id, dealt.hands[seat] ?? []])),
      captured: Array.from({ length: sideCount(state) }, () => []),
      pistis: [],
      lastCapture: null,
      // The deal starts one seat further each time.
      turn: (deal - 1) % state.seats.length,
      last: null,
      tally: [],
    },
    ctx,
  );
}

/** A deal's points per side (SPEC §7.13: classic scoring). */
function tallyOf(state: PistiState): TallyRow[] {
  const counts = state.captured.map((cards) => cards.length);
  const most = Math.max(...counts);
  const unique = counts.filter((count) => count === most).length === 1;
  return state.captured.map((cards, side) => {
    const points = cards.reduce((sum, id) => sum + cardPoints(cardOf(id)), 0);
    const pistis = state.pistis.filter((p) => p.side === side && p.kind === 'normal').length;
    const jackPistis = state.pistis.filter((p) => p.side === side && p.kind === 'jack').length;
    const mostCards = unique && cards.length === most ? 3 : 0;
    return {
      side,
      cards: cards.length,
      mostCards,
      cardPoints: points,
      pistis,
      jackPistis,
      total: mostCards + points + pistis * 10 + jackPistis * 20,
    };
  });
}

/** The deck is out and the hands are empty: the table goes to the last taker, then the score. */
function endDeal(state: PistiState, ctx: Ctx): Step {
  const captured = state.captured.map((cards, side) =>
    side === state.lastCapture ? [...cards, ...state.pile] : cards,
  );
  const settled = { ...state, captured, pile: [], hidden: 0 };
  const tally = tallyOf(settled);
  return {
    state: {
      ...settled,
      phase: 'TALLY',
      tally,
      scores: state.scores.map((score, side) => score + (tally[side]?.total ?? 0)),
      totalCards: state.totalCards.map((count, side) => count + (captured[side]?.length ?? 0)),
    },
    effects: [{ type: 'phase', phase: 'TALLY', durationMs: ctx.settings.tallyMs }],
  };
}

function matchOver(state: PistiState, settings: PistiSettings): boolean {
  const reached = settings.targetPoints > 0 && Math.max(...state.scores) >= settings.targetPoints;
  return reached || (settings.maxDeals > 0 && state.deal >= settings.maxDeals);
}

/** Most points; on a tie the most cards over the match; still tied, all of them. */
function winners(state: PistiState): number[] {
  const best = Math.max(...state.scores);
  const tied = state.scores.flatMap((score, side) => (score === best ? [side] : []));
  const cards = Math.max(...tied.map((side) => state.totalCards[side] ?? 0));
  return tied.filter((side) => (state.totalCards[side] ?? 0) === cards);
}

function play(state: PistiState, playerId: string, cardId: number, ctx: Ctx): Step {
  const card = cardOf(cardId);
  const side = sideOfPlayer(state, playerId);
  const hand = handOf(state, playerId).filter((id) => id !== cardId);
  const topId = state.pile.at(-1);
  const top = topId === undefined ? null : cardOf(topId);
  const takes = top !== null && (card.rank === top.rank || card.rank === JACK);
  const pisti =
    takes && state.pile.length === 1 && top.rank === card.rank
      ? card.rank === JACK
        ? 'jack'
        : 'normal'
      : null;

  let next: PistiState = {
    ...state,
    hands: { ...state.hands, [playerId]: hand },
    last: { playerId, card, captured: takes, pisti },
  };
  if (takes) {
    next = {
      ...next,
      captured: next.captured.map((cards, s) =>
        s === side ? [...cards, ...state.pile, cardId] : cards,
      ),
      pile: [],
      hidden: 0,
      lastCapture: side,
      pistis: pisti ? [...next.pistis, { side, kind: pisti }] : next.pistis,
    };
  } else {
    next = { ...next, pile: [...state.pile, cardId] };
  }

  next = { ...next, turn: nextSeat(state.turn, state.seats.length) };
  if (next.seats.every((id) => handOf(next, id).length === 0)) {
    if (next.deck.length === 0) return endDeal(next, ctx);
    const dealt = dealRound(next.deck, next.seats.length, DEAL);
    next = {
      ...next,
      deck: dealt.rest,
      hands: Object.fromEntries(next.seats.map((id, seat) => [id, dealt.hands[seat] ?? []])),
    };
  }
  return beginTurn(next, ctx);
}

/**
 * A simple move: take the pile with the same rank (a pişti when it is one card), take a pile
 * of two or more with a Jack, otherwise throw the least valuable card that is not a Jack.
 */
export function botCard(state: PistiState, playerId: string): number {
  const hand = handOf(state, playerId).map(cardOf);
  const topId = state.pile.at(-1);
  const top = topId === undefined ? null : cardOf(topId);
  const same = top ? hand.find((card) => card.rank === top.rank) : undefined;
  if (same) return same.id;
  const jack = hand.find((card) => card.rank === JACK);
  if (jack && state.pile.length >= 2) return jack.id;
  const throwable = [...hand].sort(
    (a, b) =>
      Number(a.rank === JACK) - Number(b.rank === JACK) ||
      cardPoints(a) - cardPoints(b) ||
      a.rank - b.rank,
  );
  return throwable[0]?.id ?? hand[0]?.id ?? 0;
}

function sidesOf(state: PistiState) {
  return sideSeats(state.seats.length, state.teams)
    .slice(0, sideCount(state))
    .map((seats, side) => ({
      side,
      players: seats.map((seat) => state.seats[seat] ?? ''),
      score: state.scores[side] ?? 0,
      captured: state.captured[side]?.length ?? 0,
    }));
}

function tableOf(state: PistiState, ctx: Ctx) {
  return {
    title: ctx.content.title,
    deal: state.deal,
    targetPoints: ctx.settings.targetPoints,
    maxDeals: ctx.settings.maxDeals,
    teams: state.teams,
    seats: state.seats.map((playerId, seat) => ({
      playerId,
      count: handOf(state, playerId).length,
      side: sideOf(seat, state.teams),
    })),
    sides: sidesOf(state),
    turn: currentPlayer(state),
    bot: state.bot,
    pile: {
      count: state.pile.length,
      hidden: state.hidden,
      visible: state.pile.slice(state.hidden).slice(-6).map(cardOf),
    },
    deckCount: state.deck.length,
    last: state.last,
  };
}

export const pistiModule: GameModule<
  PistiContent,
  PistiSettings,
  PistiState,
  PistiInput,
  PistiHostView,
  PistiPlayerView
> = {
  id: PISTI_GAME_TYPE,
  name: 'Pişti',
  version: 1,
  contentSchema: pistiContentSchema,
  settingsSchema: pistiSettingsSchema,
  defaultSettings: PISTI_DEFAULT_SETTINGS,
  inputSchema: pistiInputSchema,
  hostViewSchema: pistiHostViewSchema,
  playerViewSchema: pistiPlayerViewSchema,
  capabilities: { minPlayers: PISTI_MIN_PLAYERS, maxPlayers: 100 },
  importer: pistiImporter,

  createRound(ctx) {
    const { seats } = seatPlayers(ctx.players, PISTI_MAX_SEATS);
    const teams = ctx.settings.teams && seats.length === 4;
    const sides = teams ? 2 : seats.length;
    const state: PistiState = {
      phase: 'TURN',
      seed: ctx.random.int(0, 2 ** 31 - 1),
      deal: 1,
      seats,
      teams,
      hands: {},
      deck: [],
      pile: [],
      hidden: 0,
      captured: [],
      pistis: [],
      lastCapture: null,
      scores: Array.from({ length: sides }, () => 0),
      totalCards: Array.from({ length: sides }, () => 0),
      turn: 0,
      bot: false,
      last: null,
      tally: [],
    };
    if (seats.length < PISTI_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    return startDeal(state, 1, ctx);
  },

  onTimer(state, ctx) {
    if (state.phase === 'TURN') {
      // Time is up (or a bot's pause is over): the card is chosen for the player.
      const playerId = currentPlayer(state);
      return play(state, playerId, botCard(state, playerId), ctx);
    }
    if (state.phase === 'TALLY') {
      if (matchOver(state, ctx.settings)) {
        return {
          state: { ...state, phase: 'END' },
          effects: [{ type: 'phase', phase: 'END', durationMs: null }, { type: 'endRound' }],
        };
      }
      return startDeal(state, state.deal + 1, ctx);
    }
    return { state };
  },

  onPlayersChanged(state, ctx) {
    if (state.phase !== 'TURN') return { state };
    const away = isAway(currentPlayer(state), ctx.players);
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
    if (currentPlayer(state) !== playerId) return reject('INVALID_INPUT');
    if (!handOf(state, playerId).includes(input.cardId)) return reject('INVALID_INPUT');
    return play(state, playerId, input.cardId, ctx);
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * PISTI_POINT_SCALE * ctx.scoreMultiplier);
    const won = state.phase === 'END' ? winners(state) : [];
    return ctx.players.map((player): ScoreResult => {
      const seat = state.seats.indexOf(player.id);
      if (seat === -1 || state.phase === 'SKIPPED') {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const side = sideOf(seat, state.teams);
      const gamePoints = state.scores[side] ?? 0;
      return {
        playerId: player.id,
        points: scaled(gamePoints),
        correct: won.includes(side),
        responseTimeMs: null,
        answer: { side, gamePoints },
        breakdown: { game: scaled(gamePoints) },
      };
    });
  },

  getHostView(state, ctx) {
    const title = ctx.content.title;
    if (state.phase === 'SKIPPED')
      return { phase: 'SKIPPED', title, minPlayers: PISTI_MIN_PLAYERS };
    if (state.phase === 'END') {
      return {
        phase: 'END',
        title,
        teams: state.teams,
        sides: sidesOf(state),
        winners: winners(state),
      };
    }
    if (state.phase === 'TALLY')
      return { phase: 'TALLY', ...tableOf(state, ctx), tally: state.tally };
    return { phase: 'TURN', ...tableOf(state, ctx) };
  },

  getPlayerView(state, playerId, ctx) {
    const title = ctx.content.title;
    if (state.phase === 'SKIPPED')
      return { phase: 'SKIPPED', title, minPlayers: PISTI_MIN_PLAYERS };
    const seated = state.seats.includes(playerId);
    const mySide = seated ? sideOfPlayer(state, playerId) : null;
    if (state.phase === 'END') {
      return {
        phase: 'END',
        title,
        teams: state.teams,
        sides: sidesOf(state),
        winners: winners(state),
        mySide,
      };
    }
    const hand = seated ? handOf(state, playerId).map(cardOf).sort(compareCards) : null;
    if (state.phase === 'TALLY') {
      return { phase: 'TALLY', ...tableOf(state, ctx), tally: state.tally, hand, mySide };
    }
    return { phase: 'TURN', ...tableOf(state, ctx), hand, mySide };
  },
};
