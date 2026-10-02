import type { GameModule, RoundContext, ScoreResult, Transition } from '@loudroom/game-sdk';
import { quizImporter } from './import.js';
import {
  QUIZ_DEFAULT_SETTINGS,
  QUIZ_GAME_TYPE,
  quizContentSchema,
  quizHostViewSchema,
  quizInputSchema,
  quizPlayerViewSchema,
  quizSettingsSchema,
  type QuizContent,
  type QuizHostView,
  type QuizInput,
  type QuizOptionView,
  type QuizPlayerView,
  type QuizSettings,
} from './schema.js';
import { answerPoints, streakBonus } from './scoring.js';

export * from './schema.js';
export { quizImporter } from './import.js';
export { answerPoints, streakBonus } from './scoring.js';

export type QuizPhase = 'INTRO' | 'ANSWERING' | 'REVEAL';

interface QuizAnswer {
  optionId: string;
  /** Time taken since answering opened. */
  responseTimeMs: number;
  /** Time left on the clock when the answer arrived. */
  remainingMs: number;
}

export interface QuizState {
  phase: QuizPhase;
  /** Options in display order (shuffled per round). */
  options: QuizOptionView[];
  answers: Record<string, QuizAnswer>;
}

type Ctx = RoundContext<QuizContent, QuizSettings>;

function answering(state: QuizState, ctx: Ctx): Transition<QuizState> {
  return {
    state: { ...state, phase: 'ANSWERING' },
    effects: [{ type: 'phase', phase: 'ANSWERING', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: QuizState): Transition<QuizState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

/** Answers of players still in the room. */
function countedAnswers(state: QuizState, ctx: Ctx): [string, QuizAnswer][] {
  const present = new Set(ctx.players.map((player) => player.id));
  return Object.entries(state.answers).filter(([playerId]) => present.has(playerId));
}

export const quizModule: GameModule<
  QuizContent,
  QuizSettings,
  QuizState,
  QuizInput,
  QuizHostView,
  QuizPlayerView
> = {
  id: QUIZ_GAME_TYPE,
  name: 'Quiz',
  version: 2,
  contentSchema: quizContentSchema,
  settingsSchema: quizSettingsSchema,
  defaultSettings: QUIZ_DEFAULT_SETTINGS,
  inputSchema: quizInputSchema,
  hostViewSchema: quizHostViewSchema,
  playerViewSchema: quizPlayerViewSchema,
  capabilities: { minPlayers: 1, maxPlayers: 20 },
  importer: quizImporter,

  createRound(ctx) {
    const options = ctx.random.shuffle(ctx.content.options).map((option, slot) => ({
      id: option.id,
      text: option.text,
      mediaId: option.mediaId ?? null,
      slot,
    }));
    const state: QuizState = { phase: 'INTRO', options, answers: {} };
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
    if (!state.options.some((option) => option.id === input.optionId)) {
      return reject('INVALID_INPUT');
    }
    if (state.answers[meta.playerId] && !ctx.settings.allowAnswerChange) {
      return reject('ALREADY_ANSWERED');
    }

    // Measured against the server's clock for this phase; pauses shift `endsAt`.
    const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remainingMs = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: QuizState = {
      ...state,
      answers: {
        ...state.answers,
        [meta.playerId]: {
          optionId: input.optionId,
          remainingMs,
          responseTimeMs: total - remainingMs,
        },
      },
    };

    // Everyone who can answer has answered: no need to wait for the clock (SPEC §7.1).
    // With answer changes allowed the clock always decides.
    const connected = ctx.players.filter((player) => player.connected);
    const allAnswered = connected.every((player) => next.answers[player.id] !== undefined);
    if (allAnswered && !ctx.settings.allowAnswerChange) return reveal(next);
    return { state: next };
  },

  score(state, ctx) {
    const correctOptionId = ctx.content.correctOptionId;
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
      const correct = answer.optionId === correctOptionId;
      const base = correct
        ? answerPoints(
            ctx.settings.baseScore,
            answer.remainingMs,
            answer.remainingMs + answer.responseTimeMs,
            ctx.scoreMultiplier,
          )
        : 0;
      const streak = (ctx.stats[player.id]?.streak ?? 0) + 1;
      const bonus = correct ? streakBonus(streak, ctx.settings.streakBonus) : 0;
      return {
        playerId: player.id,
        points: base + bonus,
        correct,
        responseTimeMs: answer.responseTimeMs,
        answer: { optionId: answer.optionId },
        breakdown: { base, streakBonus: bonus },
      };
    });
  },

  getHostView(state, ctx) {
    const answers = countedAnswers(state, ctx);
    const common = {
      question: ctx.content.question,
      media: ctx.content.media ?? null,
      options: state.options,
      answeredCount: answers.length,
      playerCount: ctx.players.filter((player) => player.connected).length,
    };
    if (state.phase !== 'REVEAL') return { phase: state.phase, ...common };
    return {
      phase: 'REVEAL',
      ...common,
      correctOptionId: ctx.content.correctOptionId,
      distribution: state.options.map((option) => ({
        optionId: option.id,
        count: answers.filter(([, answer]) => answer.optionId === option.id).length,
      })),
    };
  },

  getPlayerView(state, playerId, ctx) {
    const selectedOptionId = state.answers[playerId]?.optionId ?? null;
    if (state.phase === 'INTRO') return { phase: 'INTRO', question: ctx.content.question };
    if (state.phase === 'ANSWERING') {
      return {
        phase: 'ANSWERING',
        question: ctx.content.question,
        options: state.options,
        selectedOptionId,
        locked: selectedOptionId !== null && !ctx.settings.allowAnswerChange,
      };
    }
    return {
      phase: 'REVEAL',
      options: state.options,
      selectedOptionId,
      correctOptionId: ctx.content.correctOptionId,
      correct: selectedOptionId === null ? null : selectedOptionId === ctx.content.correctOptionId,
    };
  },
};
