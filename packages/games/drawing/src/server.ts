import {
  cleanText,
  type GameModule,
  type InputRejectCode,
  type RoundContext,
  type ScoreResult,
  type Transition,
} from '@loudroom/game-sdk';
import { drawingImporter } from './import.js';
import { judgeGuess, letterSlots } from './guess.js';
import {
  chunkCost,
  DRAWING_DEFAULT_SETTINGS,
  DRAWING_GAME_TYPE,
  DRAWING_MAX_WORD,
  DRAWING_MIN_PLAYERS,
  drawingChunkSchema,
  drawingContentSchema,
  drawingHostViewSchema,
  drawingInputSchema,
  drawingPlayerViewSchema,
  drawingSettingsSchema,
  type DrawingChunk,
  type DrawingContent,
  type DrawingHostView,
  type DrawingInput,
  type DrawingPlayerView,
  type DrawingSettings,
  type GuessFeedback,
} from './schema.js';

export * from './guess.js';
export * from './schema.js';
export { drawingImporter } from './import.js';

export type DrawingPhase = 'INTRO' | 'DRAWING' | 'REVEAL' | 'SKIPPED';

/** Wrong guesses kept for the TV feed, and per player for their own phone. */
const FEED_SIZE = 30;
const OWN_GUESSES = 5;

export interface DrawingState {
  phase: DrawingPhase;
  /** Chosen at the start among the connected players, in turn. */
  drawerId: string | null;
  /** Correct guesses in order. */
  solvers: { playerId: string; responseTimeMs: number }[];
  /** Wrong guesses for everyone to see (never the right or "close" ones). */
  feed: { playerId: string; text: string }[];
  /** Each player's latest guesses that were not right. */
  guesses: Record<string, { text: string; result: GuessFeedback }[]>;
}

type Ctx = RoundContext<DrawingContent, DrawingSettings>;

const answers = (ctx: Ctx) => [ctx.content.word, ...(ctx.content.alternatives ?? [])];
const slotsOf = (ctx: Ctx) => (ctx.settings.showLetterSlots ? letterSlots(ctx.content.word) : null);

/** Connected players who can guess now (everyone but the drawer). */
function guessers(state: DrawingState, ctx: Ctx): string[] {
  return ctx.players
    .filter((player) => player.connected && player.id !== state.drawerId)
    .map((player) => player.id);
}

