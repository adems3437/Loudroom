import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import {
  acted,
  isAway,
  isWaiting,
  randomFor,
  seatPlayers,
  startStep,
  stepDone,
  type Lockstep,
} from '@loudroom/table-kit';
import { botTarget, randomFleet, shotAt, validFleet } from './fleet.js';
import { amiralImporter } from './import.js';
import {
  AMIRAL_DEFAULT_SETTINGS,
  AMIRAL_GAME_TYPE,
  AMIRAL_MIN_PLAYERS,
  FLEETS,
  amiralContentSchema,
  amiralHostViewSchema,
  amiralInputSchema,
  amiralPlayerViewSchema,
  amiralSettingsSchema,
  type AmiralContent,
  type AmiralHostView,
  type AmiralInput,
  type AmiralPlayerView,
  type AmiralSettings,
  type DuelView,
  type Placement,
  type Shot,
} from './schema.js';

export * from './schema.js';
export * from './fleet.js';
export { amiralImporter } from './import.js';

export type AmiralPhase = 'PLACE' | 'BATTLE' | 'END' | 'SKIPPED';
type Letter = 'a' | 'b';

export interface AmiralSide {
  members: string[];
  /** Reaches only the side's members. */
  fleet: Placement[] | null;
  ready: boolean;
  /** Shots fired so far: the next shooter is members[rotation mod size]. */
  rotation: number;
}

export interface AmiralDuel {
  id: string;
  round: number;
  a: number;
  /** Null for a bye: side a goes through. */
  b: number | null;
  turn: Letter;
  /** Shots fired by each side (at the other's fleet). */
  shots: Record<Letter, Shot[]>;
  winner: Letter | null;
  lastHit: boolean;
}

export interface AmiralState {
  phase: AmiralPhase;
  /** Seeds the bracket, random fleets and bot shots. Never leaves the server. */
  seed: number;
  randoms: number;
  grid: number;
  sizes: number[];
  sides: AmiralSide[];
  /** Every duel of the match; the current round's are those with `round === bracketRound`. */
  duels: AmiralDuel[];
  bracketRound: number;
  /** Duels whose side to move has not fired in this step. */
  step: Lockstep;
  /** The running clock is a bot's pause. */
  bot: boolean;
  /** Round in which each side lost. */
  lostIn: Record<number, number>;
}

type Ctx = RoundContext<AmiralContent, AmiralSettings>;
type Step = Transition<AmiralState>;

const other = (letter: Letter): Letter => (letter === 'a' ? 'b' : 'a');
const sideAt = (duel: AmiralDuel, letter: Letter) => (letter === 'a' ? duel.a : duel.b);
const currentDuels = (state: AmiralState) =>
  state.duels.filter((d) => d.round === state.bracketRound);
const liveDuels = (state: AmiralState) =>
  currentDuels(state).filter((d) => d.b !== null && d.winner === null);
const sideOfPlayer = (state: AmiralState, playerId: string) =>
  state.sides.findIndex((side) => side.members.includes(playerId));

function shooterOf(state: AmiralState, duel: AmiralDuel): string {
  const side = state.sides[sideAt(duel, duel.turn) ?? -1];
  if (!side) return '';
  return side.members[side.rotation % side.members.length] ?? '';
}

/** Sides that place a fleet this round (byes do not). */
function placers(state: AmiralState): number[] {
  return currentDuels(state).flatMap((d) => (d.b === null ? [] : [d.a, d.b]));
}

function nextRandom(state: AmiralState, label: string) {
  return {
    random: randomFor(state.seed, `${label}:${state.randoms}`),
    state: { ...state, randoms: state.randoms + 1 },
  };
}

function pairUp(sides: readonly number[], round: number): AmiralDuel[] {
  const duels: AmiralDuel[] = [];
  for (let i = 0; i < sides.length; i += 2) {
    const a = sides[i] ?? 0;
    const b = sides[i + 1] ?? null;
    duels.push({
      id: `d${round}-${i / 2 + 1}`,
      round,
      a,
      b,
      turn: 'a',
      shots: { a: [], b: [] },
      winner: b === null ? 'a' : null,
      lastHit: false,
    });
  }
  return duels;
}

const sunkCount = (shots: readonly Shot[]) => shots.filter((s) => s.sunk).length;

