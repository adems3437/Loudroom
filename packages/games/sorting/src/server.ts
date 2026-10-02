import type { GameModule, RoundContext, ScoreResult, Transition } from '@loudroom/game-sdk';
import {
  SORTING_DEFAULT_SETTINGS,
  SORTING_GAME_TYPE,
  sortingContentSchema,
  sortingHostViewSchema,
  sortingInputSchema,
  sortingPlayerViewSchema,
  sortingSettingsSchema,
  type SortingContent,
  type SortingHostView,
  type SortingInput,
  type SortingItemView,
  type SortingPlayerView,
  type SortingSettings,
} from './schema.js';
import { correctPositions, pairShare, pointsFor } from './scoring.js';

export * from './schema.js';
export * from './scoring.js';

export type SortingPhase = 'INTRO' | 'ANSWERING' | 'REVEAL';

interface SortingAnswer {
  order: string[];
  /** Time taken since answering opened (of the last order sent). */
  responseTimeMs: number;
}

export interface SortingState {
  phase: SortingPhase;
  /** Items in the order every screen starts with. */
  items: SortingItemView[];
  answers: Record<string, SortingAnswer>;
}

type Ctx = RoundContext<SortingContent, SortingSettings>;

const correctIds = (ctx: Ctx) => ctx.content.items.map((item) => item.id);

function toView(item: SortingContent['items'][number]): SortingItemView {
  return { id: item.id, text: item.text, mediaId: item.mediaId ?? null };
}

function answering(state: SortingState, ctx: Ctx): Transition<SortingState> {
  return {
    state: { ...state, phase: 'ANSWERING' },
    effects: [{ type: 'phase', phase: 'ANSWERING', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: SortingState): Transition<SortingState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

/** Answers of players still in the room. */
function countedAnswers(state: SortingState, ctx: Ctx): [string, SortingAnswer][] {
  const present = new Set(ctx.players.map((player) => player.id));
  return Object.entries(state.answers).filter(([playerId]) => present.has(playerId));
}

function isPermutation(order: readonly string[], ids: readonly string[]): boolean {
  return (
    order.length === ids.length &&
    new Set(order).size === ids.length &&
    order.every((id) => ids.includes(id))
  );
}

export const sortingModule: GameModule<
  SortingContent,
  SortingSettings,
  SortingState,
  SortingInput,
  SortingHostView,
  SortingPlayerView
> = {
  id: SORTING_GAME_TYPE,
  name: 'Sorting',
  version: 1,
  contentSchema: sortingContentSchema,
  settingsSchema: sortingSettingsSchema,
  defaultSettings: SORTING_DEFAULT_SETTINGS,
  inputSchema: sortingInputSchema,
  hostViewSchema: sortingHostViewSchema,
  playerViewSchema: sortingPlayerViewSchema,
  capabilities: { minPlayers: 1, maxPlayers: 20 },

  createRound(ctx) {
    // Sorted by id first, so the starting order never depends on (and never hints at) the
    // correct one; then shuffled with the round's seed.
    const byId = [...ctx.content.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const state: SortingState = {
      phase: 'INTRO',
      items: ctx.random.shuffle(byId).map(toView),
      answers: {},
    };
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
    if (!isPermutation(input.order, correctIds(ctx))) return reject('INVALID_INPUT');
    if (state.answers[meta.playerId] && !ctx.settings.allowAnswerChange) {
      return reject('ALREADY_ANSWERED');
    }

    const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remainingMs = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: SortingState = {
      ...state,
      answers: {
        ...state.answers,
        [meta.playerId]: { order: [...input.order], responseTimeMs: total - remainingMs },
      },
    };
    // With answer changes allowed the clock always decides.
    const connected = ctx.players.filter((player) => player.connected);
    const allAnswered = connected.every((player) => next.answers[player.id] !== undefined);
    if (allAnswered && !ctx.settings.allowAnswerChange) return reveal(next);
    return { state: next };
  },

  score(state, ctx) {
    const correct = correctIds(ctx);
    return ctx.players.map((player): ScoreResult => {
      const answer = state.answers[player.id];
      if (!answer) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const placed = correctPositions(answer.order, correct);
      const share =
        ctx.settings.scoring === 'kendall'
          ? pairShare(answer.order, correct)
          : placed / correct.length;
      const points = pointsFor(ctx.settings.baseScore, share, ctx.scoreMultiplier);
      return {
        playerId: player.id,
        points,
        correct: placed === correct.length,
        responseTimeMs: answer.responseTimeMs,
        answer: { order: answer.order },
        breakdown: { base: points, correctPositions: placed },
      };
    });
  },

  getHostView(state, ctx) {
    const answers = countedAnswers(state, ctx);
    const common = {
      question: ctx.content.question,
      labels: ctx.content.labels ?? null,
    };
    const counts = {
      answeredCount: answers.length,
      playerCount: ctx.players.filter((player) => player.connected).length,
    };
    if (state.phase === 'INTRO') return { phase: 'INTRO', ...common };
    if (state.phase === 'ANSWERING') {
      return { phase: 'ANSWERING', ...common, ...counts, items: state.items };
    }
    const correct = correctIds(ctx);
    return {
      phase: 'REVEAL',
      ...common,
      ...counts,
      correctOrder: ctx.content.items.map((item, index) => ({
        ...toView(item),
        placedRight: answers.filter(([, answer]) => answer.order[index] === item.id).length,
      })),
      perfectCount: answers.filter(
        ([, answer]) => correctPositions(answer.order, correct) === correct.length,
      ).length,
    };
  },

  getPlayerView(state, playerId, ctx) {
    const submittedOrder = state.answers[playerId]?.order ?? null;
    const labels = ctx.content.labels ?? null;
    if (state.phase === 'INTRO') return { phase: 'INTRO', question: ctx.content.question };
    if (state.phase === 'ANSWERING') {
      return {
        phase: 'ANSWERING',
        question: ctx.content.question,
        labels,
        items: state.items,
        submittedOrder,
        locked: submittedOrder !== null && !ctx.settings.allowAnswerChange,
      };
    }
    const correct = correctIds(ctx);
    const placed = submittedOrder ? correctPositions(submittedOrder, correct) : null;
    return {
      phase: 'REVEAL',
      labels,
      correctOrder: ctx.content.items.map(toView),
      submittedOrder,
      correctPositions: placed,
      correct: placed === null ? null : placed === correct.length,
    };
  },
};
