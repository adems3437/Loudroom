import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import { isAway, nextSeat, rollDie, seatPlayers, turnPhase } from '@loudroom/table-kit';
import {
  isHome,
  movesOf,
  onlySixHelps,
  slotsFor,
  trackLength,
  type BoardSlots,
  type Move,
  type Seat,
} from './board.js';
import { kizmaImporter } from './import.js';
import {
  KIZMA_DEFAULT_SETTINGS,
  KIZMA_GAME_TYPE,
  KIZMA_MIN_PLAYERS,
  kizmaContentSchema,
  kizmaHostViewSchema,
  kizmaInputSchema,
  kizmaPlayerViewSchema,
  kizmaSettingsSchema,
  type KizmaContent,
  type KizmaEvent,
  type KizmaHostView,
  type KizmaInput,
  type KizmaPlayerView,
  type KizmaSettings,
} from './schema.js';

export * from './schema.js';
export * from './board.js';
export { kizmaImporter } from './import.js';

export type KizmaPhase = 'ROLL' | 'MOVE' | 'END' | 'SKIPPED';

export interface KizmaState {
  phase: KizmaPhase;
  /** Seeds every roll. Never leaves the server. */
  seed: number;
  /** Rolls so far: the next roll is roll number `rolls`. */
  rolls: number;
  slots: BoardSlots;
  seats: Seat[];
  /** Index into `seats`. */
  turn: number;
  die: number | null;
  /** Rolls left in this turn when only a 6 helps; 1 otherwise. */
  triesLeft: number;
  /** In finishing order. */
  finished: string[];
  bot: boolean;
  startedAt: number;
  last: KizmaEvent | null;
  endedBy: 'finished' | 'time' | null;
}

type Ctx = RoundContext<KizmaContent, KizmaSettings>;
type Step = Transition<KizmaState>;

const current = (state: KizmaState): Seat =>
  state.seats[state.turn] ?? { playerId: '', slot: 0, pawns: [] };

function clock(state: KizmaState, phase: 'ROLL' | 'MOVE', ctx: Ctx) {
  const turnMs = phase === 'ROLL' ? ctx.settings.rollMs : ctx.settings.moveMs;
  return turnPhase(phase, current(state).playerId, ctx.players, { ...ctx.settings, turnMs });
}

/** Total steps taken by a player's pawns (the yard counts as nothing). */
const progressOf = (seat: Seat) => seat.pawns.reduce((sum, p) => sum + Math.max(0, p + 1), 0);
const homeCount = (seat: Seat, slots: BoardSlots) =>
  seat.pawns.filter((p) => p >= trackLength(slots)).length;

/** Finishers in order, then the others by pawns home and progress (seat order on a tie). */
function ranking(state: KizmaState): Seat[] {
  const finishedSeats = state.finished.flatMap((id) =>
    state.seats.filter((s) => s.playerId === id),
  );
  const rest = state.seats
    .filter((seat) => !state.finished.includes(seat.playerId))
    .map((seat, order) => ({ seat, order }))
    .sort(
      (a, b) =>
        homeCount(b.seat, state.slots) - homeCount(a.seat, state.slots) ||
        progressOf(b.seat) - progressOf(a.seat) ||
        a.order - b.order,
    )
    .map(({ seat }) => seat);
  return [...finishedSeats, ...rest];
}

function finish(state: KizmaState, endedBy: 'finished' | 'time'): Step {
  return {
    state: { ...state, phase: 'END', endedBy, die: null },
    effects: [{ type: 'phase', phase: 'END', durationMs: null }, { type: 'endRound' }],
  };
}

/** The current player rolls (again, after a 6 or a failed try for a 6). */
function beginTurn(state: KizmaState, ctx: Ctx, triesLeft?: number): Step {
  if (ctx.now - state.startedAt >= ctx.settings.matchMs) return finish(state, 'time');
  const tries = triesLeft ?? (onlySixHelps(current(state), state.slots) ? 3 : 1);
  const { effect, bot } = clock(state, 'ROLL', ctx);
  return {
    state: { ...state, phase: 'ROLL', die: null, triesLeft: tries, bot },
    effects: [effect],
  };
}