/** The step's clock: a bot's short pause when every shooter still to fire is away. */
function clock(state: AmiralState, ctx: Ctx, fullMs = ctx.settings.shotMs): Step {
  const pending = liveDuels(state).filter((d) => isWaiting(state.step, d.id));
  const allAway =
    ctx.settings.bots &&
    pending.length > 0 &&
    pending.every((d) => isAway(shooterOf(state, d), ctx.players));
  return {
    state: { ...state, bot: allAway },
    effects: [
      { type: 'phase', phase: 'BATTLE', durationMs: allAway ? ctx.settings.botDelayMs : fullMs },
    ],
  };
}

function place(state: AmiralState, ctx: Ctx): Step {
  return {
    state: { ...state, phase: 'PLACE', bot: false, step: startStep([]) },
    effects: [{ type: 'phase', phase: 'PLACE', durationMs: ctx.settings.placementMs }],
  };
}

function startBattle(state: AmiralState, ctx: Ctx): Step {
  return clock(
    { ...state, phase: 'BATTLE', step: startStep(liveDuels(state).map((d) => d.id)) },
    ctx,
  );
}

function end(state: AmiralState): Step {
  return {
    state: { ...state, phase: 'END', bot: false, step: startStep([]) },
    effects: [{ type: 'phase', phase: 'END', durationMs: null }, { type: 'endRound' }],
  };
}

/** Every duel of the round is decided: the match ends, or the winners meet in the next round. */
function roundOver(state: AmiralState, ctx: Ctx): Step {
  const lostIn = { ...state.lostIn };
  const winners: number[] = [];
  for (const duel of currentDuels(state)) {
    const winner = sideAt(duel, duel.winner ?? 'a');
    const loser = duel.winner === null ? null : sideAt(duel, other(duel.winner));
    if (winner !== null) winners.push(winner);
    if (loser !== null) lostIn[loser] = state.bracketRound;
  }
  const settled = { ...state, lostIn };
  if (ctx.settings.mode === 'teams' || winners.length <= 1) return end(settled);
  const round = state.bracketRound + 1;
  return place(
    {
      ...settled,
      bracketRound: round,
      duels: [...state.duels, ...pairUp(winners, round)],
      // A new opponent: a new fleet.
      sides: state.sides.map((side, i) =>
        winners.includes(i) ? { ...side, fleet: null, ready: false } : side,
      ),
    },
    ctx,
  );
}

/** The step is over: turns pass (or stay after a hit, when set), and the next step starts. */
function nextStep(state: AmiralState, ctx: Ctx): Step {
  const duels = state.duels.map((duel) =>
    duel.round !== state.bracketRound || duel.winner !== null
      ? duel
      : {
          ...duel,
          turn: ctx.settings.extraShotOnHit && duel.lastHit ? duel.turn : other(duel.turn),
        },
  );
  const next = { ...state, duels };
  if (liveDuels(next).length === 0) return roundOver(next, ctx);
  return clock({ ...next, step: startStep(liveDuels(next).map((d) => d.id)) }, ctx);
}

/** Records a shot of the duel's side to move; the duel is won when every ship is sunk. */
function fire(state: AmiralState, duelId: string, x: number, y: number): AmiralState {
  return {
    ...state,
    step: acted(state.step, duelId),
    sides: state.sides.map((side, i) => {
      const duel = state.duels.find((d) => d.id === duelId);
      return duel && sideAt(duel, duel.turn) === i
        ? { ...side, rotation: side.rotation + 1 }
        : side;
    }),
    duels: state.duels.map((duel) => {
      if (duel.id !== duelId) return duel;
      const target = state.sides[sideAt(duel, other(duel.turn)) ?? -1];
      const shot = shotAt(target?.fleet ?? [], state.sizes, duel.shots[duel.turn], x, y);
      const shots = { ...duel.shots, [duel.turn]: [...duel.shots[duel.turn], shot] };
      const won = sunkCount(shots[duel.turn]) === state.sizes.length;
      return { ...duel, shots, lastHit: shot.hit, winner: won ? duel.turn : duel.winner };
    }),
  };
}

function botFire(state: AmiralState, duel: AmiralDuel): AmiralState {
  const next = nextRandom(state, `shot:${duel.id}`);
  const [x, y] = botTarget(duel.shots[duel.turn], state.grid, next.random);
  return fire(next.state, duel.id, x, y);
}

/** Bots fire for the waiting duels (only those with an away shooter, unless `all`). */
function botsFire(state: AmiralState, ctx: Ctx, all: boolean): AmiralState {
  let next = state;
  for (const duel of liveDuels(state)) {
    if (!isWaiting(next.step, duel.id)) continue;
    if (!all && !isAway(shooterOf(next, duel), ctx.players)) continue;
    next = botFire(next, duel);
  }
  return next;
}

