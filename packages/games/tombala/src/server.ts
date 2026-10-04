import {
  HOST_INPUT_SENDER,
  type GameModule,
  type InputRejectCode,
  type RoundContext,
  type ScoreResult,
  type Transition,
} from '@loudroom/game-sdk';
import { cardNumbers, completeRows, dealCards } from './card.js';
import { tombalaImporter } from './import.js';
import {
  PRIZE_LINES,
  TOMBALA_DEFAULT_SETTINGS,
  TOMBALA_GAME_TYPE,
  TOMBALA_MAX_NUMBER,
  TOMBALA_MIN_PLAYERS,
  TOMBALA_PRIZES,
  tombalaContentSchema,
  tombalaHostInputSchema,
  tombalaHostViewSchema,
  tombalaInputSchema,
  tombalaPlayerViewSchema,
  tombalaSettingsSchema,
  type TombalaCard,
  type TombalaContent,
  type TombalaHostInput,
  type TombalaHostView,
  type TombalaInput,
  type TombalaPlayerView,
  type TombalaPrize,
  type TombalaSettings,
} from './schema.js';

export * from './schema.js';
export { cardNumbers, columnRange, completeRows, createCard, dealCards } from './card.js';
export { tombalaImporter } from './import.js';

export type TombalaPhase = 'INTRO' | 'DRAW' | 'CLAIM' | 'REVEAL' | 'SKIPPED';

export interface TombalaAward {
  prize: TombalaPrize;
  playerId: string;
  /** How many numbers were drawn when it was won: others may share it until the next draw. */
  atDraw: number;
  /** Time since the round began. */
  afterMs: number;
}

export interface TombalaState {
  phase: TombalaPhase;
  startedAt: number;
  /** Seeds every player's card, so a late joiner's card is fixed too. */
  cardSeed: number;
  /** Numbers still to draw, in drawing order. Never leaves the server. */
  bag: number[];
  drawn: number[];
  cards: Record<string, TombalaCard>;
  marks: Record<string, number[]>;
  awards: TombalaAward[];
  /** Draw count until which a player may not call (after a wrong call). */
  lockedUntil: Record<string, number>;
  falseClaims: Record<string, number>;
}

type Ctx = RoundContext<TombalaContent, TombalaSettings>;
type Step = Transition<TombalaState>;

const drawClock = (ctx: Ctx) =>
  ctx.settings.drawMode === 'auto' ? ctx.settings.drawIntervalMs : null;