/** The next player who has not finished. */
function nextPlayer(state: KizmaState, ctx: Ctx): Step {
  const count = state.seats.length;
  const order = state.seats.map((_, step) => nextSeat(state.turn, count, 1, step + 1));
  const turn =
    order.find((seat) => !state.finished.includes(state.seats[seat]?.playerId ?? '')) ?? state.turn;
  return beginTurn({ ...state, turn }, ctx);
}

function applyMove(state: KizmaState, move: Move, ctx: Ctx): Step {
  const mover = current(state).playerId;
  const seats = state.seats.map((seat) => {
    if (seat.playerId === mover) {
      return { ...seat, pawns: seat.pawns.map((p, i) => (i === move.pawn ? move.to : p)) };
    }
    if (seat.playerId === move.captured?.playerId) {
      return { ...seat, pawns: seat.pawns.map((p, i) => (i === move.captured?.pawn ? -1 : p)) };
    }
    return seat;
  });
  let next: KizmaState = {
    ...state,
    seats,
    last: { kind: 'move', playerId: mover, ...move },
  };
  const moved = next.seats[next.turn];
  if (moved && isHome(moved, next.slots) && !next.finished.includes(mover)) {
    next = { ...next, finished: [...next.finished, mover] };
    const playing = next.seats.filter((seat) => !next.finished.includes(seat.playerId));
    if (playing.length <= 1) {
      return finish(
        { ...next, finished: [...next.finished, ...playing.map((s) => s.playerId)] },
        'finished',
      );
    }
    return nextPlayer(next, ctx);
  }
  // A 6 earns another roll.
  return state.die === 6 ? beginTurn(next, ctx) : nextPlayer(next, ctx);
}

function roll(state: KizmaState, ctx: Ctx): Step {
  const value = rollDie(state.seed, state.rolls);
  const seat = current(state);
  const rolled: KizmaState = {
    ...state,
    rolls: state.rolls + 1,
    die: value,
    last: { kind: 'roll', playerId: seat.playerId, value },
  };
  const moves = movesOf(state.seats, seat, value, state.slots);
  if (moves.length === 0) {
    const passed: KizmaState = {
      ...rolled,
      last: { kind: 'pass', playerId: seat.playerId, value },
    };
    if (value === 6) return beginTurn(passed, ctx);
    if (state.triesLeft > 1) return beginTurn(passed, ctx, state.triesLeft - 1);
    return nextPlayer(passed, ctx);
  }
  const only = moves[0];
  if (ctx.settings.autoMove && moves.length === 1 && only) return applyMove(rolled, only, ctx);
  const { effect, bot } = clock(rolled, 'MOVE', ctx);
  return { state: { ...rolled, phase: 'MOVE', bot }, effects: [effect] };
}

/** Takes a pawn if it can, else brings one out, else moves one home, else the one in front. */
export function botMove(moves: readonly Move[], track: number): Move | undefined {
  const score = (move: Move) =>
    (move.captured ? 1000 : 0) +
    (move.from < 0 ? 500 : 0) +
    (move.to >= track ? 250 : 0) +
    move.from;
  return [...moves].sort((a, b) => score(b) - score(a))[0];
}

function playForCurrent(state: KizmaState, ctx: Ctx): Step {
  const moves = movesOf(state.seats, current(state), state.die ?? 0, state.slots);
  const choice = botMove(moves, trackLength(state.slots));
  return choice ? applyMove(state, choice, ctx) : nextPlayer(state, ctx);
}

function boardOf(state: KizmaState) {
  return {
    slots: state.slots,
    track: trackLength(state.slots),
    players: state.seats.map((seat) => {
      const place = state.finished.indexOf(seat.playerId);
      return { ...seat, pawns: [...seat.pawns], place: place === -1 ? null : place + 1 };
    }),
  };
}

function tableOf(state: KizmaState, ctx: Ctx) {
  const movable =
    state.phase === 'MOVE'
      ? movesOf(state.seats, current(state), state.die ?? 0, state.slots).map((m) => m.pawn)
      : [];
  return {
    title: ctx.content.title,
    board: boardOf(state),
    turn: current(state).playerId,
    die: state.die,
    movable,
    triesLeft: state.triesLeft,
    bot: state.bot,
    last: state.last,
  };
}

function endedOf(state: KizmaState, ctx: Ctx) {
  return {
    title: ctx.content.title,
    board: boardOf(state),
    endedBy: state.endedBy ?? 'finished',
    ranking: ranking(state).map((seat) => ({
      playerId: seat.playerId,
      home: homeCount(seat, state.slots),
      progress: progressOf(seat),
    })),
  };
}