/** Final places: teams by result; a tournament by the round each player went out in. */
function ranking(state: AmiralState): { playerId: string; place: number }[] {
  const rounds = state.bracketRound;
  const placeOf = (side: number) => {
    const lost = state.lostIn[side];
    if (lost === undefined) return 1;
    if (state.sides.length === 2) return 2;
    return lost === rounds ? 2 : lost === rounds - 1 ? 3 : 4;
  };
  return state.sides
    .flatMap((side, i) => side.members.map((playerId) => ({ playerId, place: placeOf(i) })))
    .sort((a, b) => a.place - b.place);
}

function duelView(state: AmiralState, duel: AmiralDuel): DuelView {
  const half = (side: number, shotsTaken: Shot[]) => ({
    side,
    shotsTaken,
    shipsLeft: state.sizes.length - sunkCount(shotsTaken),
  });
  return {
    id: duel.id,
    round: duel.round,
    a: half(duel.a, duel.shots.b),
    b: duel.b === null ? null : half(duel.b, duel.shots.a),
    turn: duel.turn,
    shooter: duel.winner === null && duel.b !== null ? shooterOf(state, duel) : null,
    waiting: state.phase === 'BATTLE' && isWaiting(state.step, duel.id),
    winner: duel.winner,
  };
}

function sidesView(state: AmiralState) {
  return state.sides.map((side, i) => ({
    side: i,
    members: side.members,
    captain: side.members[0] ?? '',
    ready: side.ready,
  }));
}

function commonView(state: AmiralState, ctx: Ctx) {
  return {
    title: ctx.content.title,
    mode: ctx.settings.mode,
    grid: state.grid,
    ships: state.sizes,
    sides: sidesView(state),
    duels: currentDuels(state).map((duel) => duelView(state, duel)),
    bracketRound: state.bracketRound,
    bot: state.bot,
  };
}

function endedView(state: AmiralState, ctx: Ctx) {
  const order = ranking(state);
  return {
    title: ctx.content.title,
    mode: ctx.settings.mode,
    sides: sidesView(state),
    duels: state.duels.map((duel) => duelView(state, duel)),
    ranking: order,
    winners: order.filter((row) => row.place === 1).map((row) => row.playerId),
  };
}

export const amiralModule: GameModule<
  AmiralContent,
  AmiralSettings,
  AmiralState,
  AmiralInput,
  AmiralHostView,
  AmiralPlayerView
