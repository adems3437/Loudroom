import type { GameModule, RoundContext, ScoreResult, Transition } from '@loudroom/game-sdk';
import {
  CLOSEST_NUMBER_DEFAULT_SETTINGS,
  CLOSEST_NUMBER_GAME_TYPE,
  closestNumberContentSchema,
  closestNumberHostViewSchema,
  closestNumberInputSchema,
  closestNumberPlayerViewSchema,
  closestNumberSettingsSchema,
  type ClosestNumberContent,
  type ClosestNumberHostView,
  type ClosestNumberInput,
  type ClosestNumberPlayerView,
  type ClosestNumberSettings,
} from './schema.js';
import { errorScale, pointsFor, rankShare, relativeShare } from './scoring.js';

export * from './schema.js';
export * from './scoring.js';

export type ClosestNumberPhase = 'INTRO' | 'ANSWERING' | 'REVEAL';

interface Guess {
  value: number;
  /** Time taken since answering opened. */
  responseTimeMs: number;
}

export interface ClosestNumberState {
  phase: ClosestNumberPhase;
  guesses: Record<string, Guess>;
}

type Ctx = RoundContext<ClosestNumberContent, ClosestNumberSettings>;

interface Ranked {
  playerId: string;
  guess: Guess;
  distance: number;
  /** One of the closest guesses (equal distance counts as equally close). */
  closest: boolean;
}

/** Guesses of players still in the room: closest first, ties by answer time, then join order. */
function ranking(state: ClosestNumberState, ctx: Ctx): Ranked[] {
  const order = new Map(ctx.players.map((player, index) => [player.id, index]));
  const entries = Object.entries(state.guesses)
    .filter(([playerId]) => order.has(playerId))
    .map(([playerId, guess]) => ({
      playerId,
      guess,
      distance: Math.abs(guess.value - ctx.content.answer),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.guess.responseTimeMs - b.guess.responseTimeMs ||
        (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0),
    );
  const best = entries[0]?.distance;
  return entries.map((entry) => ({ ...entry, closest: entry.distance === best }));
}

function answering(state: ClosestNumberState, ctx: Ctx): Transition<ClosestNumberState> {
  return {
    state: { ...state, phase: 'ANSWERING' },
    effects: [{ type: 'phase', phase: 'ANSWERING', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: ClosestNumberState): Transition<ClosestNumberState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

function question(ctx: Ctx) {
  return {
    question: ctx.content.question,
    unit: ctx.content.unit ?? null,
    displayFormat: ctx.content.displayFormat,
  };
}

export const closestNumberModule: GameModule<
  ClosestNumberContent,
  ClosestNumberSettings,
  ClosestNumberState,
  ClosestNumberInput,
  ClosestNumberHostView,
  ClosestNumberPlayerView
> = {
  id: CLOSEST_NUMBER_GAME_TYPE,
  name: 'Closest Number',
  version: 1,
  contentSchema: closestNumberContentSchema,
  settingsSchema: closestNumberSettingsSchema,
  defaultSettings: CLOSEST_NUMBER_DEFAULT_SETTINGS,
  inputSchema: closestNumberInputSchema,
  hostViewSchema: closestNumberHostViewSchema,
  playerViewSchema: closestNumberPlayerViewSchema,
  capabilities: { minPlayers: 1, maxPlayers: 20 },

  createRound(ctx) {
    const state: ClosestNumberState = { phase: 'INTRO', guesses: {} };
    if (ctx.settings.introMs === 0) return answering(state, ctx);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') return answering(state, ctx);
    if (state.phase === 'ANSWERING') return reveal(state);
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: 'ROUND_CLOSED' | 'ALREADY_ANSWERED' | 'INVALID_INPUT') => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    if (state.phase !== 'ANSWERING') return reject('ROUND_CLOSED');
    if (!ctx.players.some((player) => player.id === meta.playerId)) return reject('INVALID_INPUT');
    if (ctx.content.displayFormat === 'year' && !Number.isInteger(input.value)) {
      return reject('INVALID_INPUT');
    }
    if (state.guesses[meta.playerId]) return reject('ALREADY_ANSWERED');

    const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remainingMs = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: ClosestNumberState = {
      ...state,
      guesses: {
        ...state.guesses,
        [meta.playerId]: { value: input.value, responseTimeMs: total - remainingMs },
      },
    };
    const connected = ctx.players.filter((player) => player.connected);
    if (connected.every((player) => next.guesses[player.id] !== undefined)) return reveal(next);
    return { state: next };
  },

  score(state, ctx) {
    const ranked = ranking(state, ctx);
    const { scale, maxError } = errorScale(ctx.content, ctx.settings);
    return ctx.players.map((player): ScoreResult => {
      const index = ranked.findIndex((entry) => entry.playerId === player.id);
      const entry = ranked[index];
      if (!entry) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const share =
        ctx.settings.scoring === 'rank'
          ? rankShare(index, ranked.length)
          : relativeShare(entry.guess.value, ctx.content.answer, scale, maxError);
      const points = pointsFor(ctx.settings.baseScore, share, ctx.scoreMultiplier);
      return {
        playerId: player.id,
        points,
        correct: entry.closest,
        responseTimeMs: entry.guess.responseTimeMs,
        answer: { value: entry.guess.value },
        breakdown: { base: points, rank: index + 1 },
      };
    });
  },

  getHostView(state, ctx) {
    const answered = ranking(state, ctx);
    const common = {
      ...question(ctx),
      answeredCount: answered.length,
      playerCount: ctx.players.filter((player) => player.connected).length,
    };
    if (state.phase === 'INTRO') return { phase: 'INTRO', ...question(ctx) };
    if (state.phase === 'ANSWERING') return { phase: 'ANSWERING', ...common };
    const { scale, maxError } = errorScale(ctx.content, ctx.settings);
    return {
      phase: 'REVEAL',
      ...common,
      answer: ctx.content.answer,
      zeroPointDistance: scale * maxError,
      guesses: answered.map((entry) => ({
        playerId: entry.playerId,
        value: entry.guess.value,
        closest: entry.closest,
      })),
    };
  },

  getPlayerView(state, playerId, ctx) {
    const guess = state.guesses[playerId]?.value ?? null;
    if (state.phase === 'INTRO') return { phase: 'INTRO', question: ctx.content.question };
    if (state.phase === 'ANSWERING') return { phase: 'ANSWERING', ...question(ctx), guess };
    const ranked = ranking(state, ctx);
    const index = ranked.findIndex((entry) => entry.playerId === playerId);
    return {
      phase: 'REVEAL',
      ...question(ctx),
      answer: ctx.content.answer,
      guess,
      correct: ranked[index]?.closest ?? null,
      rank: index >= 0 ? index + 1 : null,
      answeredCount: ranked.length,
    };
  },
};
