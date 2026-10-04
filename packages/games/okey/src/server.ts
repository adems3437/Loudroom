import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import { HOST_INPUT_SENDER } from '@loudroom/game-sdk';
import { isAway, nextSeat, seatPlayers, shuffleWith, sideOf, turnPhase } from '@loudroom/table-kit';
import { okeyImporter } from './import.js';
import {
  ALL_TILES,
  OKEY_DEFAULT_SETTINGS,
  OKEY_GAME_TYPE,
  OKEY_MIN_PLAYERS,
  OKEY_SEATS,
  RACK_SLOTS,
  arrangeRuns,
  completesGroup,
  findFinish,
  isWild,
  okeyContentSchema,
  okeyHostInputSchema,
  okeyHostViewSchema,
  okeyInputSchema,
  okeyOf,
  okeyPlayerViewSchema,
  okeySettingsSchema,
  sameFace,
  tileOf,
  tileWorth,
  type Face,
  type OkeyContent,
  type OkeyEvent,
  type OkeyHostInput,
  type OkeyHostView,
  type OkeyInput,
  type OkeyPlayerView,
  type OkeySettings,
  type OkeyTally,
} from './schema.js';

export * from './schema.js';
export { okeyImporter } from './import.js';

export type OkeyPhase = 'SETUP' | 'TURN' | 'TALLY' | 'END' | 'SKIPPED';
type Slots = (number | null)[];

export interface OkeyState {
  phase: OkeyPhase;
  /** Seeds every deal's shuffle (`deal:<hand>`). */
  seed: number;
  /** Players' ids, and `bot:n` for the bots in empty seats; turns go up the seats. */
  seats: string[];
  teams: boolean;
  /** Hands to play, and the one being played (1-based). */
  hands: number;
  hand: number;
  startPoints: number;
  /** Per side (a seat alone, or partners 0+2 / 1+3). */
  points: number[];
  wins: number[];
  /** What each side lost so far this hand (the indicator shown). */
  handLost: number[];
  /** Each seat's 30 rack slots. A rack reaches only its owner. */
  racks: Record<string, Slots>;
  /** The middle, top first. Never leaves the server. */
  deck: number[];
  /** The pile each seat discards onto, top last; the next seat may take its top. */
  discards: Record<string, number[]>;
  indicator: number;
  /** Seat that started this hand (15 tiles, discards without drawing). */
  starter: number;
  turn: number;
  /** The current seat has its 15th tile and must discard or finish. */
  drew: boolean;
  /** Seats that discarded this hand (their first turn is over: no more showing). */
  played: string[];
  shown: boolean;
  /** The running turn clock is a bot's pause. */
  bot: boolean;
  /** When the dealing began (the match time limit). */
  startedAt: number;
  last: OkeyEvent | null;
  tally: OkeyTally | null;
  endedBy: 'hands' | 'zero' | 'time' | null;
}

type Ctx = RoundContext<OkeyContent, OkeySettings>;
type Step = Transition<OkeyState>;

export const botNumber = (seat: string): number | null =>
  seat.startsWith('bot:') ? Number(seat.slice(4)) : null;
const isBotSeat = (seat: string) => botNumber(seat) !== null;

const current = (state: OkeyState) => state.seats[state.turn] ?? '';
const sideCount = (state: OkeyState) => (state.teams ? 2 : state.seats.length);
const sideOfSeat = (state: OkeyState, seat: string) =>
  sideOf(state.seats.indexOf(seat), state.teams);
const slotsOf = (state: OkeyState, seat: string): Slots =>
  state.racks[seat] ?? Array.from({ length: RACK_SLOTS }, () => null);
export const tilesOf = (slots: readonly (number | null)[]) =>
  slots.filter((id): id is number => id !== null);
const rackTiles = (state: OkeyState, seat: string) => tilesOf(slotsOf(state, seat));
const leftOf = (state: OkeyState, seat: number) =>
  state.seats[nextSeat(seat, state.seats.length, -1)] ?? '';
const leftPile = (state: OkeyState) => state.discards[leftOf(state, state.turn)] ?? [];

export function okeyFaceOf(state: OkeyState): Face {
  const indicator = tileOf(state.indicator);
  return okeyOf(indicator.fake ? { color: 'red', number: 1 } : indicator);
}

/** A tile with the indicator's face (not the indicator itself, which is face up). */
function twinOf(state: OkeyState, seat: string): number | null {
  const indicator = tileOf(state.indicator);
  if (indicator.fake) return null;
  return (
    rackTiles(state, seat).find((id) => {
      const tile = tileOf(id);
      return !tile.fake && id !== state.indicator && sameFace(tile, indicator);
    }) ?? null
  );
}