> = {
  id: AMIRAL_GAME_TYPE,
  name: 'Amiral Battı',
  version: 1,
  contentSchema: amiralContentSchema,
  settingsSchema: amiralSettingsSchema,
  defaultSettings: AMIRAL_DEFAULT_SETTINGS,
  inputSchema: amiralInputSchema,
  hostViewSchema: amiralHostViewSchema,
  playerViewSchema: amiralPlayerViewSchema,
  capabilities: { minPlayers: AMIRAL_MIN_PLAYERS, maxPlayers: 100 },
  importer: amiralImporter,

  createRound(ctx) {
    const { seats } = seatPlayers(ctx.players, 100);
    const fleet = FLEETS[ctx.settings.fleet];
    const seed = ctx.random.int(0, 2 ** 31 - 1);
    const teams = ctx.settings.mode === 'teams';
    const order = teams ? seats : randomFor(seed, 'bracket').shuffle(seats);
    const members = teams
      ? [seats.filter((_, i) => i % 2 === 0), seats.filter((_, i) => i % 2 === 1)]
      : order.map((id) => [id]);
    const sides = members.map((list) => ({
      members: list,
      fleet: null,
      ready: false,
      rotation: 0,
    }));
    const state: AmiralState = {
      phase: 'PLACE',
      seed,
      randoms: 0,
      grid: fleet.grid,
      sizes: [...fleet.ships],
      sides,
      duels: pairUp(
        sides.map((_, i) => i),
        1,
      ),
      bracketRound: 1,
      step: startStep([]),
      bot: false,
      lostIn: {},
    };
    if (seats.length < AMIRAL_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    return place(state, ctx);
  },

  onTimer(state, ctx) {
    if (state.phase === 'PLACE') {
      // Fleets not placed in time are laid out at random.
      let next = state;
      for (const side of placers(state)) {
        if (next.sides[side]?.ready) continue;
        const drawn = nextRandom(next, `fleet:${side}`);
        const fleet = randomFleet(drawn.random, next.sizes, next.grid);
        next = {
          ...drawn.state,
          sides: drawn.state.sides.map((s, i) => (i === side ? { ...s, fleet, ready: true } : s)),
        };
      }
      return startBattle(next, ctx);
    }
    if (state.phase === 'BATTLE') {
      if (state.bot) {
        const next = botsFire(state, ctx, false);
        if (stepDone(next.step)) return nextStep(next, ctx);
        const rest = Math.max(1_000, ctx.settings.shotMs - ctx.settings.botDelayMs);
        return clock(next, ctx, rest);
      }
      return nextStep(botsFire(state, ctx, true), ctx);
    }
    return { state };
  },

  onPlayersChanged(state, ctx) {
    if (state.phase !== 'BATTLE') return { state };
    const recomputed = clock(state, ctx);
    // Only a change between "everyone waiting is away" and not restarts the clock.
    return recomputed.state.bot === state.bot ? { state } : recomputed;
  },

  onInput(state, input, meta, ctx) {
    const playerId = meta.playerId;
    const reject = (code: InputRejectCode): Step => ({
      state,
      effects: [{ type: 'reject', playerId, code }],
    });
    const mySide = sideOfPlayer(state, playerId);

    if (input.type === 'place') {
      if (state.phase !== 'PLACE') return reject('ROUND_CLOSED');
      const side = state.sides[mySide];
      if (side?.members[0] !== playerId || !placers(state).includes(mySide)) {
        return reject('INVALID_INPUT');
      }
      if (!validFleet(input.ships, state.sizes, state.grid)) return reject('INVALID_INPUT');
      const next = {
        ...state,
        sides: state.sides.map((s, i) =>
          i === mySide ? { ...s, fleet: input.ships, ready: true } : s,
        ),
      };
      const allReady = placers(next).every((i) => next.sides[i]?.ready);
      return allReady ? startBattle(next, ctx) : { state: next };
    }

    if (state.phase !== 'BATTLE') return reject('ROUND_CLOSED');
    const duel = liveDuels(state).find(
      (d) => isWaiting(state.step, d.id) && shooterOf(state, d) === playerId,
    );
    if (!duel) return reject('INVALID_INPUT');
    if (input.x >= state.grid || input.y >= state.grid) return reject('INVALID_INPUT');
    if (duel.shots[duel.turn].some((s) => s.x === input.x && s.y === input.y)) {
      return reject('ALREADY_ANSWERED');
    }
    const next = fire(state, duel.id, input.x, input.y);
    return stepDone(next.step) ? nextStep(next, ctx) : { state: next };
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    const s = ctx.settings;
    const places = state.phase === 'END' ? ranking(state) : [];
    return ctx.players.map((player): ScoreResult => {
      const row = places.find((r) => r.playerId === player.id);
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
      const raw =
        s.mode === 'teams'
          ? row.place === 1
            ? s.winPoints
            : s.losePoints
          : ([s.championPoints, s.finalistPoints, s.semifinalPoints][row.place - 1] ??
            s.otherPoints);
      const points = scaled(raw);
      return {
        playerId: player.id,
        points,
        correct: row.place === 1,
        responseTimeMs: null,
        answer: { place: row.place },
        breakdown: { place: points },
      };
    });
  },

  getHostView(state, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: AMIRAL_MIN_PLAYERS };
    }
    if (state.phase === 'END') return { phase: 'END', ...endedView(state, ctx) };
    return { phase: state.phase, ...commonView(state, ctx) };
  },

  getPlayerView(state, playerId, ctx) {
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', title: ctx.content.title, minPlayers: AMIRAL_MIN_PLAYERS };
    }
    const index = sideOfPlayer(state, playerId);
    const mySide = index === -1 ? null : index;
    if (state.phase === 'END') return { phase: 'END', ...endedView(state, ctx), mySide };
    const side = mySide === null ? null : state.sides[mySide];
    const myDuel =
      mySide === null
        ? null
        : (currentDuels(state).find((d) => d.a === mySide || d.b === mySide)?.id ?? null);
    return {
      phase: state.phase,
      ...commonView(state, ctx),
      mySide,
      fleet: side?.fleet ?? null,
      canPlace:
        state.phase === 'PLACE' &&
        side?.members[0] === playerId &&
        mySide !== null &&
        placers(state).includes(mySide),
      myDuel,
      canShoot:
        state.phase === 'BATTLE' &&
        liveDuels(state).some(
          (d) => isWaiting(state.step, d.id) && shooterOf(state, d) === playerId,
        ),
    };
  },
};
