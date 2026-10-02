import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import { buildBoard, type Board } from './board.js';
import {
  MEMORY_DEFAULT_SETTINGS,
  MEMORY_GAME_TYPE,
  memoryContentSchema,
  memoryHostViewSchema,
  memoryInputSchema,
  memoryPlayerViewSchema,
  memorySettingsSchema,
  type ItemView,
  type MemoryContent,
  type MemoryHostView,
  type MemoryInput,
  type MemoryPlayerView,
  type MemorySettings,
  type QuestionView,
} from './schema.js';

export * from './board.js';
export * from './schema.js';

export type MemoryPhase = 'INTRO' | 'SHOW' | 'QUESTIONS' | 'REVEAL';

interface Answer {
  optionId: string;
  /** Time taken since the questions opened. */
  responseTimeMs: number;
}

export interface MemoryState {
  phase: MemoryPhase;
  board: Board;
  /** Per player, by question index. */
  answers: Record<string, Record<number, Answer>>;
}

type Ctx = RoundContext<MemoryContent, MemorySettings>;

function itemView(ctx: Ctx, id: string | null): ItemView | null {
  const item = ctx.content.items.find((candidate) => candidate.id === id);
  return item
    ? { id: item.id, label: item.label, emoji: item.emoji ?? null, mediaId: item.mediaId ?? null }
    : null;
}

/** Questions as asked: options only, never the answer. */
function questionViews(state: MemoryState, ctx: Ctx): QuestionView[] {
  return state.board.questions.map((question) => ({
    type: question.type,
    subject: itemView(ctx, question.subjectId),
    options: question.options.map((option) => ({
      id: option.id,
      item: itemView(ctx, option.itemId),
      number: option.number,
    })),
  }));
}

function boardView(state: MemoryState, ctx: Ctx): ItemView[] {
  return state.board.slots.flatMap((id) => itemView(ctx, id) ?? []);
}

function rightAnswers(state: MemoryState, playerId: string): number {
  const own = state.answers[playerId] ?? {};
  return state.board.questions.filter(
    (question, index) => own[index]?.optionId === question.correctOptionId,
  ).length;
}

function ownAnswers(state: MemoryState, playerId: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(state.answers[playerId] ?? {}).map(([index, answer]) => [
      index,
      answer.optionId,
    ]),
  );
}

function finished(state: MemoryState, playerId: string): boolean {
  return Object.keys(state.answers[playerId] ?? {}).length >= state.board.questions.length;
}

function questions(state: MemoryState, ctx: Ctx): Transition<MemoryState> {
  return {
    state: { ...state, phase: 'QUESTIONS' },
    effects: [{ type: 'phase', phase: 'QUESTIONS', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: MemoryState): Transition<MemoryState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

export const memoryModule: GameModule<
  MemoryContent,
  MemorySettings,
  MemoryState,
  MemoryInput,
  MemoryHostView,
  MemoryPlayerView
> = {
  id: MEMORY_GAME_TYPE,
  name: 'Memory',
  version: 1,
  contentSchema: memoryContentSchema,
  settingsSchema: memorySettingsSchema,
  defaultSettings: MEMORY_DEFAULT_SETTINGS,
  inputSchema: memoryInputSchema,
  hostViewSchema: memoryHostViewSchema,
  playerViewSchema: memoryPlayerViewSchema,
  capabilities: { minPlayers: 1, maxPlayers: 20 },

  createRound(ctx) {
    const state: MemoryState = {
      phase: 'INTRO',
      board: buildBoard(ctx.content.items, ctx.settings, ctx.random),
      answers: {},
    };
    const show: Transition<MemoryState> = {
      state: { ...state, phase: 'SHOW' },
      effects: [{ type: 'phase', phase: 'SHOW', durationMs: ctx.settings.showMs }],
    };
    if (ctx.settings.introMs === 0) return show;
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') {
      return {
        state: { ...state, phase: 'SHOW' },
        effects: [{ type: 'phase', phase: 'SHOW', durationMs: ctx.settings.showMs }],
      };
    }
    if (state.phase === 'SHOW') return questions(state, ctx);
    if (state.phase === 'QUESTIONS') return reveal(state);
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: InputRejectCode) => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    if (state.phase !== 'QUESTIONS') return reject('ROUND_CLOSED');
    if (!ctx.players.some((player) => player.id === meta.playerId)) return reject('INVALID_INPUT');
    const question = state.board.questions[input.question];
    if (!question?.options.some((option) => option.id === input.optionId)) {
      return reject('INVALID_INPUT');
    }
    if (state.answers[meta.playerId]?.[input.question]) return reject('ALREADY_ANSWERED');

    const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remaining = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: MemoryState = {
      ...state,
      answers: {
        ...state.answers,
        [meta.playerId]: {
          ...(state.answers[meta.playerId] ?? {}),
          [input.question]: { optionId: input.optionId, responseTimeMs: total - remaining },
        },
      },
    };
    const everyone = ctx.players.filter((player) => player.connected);
    if (everyone.every((player) => finished(next, player.id))) return reveal(next);
    return { state: next };
  },

  score(state, ctx) {
    return ctx.players.map((player): ScoreResult => {
      const own = state.answers[player.id] ?? {};
      const answered = Object.values(own);
      if (answered.length === 0) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: {},
        };
      }
      const right = rightAnswers(state, player.id);
      const points = Math.round(right * ctx.settings.pointsPerQuestion * ctx.scoreMultiplier);
      return {
        playerId: player.id,
        points,
        correct: right === state.board.questions.length,
        responseTimeMs: Math.max(...answered.map((answer) => answer.responseTimeMs)),
        answer: { answers: ownAnswers(state, player.id) },
        breakdown: { right, points },
      };
    });
  },

  getHostView(state, ctx) {
    const title = ctx.content.title;
    switch (state.phase) {
      case 'INTRO':
        return { phase: 'INTRO', title };
      case 'SHOW':
        return { phase: 'SHOW', title, board: boardView(state, ctx) };
      case 'QUESTIONS':
        return {
          phase: 'QUESTIONS',
          title,
          questionCount: state.board.questions.length,
          finishedCount: ctx.players.filter((player) => finished(state, player.id)).length,
          playerCount: ctx.players.filter((player) => player.connected).length,
        };
      case 'REVEAL':
        return {
          phase: 'REVEAL',
          title,
          board: boardView(state, ctx),
          questions: questionViews(state, ctx).map((view, index) => {
            const correctOptionId = state.board.questions[index]?.correctOptionId ?? '';
            return {
              ...view,
              correctOptionId,
              correctCount: ctx.players.filter(
                (player) => state.answers[player.id]?.[index]?.optionId === correctOptionId,
              ).length,
            };
          }),
        };
    }
  },

  getPlayerView(state, playerId, ctx) {
    switch (state.phase) {
      case 'INTRO':
        return { phase: 'INTRO', title: ctx.content.title };
      case 'SHOW':
        // The board is on the TV only: memory, not phones (SPEC §7.8).
        return { phase: 'SHOW' };
      case 'QUESTIONS':
        return {
          phase: 'QUESTIONS',
          questions: questionViews(state, ctx),
          answers: ownAnswers(state, playerId),
        };
      case 'REVEAL':
        return {
          phase: 'REVEAL',
          questions: questionViews(state, ctx).map((view, index) => ({
            ...view,
            correctOptionId: state.board.questions[index]?.correctOptionId ?? '',
          })),
          answers: ownAnswers(state, playerId),
          correctCount: rightAnswers(state, playerId),
        };
    }
  },
};