const canShow = (state: OkeyState, seat: string) =>
  state.phase === 'TURN' &&
  current(state) === seat &&
  !state.shown &&
  !state.played.includes(seat) &&
  twinOf(state, seat) !== null;

function withTile(slots: Slots, tile: number, slot: number | undefined): Slots {
  const next = [...slots];
  const at = slot !== undefined && next[slot] === null ? slot : next.indexOf(null);
  if (at !== -1) next[at] = tile;
  return next;
}

const withoutTile = (slots: Slots, tile: number): Slots =>
  slots.map((id) => (id === tile ? null : id));

/** Shuffles the 106 tiles, turns up the indicator, deals 15 to the starter and 14 to the rest. */
function deal(state: OkeyState, ctx: Ctx): Step {
  const shuffled = shuffleWith(state.seed, `deal:${state.hand}`, ALL_TILES);
  const indicator = shuffled.find((id) => !tileOf(id).fake) ?? 0;
  let deck = shuffled.filter((id) => id !== indicator);
  const okey = okeyFaceOf({ ...state, indicator });
  const racks: Record<string, Slots> = {};
  for (let i = 0; i < state.seats.length; i++) {
    const seat = nextSeat(state.starter, state.seats.length, 1, i);
    const count = i === 0 ? 15 : 14;
    racks[state.seats[seat] ?? ''] = arrangeRuns(deck.slice(0, count), okey);
    deck = deck.slice(count);
  }
  return beginTurn(
    {
      ...state,
      phase: 'TURN',
      racks,
      deck,
      discards: Object.fromEntries(state.seats.map((seat) => [seat, []])),
      indicator,
      turn: state.starter,
      drew: true,
      played: [],
      shown: false,
      handLost: Array.from({ length: sideCount(state) }, () => 0),
      last: null,
      tally: null,
    },
    ctx,
  );
}

function finishMatch(state: OkeyState, endedBy: 'hands' | 'zero' | 'time'): Step {
  return {
    state: { ...state, phase: 'END', endedBy, bot: false },
    effects: [{ type: 'phase', phase: 'END', durationMs: null }, { type: 'endRound' }],
  };
}

const timeUp = (state: OkeyState, ctx: Ctx) => ctx.now - state.startedAt >= ctx.settings.matchMs;

/** Starts the current seat's turn; an empty middle ends the hand without a winner. */
function beginTurn(state: OkeyState, ctx: Ctx): Step {
  if (timeUp(state, ctx)) return finishMatch(state, 'time');
  if (!state.drew && state.deck.length === 0) {
    return endHand(state, ctx, {
      winner: null,
      kind: 'draw',
      groups: null,
      tile: null,
      lost: state.handLost,
    });
  }
  const seat = current(state);
  if (isBotSeat(seat)) {
    return {
      state: { ...state, bot: true },
      effects: [{ type: 'phase', phase: 'TURN', durationMs: ctx.settings.botDelayMs }],
    };
  }
  const { effect, bot } = turnPhase('TURN', seat, ctx.players, ctx.settings);
  return { state: { ...state, bot }, effects: [effect] };
}

function endHand(state: OkeyState, ctx: Ctx, tally: OkeyTally): Step {
  return {
    state: { ...state, phase: 'TALLY', tally, drew: false, bot: false },
    effects: [{ type: 'phase', phase: 'TALLY', durationMs: ctx.settings.tallyMs }],
  };
}

function draw(state: OkeyState, seat: string, slot?: number): OkeyState {
  const [tile, ...deck] = state.deck;
  if (tile === undefined) return state;
  return {
    ...state,
    deck,
    racks: { ...state.racks, [seat]: withTile(slotsOf(state, seat), tile, slot) },
    drew: true,
    last: { kind: 'draw', seat },
  };
}

function take(state: OkeyState, seat: string, slot?: number): OkeyState {
  const from = leftOf(state, state.turn);
  const pile = state.discards[from] ?? [];
  const tile = pile.at(-1);
  if (tile === undefined) return state;
  return {
    ...state,
    discards: { ...state.discards, [from]: pile.slice(0, -1) },
    racks: { ...state.racks, [seat]: withTile(slotsOf(state, seat), tile, slot) },
    drew: true,
    last: { kind: 'take', seat, tile },
  };
}

function discard(state: OkeyState, seat: string, tile: number, ctx: Ctx): Step {
  return beginTurn(
    {
      ...state,
      racks: { ...state.racks, [seat]: withoutTile(slotsOf(state, seat), tile) },
      discards: { ...state.discards, [seat]: [...(state.discards[seat] ?? []), tile] },
      played: state.played.includes(seat) ? state.played : [...state.played, seat],
      drew: false,
      turn: nextSeat(state.turn, state.seats.length),
      last: { kind: 'discard', seat, tile },
    },
    ctx,
  );
}