function drawing(state: DrawingState, ctx: Ctx): Transition<DrawingState> {
  return {
    state: { ...state, phase: 'DRAWING' },
    effects: [{ type: 'phase', phase: 'DRAWING', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: DrawingState): Transition<DrawingState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

function scaled(points: number, ctx: Ctx): number {
  return Math.round(points * ctx.scoreMultiplier);
}

export const drawingModule: GameModule<
  DrawingContent,
  DrawingSettings,
  DrawingState,
  DrawingInput,
  DrawingHostView,
  DrawingPlayerView,
  DrawingChunk
> = {
  id: DRAWING_GAME_TYPE,
  name: 'Drawing',
  version: 1,
  contentSchema: drawingContentSchema,
  settingsSchema: drawingSettingsSchema,
  defaultSettings: DRAWING_DEFAULT_SETTINGS,
  inputSchema: drawingInputSchema,
  hostViewSchema: drawingHostViewSchema,
  playerViewSchema: drawingPlayerViewSchema,
  capabilities: { minPlayers: DRAWING_MIN_PLAYERS, maxPlayers: 20, usesStream: true },
  importer: drawingImporter,

  stream: {
    schema: drawingChunkSchema,
    // Only the drawer, only while drawing (SPEC §7.5).
    accepts: (state, playerId) => state.phase === 'DRAWING' && playerId === state.drawerId,
    cost: chunkCost,
    limits: { maxChunks: 3_000, maxCost: 30_000 },
  },

  createRound(ctx) {
    const connected = ctx.players.filter((player) => player.connected);
    const state: DrawingState = {
      phase: 'INTRO',
      drawerId: null,
      solvers: [],
      feed: [],
      guesses: {},
    };
    if (connected.length < DRAWING_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    // Players draw in turn, in join order.
    const drawer = connected[ctx.roundIndex % connected.length]?.id ?? null;
    const started = { ...state, drawerId: drawer };
    if (ctx.settings.introMs === 0) return drawing(started, ctx);
    return {
      state: started,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') return drawing(state, ctx);
    if (state.phase === 'DRAWING') return reveal(state);
    return { state };
  },

  onSkip(state) {
    // Skipping a drawing shows the word and keeps the points guessed so far.
    if (state.phase !== 'INTRO' && state.phase !== 'DRAWING') return null;
    return reveal(state);
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: InputRejectCode) => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    const playerId = meta.playerId;
    if (state.phase !== 'DRAWING') return reject('ROUND_CLOSED');
    if (!ctx.players.some((player) => player.id === playerId) || playerId === state.drawerId) {
      return reject('INVALID_INPUT');
    }
    if (state.solvers.some((solver) => solver.playerId === playerId)) {
      return reject('ALREADY_ANSWERED');
    }
    const text = cleanText(input.text);
    if (text.length === 0 || Array.from(text).length > DRAWING_MAX_WORD + 10) {
      return reject('INVALID_INPUT');
    }
    if (ctx.moderation.isBlocked(text)) return reject('TEXT_REJECTED');

    const result = judgeGuess(text, answers(ctx));
    if (result === 'correct') {
      const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
      const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
      const remaining = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
      const next: DrawingState = {
        ...state,
        solvers: [...state.solvers, { playerId, responseTimeMs: total - remaining }],
      };
      // Everyone who can guess has: show the word without waiting for the clock.
      const solved = new Set(next.solvers.map((solver) => solver.playerId));
      if (guessers(next, ctx).every((id) => solved.has(id))) return reveal(next);
      return { state: next };
    }
    const own = [...(state.guesses[playerId] ?? []), { text, result }].slice(-OWN_GUESSES);
    return {
      state: {
        ...state,
        guesses: { ...state.guesses, [playerId]: own },
        // A "close" guess would hint at the word: only its author learns about it.
        feed:
          result === 'wrong' ? [...state.feed, { playerId, text }].slice(-FEED_SIZE) : state.feed,
      },
    };
  },

  score(state, ctx) {
    const rank = new Map(state.solvers.map((solver, index) => [solver.playerId, index]));
    return ctx.players.map((player): ScoreResult => {
      if (player.id === state.drawerId) {
        const points = scaled(ctx.settings.drawerPoints * state.solvers.length, ctx);
        return {
          playerId: player.id,
          points,
          correct: null,
          responseTimeMs: null,
          answer: { drew: true },
          breakdown: { drawer: points, solvers: state.solvers.length },
        };
      }
      const place = rank.get(player.id);
      const solver = place === undefined ? undefined : state.solvers[place];
      const tried = state.guesses[player.id] ?? [];
      if (!solver || place === undefined) {
        return {
          playerId: player.id,
          points: 0,
          correct: tried.length > 0 ? false : null,
          responseTimeMs: null,
          answer: tried.length > 0 ? { guesses: tried.map((guess) => guess.text) } : null,
          breakdown: {},
        };
      }
      const base = Math.max(
        ctx.settings.minScore,
        ctx.settings.baseScore - place * ctx.settings.rankStep,
      );
      const points = scaled(base, ctx);
      return {
        playerId: player.id,
        points,
        correct: true,
        responseTimeMs: solver.responseTimeMs,
        answer: { solved: true, guesses: tried.map((guess) => guess.text) },
        breakdown: { guess: points, rank: place + 1 },
      };
    });
  },

  getHostView(state, ctx) {
    if (state.phase === 'SKIPPED' || state.drawerId === null) {
      return { phase: 'SKIPPED', minPlayers: DRAWING_MIN_PLAYERS };
    }
    const drawerId = state.drawerId;
    const solvers = state.solvers.map((solver) => solver.playerId);
    if (state.phase === 'INTRO') return { phase: 'INTRO', drawerId, slots: slotsOf(ctx) };
    if (state.phase === 'DRAWING') {
      return {
        phase: 'DRAWING',
        drawerId,
        slots: slotsOf(ctx),
        feed: state.feed,
        solvers,
        guesserCount: guessers(state, ctx).length,
      };
    }
    return { phase: 'REVEAL', drawerId, word: ctx.content.word, feed: state.feed, solvers };
  },

  getPlayerView(state, playerId, ctx) {
    if (state.phase === 'SKIPPED' || state.drawerId === null) {
      return { phase: 'SKIPPED', minPlayers: DRAWING_MIN_PLAYERS };
    }
    const drawerId = state.drawerId;
    const isDrawer = playerId === drawerId;
    const place = state.solvers.findIndex((solver) => solver.playerId === playerId);
    if (state.phase === 'REVEAL') {
      return {
        phase: 'REVEAL',
        role: isDrawer ? 'drawer' : 'guesser',
        drawerId,
        word: ctx.content.word,
        solved: isDrawer
          ? null
          : place >= 0
            ? true
            : (state.guesses[playerId]?.length ?? 0) > 0
              ? false
              : null,
        rank: place >= 0 ? place + 1 : null,
        solvedCount: state.solvers.length,
      };
    }
    if (isDrawer) {
      return state.phase === 'INTRO'
        ? { phase: 'INTRO', role: 'drawer', word: ctx.content.word }
        : {
            phase: 'DRAWING',
            role: 'drawer',
            word: ctx.content.word,
            solvedCount: state.solvers.length,
            guesserCount: guessers(state, ctx).length,
          };
    }
    if (state.phase === 'INTRO') {
      return { phase: 'INTRO', role: 'guesser', drawerId, slots: slotsOf(ctx) };
    }
    return {
      phase: 'DRAWING',
      role: 'guesser',
      drawerId,
      slots: slotsOf(ctx),
      solved: place >= 0,
      guesses: state.guesses[playerId] ?? [],
    };
  },
};