export const kizmaModule: GameModule<
  KizmaContent,
  KizmaSettings,
  KizmaState,
  KizmaInput,
  KizmaHostView,
  KizmaPlayerView
> = {
  id: KIZMA_GAME_TYPE,
  name: 'Kızma Birader',
  version: 1,
  contentSchema: kizmaContentSchema,
  settingsSchema: kizmaSettingsSchema,
  defaultSettings: KIZMA_DEFAULT_SETTINGS,
  inputSchema: kizmaInputSchema,
  hostViewSchema: kizmaHostViewSchema,
  playerViewSchema: kizmaPlayerViewSchema,
  capabilities: { minPlayers: KIZMA_MIN_PLAYERS, maxPlayers: 100 },
  importer: kizmaImporter,

  createRound(ctx) {
    const slots = ctx.settings.board;
    const { seats: ids } = seatPlayers(ctx.players, slots);
    const places = slotsFor(ids.length, slots);
    const state: KizmaState = {
      phase: 'ROLL',
      seed: ctx.random.int(0, 2 ** 31 - 1),
      rolls: 0,
      slots,
      seats: ids.map((playerId, i) => ({
        playerId,
        slot: places[i] ?? i,
        pawns: Array.from({ length: ctx.settings.pawns }, () => -1),
      })),
      turn: 0,
      die: null,
      triesLeft: 3,
      finished: [],
      bot: false,
      startedAt: ctx.now,
      last: null,
      endedBy: null,
    };
    if (ids.length < KIZMA_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    return beginTurn(state, ctx);
  },

  onTimer(state, ctx) {
    // Time is up (or a bot's pause is over): the roll and the move are made for the player.
    if (state.phase === 'ROLL') {
      const rolled = roll(state, ctx);
      return rolled.state.phase === 'MOVE' ? playForCurrent(rolled.state, ctx) : rolled;
    }
    if (state.phase === 'MOVE') return playForCurrent(state, ctx);
    return { state };
  },

  onPlayersChanged(state, ctx) {
    if (state.phase !== 'ROLL' && state.phase !== 'MOVE') return { state };
    const away = isAway(current(state).playerId, ctx.players);
    if ((ctx.settings.bots && away && !state.bot) || (!away && state.bot)) {
      const { effect, bot } = clock(state, state.phase, ctx);
      return { state: { ...state, bot }, effects: [effect] };
    }
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: InputRejectCode): Step => ({
      state,
      effects: [{ type: 'reject', playerId: meta.playerId, code }],
    });
    if (state.phase !== 'ROLL' && state.phase !== 'MOVE') return reject('ROUND_CLOSED');
    if (current(state).playerId !== meta.playerId) return reject('INVALID_INPUT');
    if (input.type === 'roll') {
      return state.phase === 'ROLL' ? roll(state, ctx) : reject('INVALID_INPUT');
    }
    if (state.phase !== 'MOVE') return reject('INVALID_INPUT');
    const move = movesOf(state.seats, current(state), state.die ?? 0, state.slots).find(
      (m) => m.pawn === input.pawn,
    );
    return move ? applyMove(state, move, ctx) : reject('INVALID_INPUT');
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    const { firstPoints, secondPoints, thirdPoints, otherPoints } = ctx.settings;
    const order = state.phase === 'END' ? ranking(state) : [];
    return ctx.players.map((player): ScoreResult => {
      const place = order.findIndex((seat) => seat.playerId === player.id);
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
      const points = scaled([firstPoints, secondPoints, thirdPoints][place] ?? otherPoints);
      return {
        playerId: player.id,
        points,
        correct: place === 0,
        responseTimeMs: null,
        answer: { place: place + 1 },
        breakdown: { place: points },
      };
    });
  },

  getHostView(state, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: KIZMA_MIN_PLAYERS };
    }
    if (state.phase === 'END') return { phase: 'END', ...endedOf(state, ctx) };
    return { phase: state.phase, ...tableOf(state, ctx) };
  },

  getPlayerView(state, playerId, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: KIZMA_MIN_PLAYERS };
    }
    const seated = state.seats.some((seat) => seat.playerId === playerId);
    if (state.phase === 'END') return { phase: 'END', ...endedOf(state, ctx), seated };
    return { phase: state.phase, ...tableOf(state, ctx), seated };
  },
};