/** Points the other sides lose: 2, doubled for finishing on the okey and for seven pairs. */
export function finishPenalty(kind: OkeyTally['kind']): number {
  return kind === 'both' ? 8 : kind === 'okey' || kind === 'pairs' ? 4 : kind === 'normal' ? 2 : 0;
}

/** Puts `tile` down to finish; null when the other 14 do not finish. */
function finish(state: OkeyState, seat: string, tile: number, ctx: Ctx): Step | null {
  const okey = okeyFaceOf(state);
  const rest = rackTiles(state, seat).filter((id) => id !== tile);
  const found = findFinish(rest, okey);
  if (!found) return null;
  const onOkey = isWild(tile, okey);
  const pairs = found.kind === 'pairs';
  const kind = onOkey && pairs ? 'both' : onOkey ? 'okey' : pairs ? 'pairs' : 'normal';
  const side = sideOfSeat(state, seat);
  const penalty = finishPenalty(kind);
  const lost = state.handLost.map((sum, s) => sum + (s === side ? 0 : penalty));
  const next: OkeyState = {
    ...state,
    points: state.points.map((points, s) => points - (s === side ? 0 : penalty)),
    wins: state.wins.map((wins, s) => wins + (s === side ? 1 : 0)),
    racks: { ...state.racks, [seat]: withoutTile(slotsOf(state, seat), tile) },
  };
  return endHand(next, ctx, { winner: seat, kind, groups: found.groups, tile, lost });
}

function show(state: OkeyState, seat: string): OkeyState {
  const tile = twinOf(state, seat) ?? 0;
  const side = sideOfSeat(state, seat);
  return {
    ...state,
    shown: true,
    points: state.points.map((points, s) => points - (s === side ? 0 : 1)),
    handLost: state.handLost.map((lost, s) => lost + (s === side ? 0 : 1)),
    last: { kind: 'show', seat, tile },
  };
}

/** After a hand's scoreboard: the next hand (the starter moves on), or the end of the match. */
function afterTally(state: OkeyState, ctx: Ctx): Step {
  if (state.points.some((points) => points <= 0)) return finishMatch(state, 'zero');
  if (state.hand >= state.hands) return finishMatch(state, 'hands');
  if (timeUp(state, ctx)) return finishMatch(state, 'time');
  return deal(
    {
      ...state,
      hand: state.hand + 1,
      starter: nextSeat(state.starter, state.seats.length),
    },
    ctx,
  );
}

function startMatch(state: OkeyState, choice: Omit<OkeyHostInput, 'type'>, ctx: Ctx): Step {
  const sides = choice.teams ? 2 : state.seats.length;
  return deal(
    {
      ...state,
      teams: choice.teams,
      hands: choice.hands,
      startPoints: choice.startPoints,
      points: Array.from({ length: sides }, () => choice.startPoints),
      wins: Array.from({ length: sides }, () => 0),
      startedAt: ctx.now,
    },
    ctx,
  );
}

/**
 * A bot's turn (also a present player's when time runs out): shows the indicator's twin, takes
 * the left tile when it completes a group (else draws), finishes when it can — on the okey if that
 * works — and otherwise discards the tile that helps least (never a wild one).
 */
export function botMove(state: OkeyState, ctx: Ctx): Step {
  const seat = current(state);
  const okey = okeyFaceOf(state);
  let next = canShow(state, seat) ? show(state, seat) : state;
  if (!next.drew) {
    const left = leftPile(next).at(-1);
    const rack = rackTiles(next, seat);
    // Taking keeps the middle full and drags the hand out: only for a tile that completes a
    // group (or the okey).
    const wanted = left !== undefined && (isWild(left, okey) || completesGroup(left, rack, okey));
    next = wanted || next.deck.length === 0 ? take(next, seat) : draw(next, seat);
  }
  const rack = rackTiles(next, seat);
  const byWorth = [...rack].sort(
    (a, b) => tileWorth(a, rack, okey) - tileWorth(b, rack, okey) || b - a,
  );
  for (const tile of [...rack.filter((id) => isWild(id, okey)), ...byWorth]) {
    const finished = finish(next, seat, tile, ctx);
    if (finished) return finished;
  }
  const throwAway = byWorth.find((id) => !isWild(id, okey)) ?? byWorth[0] ?? 0;
  return discard(next, seat, throwAway, ctx);
}