function reveal(state: TombalaState): Step {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

/** Draws the next number and deals cards to players who joined since the last draw. */
function draw(state: TombalaState, ctx: Ctx): Step {
  const [number, ...bag] = state.bag;
  if (number === undefined) return reveal(state);
  const newcomers = ctx.players.map((player) => player.id).filter((id) => !state.cards[id]);
  const dealt = dealCards(state.cardSeed, newcomers, Object.values(state.cards));
  return {
    state: {
      ...state,
      phase: 'DRAW',
      bag,
      drawn: [...state.drawn, number],
      cards: { ...state.cards, ...dealt },
    },
    effects: [{ type: 'phase', phase: 'DRAW', durationMs: drawClock(ctx) }],
  };
}

function winnersOf(state: TombalaState, prize: TombalaPrize): string[] {
  return state.awards.filter((award) => award.prize === prize).map((award) => award.playerId);
}

/**
 * The prize a call is checked for: the first one not yet won, or one won at this very draw
 * (others who complete it before the next number share it).
 */
function claimable(state: TombalaState, playerId: string): TombalaPrize[] {
  const open: TombalaPrize[] = [];
  for (const prize of TOMBALA_PRIZES) {
    const awards = state.awards.filter((award) => award.prize === prize);
    if (awards.length === 0) {
      open.push(prize);
      break;
    }
    const mine = awards.some((award) => award.playerId === playerId);
    if (!mine && awards.some((award) => award.atDraw === state.drawn.length)) open.push(prize);
  }
  return open;
}

/** The latest prize won, shown while drawing stops. */
function latestClaim(state: TombalaState) {
  const last = state.awards.at(-1);
  if (!last) return null;
  return { prize: last.prize, winners: winnersOf(state, last.prize) };
}

function prizeStatus(state: TombalaState) {
  return TOMBALA_PRIZES.map((prize) => ({ prize, winners: winnersOf(state, prize) }));
}

function nextPrize(state: TombalaState): TombalaPrize | null {
  return TOMBALA_PRIZES.find((prize) => winnersOf(state, prize).length === 0) ?? null;
}

function marksOf(state: TombalaState, playerId: string, ctx: Ctx): number[] {
  const card = state.cards[playerId];
  if (!card) return [];
  if (!ctx.settings.autoMark) return state.marks[playerId] ?? [];
  const drawn = new Set(state.drawn);
  return cardNumbers(card).filter((number) => drawn.has(number));
}

function claim(state: TombalaState, playerId: string, receivedAt: number, ctx: Ctx): Step {
  const card = state.cards[playerId];
  const reject = (code: InputRejectCode): Step => ({
    state,
    effects: [{ type: 'reject', playerId, code }],
  });
  if (!card) return reject('INVALID_INPUT');
  if ((state.lockedUntil[playerId] ?? 0) > state.drawn.length) return reject('INVALID_INPUT');

  const lines = completeRows(card, new Set(state.drawn));
  const prize = claimable(state, playerId).find((open) => lines >= PRIZE_LINES[open]);
  if (!prize) {
    // The card would have won a prize someone else already took: too late, but not wrong.
    const late = TOMBALA_PRIZES.some((taken) => {
      const winners = winnersOf(state, taken);
      return winners.length > 0 && !winners.includes(playerId) && lines >= PRIZE_LINES[taken];
    });
    if (late) return reject('ROUND_CLOSED');
    return {
      state: {
        ...state,
        lockedUntil: {
          ...state.lockedUntil,
          [playerId]: state.drawn.length + ctx.settings.falseClaimLockout,
        },
        falseClaims: { ...state.falseClaims, [playerId]: (state.falseClaims[playerId] ?? 0) + 1 },
      },
    };
  }

  const next: TombalaState = {
    ...state,
    phase: 'CLAIM',
    awards: [
      ...state.awards,
      { prize, playerId, atDraw: state.drawn.length, afterMs: receivedAt - state.startedAt },
    ],
  };
  // Already stopped for this draw's prize: keep the clock, the winner joins the list.
  if (state.phase === 'CLAIM') return { state: next };
  return {
    state: next,
    effects: [{ type: 'phase', phase: 'CLAIM', durationMs: ctx.settings.claimMs }],
  };
}

function mark(
  state: TombalaState,
  playerId: string,
  input: { number: number; marked: boolean },
  ctx: Ctx,
): Step {
  const reject: Step = { state, effects: [{ type: 'reject', playerId, code: 'INVALID_INPUT' }] };
  const card = state.cards[playerId];
  if (!card || ctx.settings.autoMark) return reject;
  if (!cardNumbers(card).includes(input.number)) return reject;
  if (input.marked && !state.drawn.includes(input.number)) return reject;
  const current = state.marks[playerId] ?? [];
  const marks = input.marked
    ? [...new Set([...current, input.number])]
    : current.filter((number) => number !== input.number);
  return { state: { ...state, marks: { ...state.marks, [playerId]: marks } } };
}

const PRIZE_POINTS: Record<TombalaPrize, keyof TombalaSettings> = {
  firstLine: 'firstLinePoints',
  secondLine: 'secondLinePoints',
  tombala: 'tombalaPoints',
};

export const tombalaModule: GameModule<
  TombalaContent,
  TombalaSettings,
  TombalaState,
  TombalaInput,
  TombalaHostView,
  TombalaPlayerView,
  never,
  TombalaHostInput
> = {
  id: TOMBALA_GAME_TYPE,
  name: 'Tombala',
  version: 1,
  contentSchema: tombalaContentSchema,
  settingsSchema: tombalaSettingsSchema,
  defaultSettings: TOMBALA_DEFAULT_SETTINGS,
  inputSchema: tombalaInputSchema,
  hostInputSchema: tombalaHostInputSchema,
  hostViewSchema: tombalaHostViewSchema,
  playerViewSchema: tombalaPlayerViewSchema,
  // Everyone plays at once: the room's own limit is the only one (SPEC §7.10).
  capabilities: { minPlayers: TOMBALA_MIN_PLAYERS, maxPlayers: 100 },
  importer: tombalaImporter,

  createRound(ctx) {
    const cardSeed = ctx.random.int(0, 2 ** 31 - 1);
    const bag = ctx.random.shuffle(Array.from({ length: TOMBALA_MAX_NUMBER }, (_, i) => i + 1));
    const state: TombalaState = {
      phase: 'INTRO',
      startedAt: ctx.now,
      cardSeed,
      bag,
      drawn: [],
      cards: dealCards(
        cardSeed,
        ctx.players.map((player) => player.id),
      ),
      marks: {},
      awards: [],
      lockedUntil: {},
      falseClaims: {},
    };
    if (ctx.players.filter((player) => player.connected).length < TOMBALA_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    if (ctx.settings.introMs === 0) return draw(state, ctx);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO' || state.phase === 'DRAW') return draw(state, ctx);
    if (state.phase === 'CLAIM') {
      if (winnersOf(state, 'tombala').length > 0) return reveal(state);
      if (ctx.settings.drawMode === 'auto') return draw(state, ctx);
      return {
        state: { ...state, phase: 'DRAW' },
        effects: [{ type: 'phase', phase: 'DRAW', durationMs: null }],
      };
    }
    return { state };
  },

  onHostInput(state, _input, ctx) {
    if (state.phase !== 'INTRO' && state.phase !== 'DRAW') {
      return {
        state,
        effects: [{ type: 'reject', playerId: HOST_INPUT_SENDER, code: 'ROUND_CLOSED' }],
      };
    }
    return draw(state, ctx);
  },

  onInput(state, input, meta, ctx) {
    if (state.phase !== 'DRAW' && state.phase !== 'CLAIM') {
      return {
        state,
        effects: [{ type: 'reject', playerId: meta.playerId, code: 'ROUND_CLOSED' }],
      };
    }
    if (input.type === 'mark') return mark(state, meta.playerId, input, ctx);
    return claim(state, meta.playerId, meta.receivedAt, ctx);
  },

  onSkip(state) {
    // The host ends the game early: prizes won so far still count.
    if (state.phase === 'SKIPPED' || state.phase === 'REVEAL') return null;
    return reveal(state);
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    return ctx.players.map((player): ScoreResult => {
      const awards = state.awards.filter((award) => award.playerId === player.id);
      const breakdown: Record<string, number> = {};
      for (const prize of TOMBALA_PRIZES) {
        const won = awards.some((award) => award.prize === prize);
        breakdown[prize] = won ? scaled(ctx.settings[PRIZE_POINTS[prize]] as number) : 0;
      }
      const falseClaims = state.falseClaims[player.id] ?? 0;
      const penalty = scaled(falseClaims * ctx.settings.falseClaimPenalty);
      breakdown.penalty = penalty === 0 ? 0 : -penalty;
      const points = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
      return {
        playerId: player.id,
        points,
        correct: awards.length > 0,
        responseTimeMs: awards[0]?.afterMs ?? null,
        answer: { prizes: awards.map((award) => award.prize), falseClaims },
        breakdown,
      };
    });
  },

  getHostView(state, ctx) {
    const title = ctx.content.title;
    if (state.phase === 'SKIPPED')
      return { phase: 'SKIPPED', title, minPlayers: TOMBALA_MIN_PLAYERS };
    if (state.phase === 'INTRO') return { phase: 'INTRO', title, drawMode: ctx.settings.drawMode };
    const board = {
      title,
      drawMode: ctx.settings.drawMode,
      drawn: state.drawn,
      remaining: state.bag.length,
      prizes: prizeStatus(state),
    };
    const claimed = latestClaim(state);
    if (state.phase === 'CLAIM' && claimed) return { phase: 'CLAIM', ...board, claim: claimed };
    if (state.phase === 'REVEAL') return { phase: 'REVEAL', ...board };
    return { phase: 'DRAW', ...board };
  },

  getPlayerView(state, playerId, ctx) {
    const title = ctx.content.title;
    const card = state.cards[playerId] ?? null;
    if (state.phase === 'SKIPPED')
      return { phase: 'SKIPPED', title, minPlayers: TOMBALA_MIN_PLAYERS };
    if (state.phase === 'INTRO')
      return { phase: 'INTRO', title, card, autoMark: ctx.settings.autoMark };
    const board = {
      title,
      drawMode: ctx.settings.drawMode,
      drawn: state.drawn,
      remaining: state.bag.length,
      prizes: prizeStatus(state),
    };
    const mine = {
      card,
      marked: marksOf(state, playerId, ctx),
      autoMark: ctx.settings.autoMark,
      nextPrize: nextPrize(state),
      lockedDraws: Math.max(0, (state.lockedUntil[playerId] ?? 0) - state.drawn.length),
      falseClaims: state.falseClaims[playerId] ?? 0,
      myPrizes: state.awards
        .filter((award) => award.playerId === playerId)
        .map((award) => award.prize),
    };
    const claimed = latestClaim(state);
    if (state.phase === 'CLAIM' && claimed) {
      return { phase: 'CLAIM', ...board, ...mine, claim: claimed };
    }
    if (state.phase === 'REVEAL') return { phase: 'REVEAL', ...board, ...mine };
    return { phase: 'DRAW', ...board, ...mine };
  },
};