const seatsOf = (state: OkeyState) =>
  state.seats.map((id, seat) => ({
    id,
    bot: botNumber(id),
    side: sideOf(seat, state.teams),
    count: rackTiles(state, id).length,
    discard: state.discards[id]?.at(-1) ?? null,
    discardCount: state.discards[id]?.length ?? 0,
  }));

const tableOf = (state: OkeyState, ctx: Ctx) => ({
  title: ctx.content.title,
  hand: state.hand,
  hands: state.hands,
  teams: state.teams,
  seats: seatsOf(state),
  sides: state.points.map((points, side) => ({ points, wins: state.wins[side] ?? 0 })),
  turn: current(state),
  drew: state.drew,
  indicator: state.indicator,
  okey: okeyFaceOf(state),
  deckCount: state.deck.length,
  bot: state.bot,
  last: state.last,
});

/** Sides by points left, then hands finished, then side order; every seat with its place. */
export function ranking(state: OkeyState) {
  const order = state.points
    .map((points, side) => ({ side, points, wins: state.wins[side] ?? 0 }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.side - b.side);
  return order.flatMap(({ side, points, wins }, place) =>
    state.seats
      .map((id, seat) => ({ id, seat }))
      .filter(({ seat }) => sideOf(seat, state.teams) === side)
      .map(({ id }) => ({ id, bot: botNumber(id), side, points, wins, place: place + 1 })),
  );
}

const resultOf = (state: OkeyState, ctx: Ctx) => ({
  title: ctx.content.title,
  teams: state.teams,
  endedBy: state.endedBy ?? 'hands',
  ranking: ranking(state),
});

const setupOf = (state: OkeyState, ctx: Ctx) => ({
  title: ctx.content.title,
  seats: state.seats.map((id) => ({ id, bot: botNumber(id) })),
  defaults: {
    hands: ctx.settings.hands,
    startPoints: ctx.settings.startPoints,
    teams: ctx.settings.teams,
  },
});

export const okeyModule: GameModule<
  OkeyContent,
  OkeySettings,
  OkeyState,
  OkeyInput,
  OkeyHostView,
  OkeyPlayerView,
  never,
  OkeyHostInput
> = {
  id: OKEY_GAME_TYPE,
  name: 'Okey',
  version: 1,
  contentSchema: okeyContentSchema,
  settingsSchema: okeySettingsSchema,
  defaultSettings: OKEY_DEFAULT_SETTINGS,
  inputSchema: okeyInputSchema,
  hostInputSchema: okeyHostInputSchema,
  hostViewSchema: okeyHostViewSchema,
  playerViewSchema: okeyPlayerViewSchema,
  capabilities: { minPlayers: OKEY_MIN_PLAYERS, maxPlayers: 100 },
  importer: okeyImporter,

  createRound(ctx) {
    const { seats: players } = seatPlayers(ctx.players, OKEY_SEATS);
    const bots = Array.from(
      { length: Math.max(0, OKEY_SEATS - players.length) },
      (_, i) => `bot:${i + 1}`,
    );
    const seats = [...players, ...bots];
    const state: OkeyState = {
      phase: 'SETUP',
      seed: ctx.random.int(0, 2 ** 31 - 1),
      seats,
      teams: ctx.settings.teams,
      hands: ctx.settings.hands,
      hand: 1,
      startPoints: ctx.settings.startPoints,
      points: [],
      wins: [],
      handLost: [],
      racks: {},
      deck: [],
      discards: {},
      indicator: 0,
      starter: ctx.random.int(0, seats.length - 1),
      turn: 0,
      drew: false,
      played: [],
      shown: false,
      bot: false,
      startedAt: ctx.now,
      last: null,
      tally: null,
      endedBy: null,
    };
    if (players.length < OKEY_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    return {
      state,
      effects: [{ type: 'phase', phase: 'SETUP', durationMs: ctx.settings.setupMs }],
    };
  },

  onHostInput(state, input, ctx) {
    if (state.phase !== 'SETUP') {
      return {
        state,
        effects: [{ type: 'reject', playerId: HOST_INPUT_SENDER, code: 'ROUND_CLOSED' }],
      };
    }
    return startMatch(state, input, ctx);
  },

  onTimer(state, ctx) {
    if (state.phase === 'SETUP') return startMatch(state, ctx.settings, ctx);
    if (state.phase === 'TALLY') return afterTally(state, ctx);
    if (state.phase !== 'TURN') return { state };
    return botMove(state, ctx);
  },

  onPlayersChanged(state, ctx) {
    if (state.phase !== 'TURN' || isBotSeat(current(state))) return { state };
    const away = isAway(current(state), ctx.players);
    // An away player's turn goes to a bot at once; a returning one gets their turn back.
    if ((ctx.settings.bots && away && !state.bot) || (!away && state.bot)) {
      const { effect, bot } = turnPhase('TURN', current(state), ctx.players, ctx.settings);
      return { state: { ...state, bot }, effects: [effect] };
    }
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const seat = meta.playerId;
    const reject = (code: InputRejectCode): Step => ({
      state,
      effects: [{ type: 'reject', playerId: seat, code }],
    });
    if (state.phase !== 'TURN' && state.phase !== 'TALLY') return reject('ROUND_CLOSED');
    if (!state.seats.includes(seat)) return reject('INVALID_INPUT');

    if (input.type === 'arrange') {
      const tiles = rackTiles(state, seat);
      const placed = tilesOf(input.slots);
      const same =
        placed.length === tiles.length &&
        new Set(placed).size === placed.length &&
        placed.every((id) => tiles.includes(id));
      if (!same) return reject('INVALID_INPUT');
      return { state: { ...state, racks: { ...state.racks, [seat]: input.slots } } };
    }

    if (state.phase !== 'TURN' || current(state) !== seat) return reject('INVALID_INPUT');
    switch (input.type) {
      case 'show':
        return canShow(state, seat) ? { state: show(state, seat) } : reject('INVALID_INPUT');
      case 'draw':
        if (state.drew || state.deck.length === 0) return reject('INVALID_INPUT');
        return { state: draw(state, seat, input.slot) };
      case 'take':
        if (state.drew || leftPile(state).length === 0) return reject('INVALID_INPUT');
        return { state: take(state, seat, input.slot) };
      case 'discard':
        if (!state.drew || !rackTiles(state, seat).includes(input.tile))
          return reject('INVALID_INPUT');
        return discard(state, seat, input.tile, ctx);
      case 'finish': {
        if (!state.drew || !rackTiles(state, seat).includes(input.tile))
          return reject('INVALID_INPUT');
        return finish(state, seat, input.tile, ctx) ?? reject('INVALID_INPUT');
      }
    }
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    const { firstPoints, secondPoints, thirdPoints, otherPoints, teamLoserPoints } = ctx.settings;
    const places = state.phase === 'END' ? ranking(state) : [];
    return ctx.players.map((player): ScoreResult => {
      const row = places.find((entry) => entry.id === player.id);
      if (!row) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const earned = state.teams
        ? row.place === 1
          ? firstPoints
          : teamLoserPoints
        : ([firstPoints, secondPoints, thirdPoints][row.place - 1] ?? otherPoints);
      const points = scaled(earned);
      return {
        playerId: player.id,
        points,
        correct: row.place === 1,
        responseTimeMs: null,
        answer: { place: row.place, points: row.points, wins: row.wins },
        breakdown: { place: points },
      };
    });
  },

  getHostView(state, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: OKEY_MIN_PLAYERS };
    }
    if (state.phase === 'SETUP') return { phase: 'SETUP', ...setupOf(state, ctx) };
    if (state.phase === 'END') return { phase: 'END', ...resultOf(state, ctx) };
    if (state.phase === 'TALLY') {
      return { phase: 'TALLY', ...tableOf(state, ctx), tally: state.tally ?? emptyTally(state) };
    }
    return { phase: 'TURN', ...tableOf(state, ctx) };
  },

  getPlayerView(state, playerId, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: OKEY_MIN_PLAYERS };
    }
    const seated = state.seats.includes(playerId);
    if (state.phase === 'SETUP') return { phase: 'SETUP', ...setupOf(state, ctx), seated };
    if (state.phase === 'END') {
      return {
        phase: 'END',
        ...resultOf(state, ctx),
        mySide: seated ? sideOfSeat(state, playerId) : null,
      };
    }
    const myTurn = state.phase === 'TURN' && seated && current(state) === playerId;
    const mine = {
      rack: seated ? slotsOf(state, playerId) : null,
      canDraw: myTurn && !state.drew && state.deck.length > 0,
      canTake: myTurn && !state.drew && leftPile(state).length > 0,
      canDiscard: myTurn && state.drew,
      canShow: seated && canShow(state, playerId),
    };
    if (state.phase === 'TALLY') {
      return {
        phase: 'TALLY',
        ...tableOf(state, ctx),
        ...mine,
        tally: state.tally ?? emptyTally(state),
      };
    }
    return { phase: 'TURN', ...tableOf(state, ctx), ...mine };
  },
};

function emptyTally(state: OkeyState): OkeyTally {
  return {
    winner: null,
    kind: 'draw',
    groups: null,
    tile: null,
    lost: state.handLost,
  };
}
