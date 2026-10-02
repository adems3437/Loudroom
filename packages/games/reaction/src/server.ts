import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import {
  REACTION_DEFAULT_SETTINGS,
  REACTION_GAME_TYPE,
  reactionContentSchema,
  reactionHostViewSchema,
  reactionInputSchema,
  reactionPlayerViewSchema,
  reactionSettingsSchema,
  type AttemptKind,
  type Outcome,
  type ReactionContent,
  type ReactionHostView,
  type ReactionInput,
  type ReactionPlayerView,
  type ReactionSettings,
} from './schema.js';
import { median, plausibleTap } from './scoring.js';

export * from './schema.js';
export * from './scoring.js';

export type ReactionPhase = 'INTRO' | 'ARMED' | 'GO' | 'RESULT' | 'REVEAL';

/** Extra time on top of the slowest valid reaction for the taps to arrive. */
const GO_SLACK_MS = 1_000;

interface Attempt {
  kind: AttemptKind;
  /** Wait before GO (secret). */
  waitMs: number;
}

interface Result {
  outcome: Outcome;
  ms: number | null;
}

export interface ReactionState {
  phase: ReactionPhase;
  /** Planned at the start with the round seed. */
  attempts: Attempt[];
  current: number;
  /** Server time GO began for the current attempt. */
  goAt: number | null;
  /** When each player's "shown" arrived in the current attempt. */
  shown: Record<string, number>;
  /** Per player, one result per finished (or decided) attempt, by attempt index. */
  results: Record<string, Record<number, Result>>;
}

type Ctx = RoundContext<ReactionContent, ReactionSettings>;

/** The attempts: target attempts plus, for goNoGo, decoys placed anywhere but first. */
function planAttempts(ctx: Ctx): Attempt[] {
  const { attempts, decoyRate, minWaitMs, maxWaitMs } = ctx.settings;
  const decoys = ctx.content.variant === 'goNoGo' ? Math.round(attempts * decoyRate) : 0;
  const kinds: AttemptKind[] = Array.from({ length: attempts }, () => 'target');
  for (let i = 0; i < decoys; i++) kinds.splice(ctx.random.int(1, kinds.length), 0, 'decoy');
  return kinds.map((kind) => ({ kind, waitMs: ctx.random.int(minWaitMs, maxWaitMs) }));
}

function armed(state: ReactionState, index: number): Transition<ReactionState> {
  const attempt = state.attempts[index];
  return {
    state: { ...state, phase: 'ARMED', current: index, goAt: null, shown: {} },
    // Hidden: clients must not know when GO comes.
    effects: [{ type: 'phase', phase: 'ARMED', durationMs: attempt?.waitMs ?? 0, hidden: true }],
  };
}

/** Scored time of an outcome (null: not scored). */
function scoredTime(result: Result, ctx: Ctx): number | null {
  if (result.outcome === 'held') return null;
  if (result.outcome === 'ok') return result.ms;
  return ctx.settings.maxReactionMs;
}

/** Players without a result for the current attempt get the default one; then RESULT. */
function closeAttempt(state: ReactionState, ctx: Ctx): Transition<ReactionState> {
  const kind = state.attempts[state.current]?.kind ?? 'target';
  const results = { ...state.results };
  for (const player of ctx.players) {
    const own = { ...(results[player.id] ?? {}) };
    own[state.current] ??= { outcome: kind === 'decoy' ? 'held' : 'missed', ms: null };
    results[player.id] = own;
  }
  return {
    state: { ...state, phase: 'RESULT', results },
    effects: [{ type: 'phase', phase: 'RESULT', durationMs: ctx.settings.resultMs }],
  };
}

interface Summary {
  playerId: string;
  medianMs: number | null;
  bestMs: number | null;
  penalties: number;
  played: boolean;
}

function summarize(state: ReactionState, ctx: Ctx): Summary[] {
  const order = new Map(ctx.players.map((player, index) => [player.id, index]));
  return ctx.players
    .map((player) => {
      const results = Object.values(state.results[player.id] ?? {});
      const ok = results.flatMap((result) =>
        result.outcome === 'ok' && result.ms !== null ? [result.ms] : [],
      );
      const scored = results.flatMap((result) => scoredTime(result, ctx) ?? []);
      return {
        playerId: player.id,
        medianMs: ok.length > 0 ? median(scored) : null,
        bestMs: ok.length > 0 ? Math.min(...ok) : null,
        penalties: results.filter((r) => r.outcome !== 'ok' && r.outcome !== 'held').length,
        played: results.some((r) => r.outcome !== 'missed' && r.outcome !== 'held'),
      };
    })
    .sort(
      (a, b) =>
        (a.medianMs ?? Number.POSITIVE_INFINITY) - (b.medianMs ?? Number.POSITIVE_INFINITY) ||
        (a.bestMs ?? Number.POSITIVE_INFINITY) - (b.bestMs ?? Number.POSITIVE_INFINITY) ||
        (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0),
    );
}

export const reactionModule: GameModule<
  ReactionContent,
  ReactionSettings,
  ReactionState,
  ReactionInput,
  ReactionHostView,
  ReactionPlayerView
> = {
  id: REACTION_GAME_TYPE,
  name: 'Reaction',
  version: 1,
  contentSchema: reactionContentSchema,
  settingsSchema: reactionSettingsSchema,
  defaultSettings: REACTION_DEFAULT_SETTINGS,
  inputSchema: reactionInputSchema,
  hostViewSchema: reactionHostViewSchema,
  playerViewSchema: reactionPlayerViewSchema,
  capabilities: { minPlayers: 1, maxPlayers: 20 },

  createRound(ctx) {
    const state: ReactionState = {
      phase: 'INTRO',
      attempts: planAttempts(ctx),
      current: 0,
      goAt: null,
      shown: {},
      results: {},
    };
    if (ctx.settings.introMs === 0) return armed(state, 0);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    switch (state.phase) {
      case 'INTRO':
        return armed(state, 0);
      case 'ARMED':
        return {
          state: { ...state, phase: 'GO', goAt: ctx.now },
          effects: [
            {
              type: 'phase',
              phase: 'GO',
              durationMs: ctx.settings.maxReactionMs + GO_SLACK_MS,
            },
          ],
        };
      case 'GO':
        return closeAttempt(state, ctx);
      case 'RESULT': {
        const next = state.current + 1;
        if (next < state.attempts.length) return armed(state, next);
        return {
          state: { ...state, phase: 'REVEAL' },
          effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
        };
      }
      default:
        return { state };
    }
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: InputRejectCode) => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    const playerId = meta.playerId;
    if (!ctx.players.some((player) => player.id === playerId)) return reject('INVALID_INPUT');
    if (input.attempt !== state.current) return reject('ROUND_CLOSED');
    const decided = state.results[playerId]?.[state.current];
    const decide = (result: Result): Transition<ReactionState> => {
      const next: ReactionState = {
        ...state,
        results: {
          ...state.results,
          [playerId]: { ...(state.results[playerId] ?? {}), [state.current]: result },
        },
      };
      // Everyone connected has a result: no need to wait for the GO clock.
      const done = ctx.players
        .filter((player) => player.connected)
        .every((player) => next.results[player.id]?.[state.current] !== undefined);
      return next.phase === 'GO' && done ? closeAttempt(next, ctx) : { state: next };
    };

    if (input.type === 'early') {
      if (state.phase !== 'ARMED') return reject('ROUND_CLOSED');
      if (decided) return reject('ALREADY_ANSWERED');
      return decide({ outcome: 'early', ms: null });
    }
    if (state.phase !== 'GO' || state.goAt === null) return reject('ROUND_CLOSED');
    if (decided) return reject('ALREADY_ANSWERED');

    if (input.type === 'shown') {
      if (state.shown[playerId] !== undefined) return reject('ALREADY_ANSWERED');
      return { state: { ...state, shown: { ...state.shown, [playerId]: meta.receivedAt } } };
    }
    if (state.attempts[state.current]?.kind === 'decoy') {
      return decide({ outcome: 'decoyTap', ms: null });
    }
    const verdict = plausibleTap({
      reactionMs: input.reactionMs,
      goAt: state.goAt,
      shownAt: state.shown[playerId] ?? null,
      tapAt: meta.receivedAt,
      minReactionMs: ctx.settings.minReactionMs,
      maxReactionMs: ctx.settings.maxReactionMs,
    });
    return decide({ outcome: verdict, ms: verdict === 'ok' ? Math.round(input.reactionMs) : null });
  },

  onSkip(state, ctx) {
    // Skipping ends the round with the attempts so far.
    if (state.phase === 'REVEAL' || state.phase === 'INTRO') return null;
    const closed = state.phase === 'RESULT' ? state : closeAttempt(state, ctx).state;
    return {
      state: { ...closed, phase: 'REVEAL' },
      effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
    };
  },

  score(state, ctx) {
    const summaries = summarize(state, ctx);
    const ranked = summaries.filter((summary) => summary.medianMs !== null);
    return summaries.map((summary): ScoreResult => {
      const place = ranked.indexOf(summary);
      const base =
        place < 0
          ? 0
          : Math.max(ctx.settings.minScore, ctx.settings.baseScore - place * ctx.settings.rankStep);
      const points = Math.round(base * ctx.scoreMultiplier);
      return {
        playerId: summary.playerId,
        points,
        correct: !summary.played
          ? null
          : summary.medianMs !== null && summary.medianMs < ctx.settings.goodMs,
        responseTimeMs: summary.medianMs,
        answer: { results: Object.values(state.results[summary.playerId] ?? {}) },
        breakdown: {
          base: points,
          medianMs: summary.medianMs ?? 0,
          penalties: summary.penalties,
        },
      };
    });
  },

  getHostView(state, ctx) {
    const total = state.attempts.length;
    const progress = { attempt: state.current, total };
    const kind = state.attempts[state.current]?.kind ?? 'target';
    switch (state.phase) {
      case 'INTRO':
        return { phase: 'INTRO', title: ctx.content.title, variant: ctx.content.variant, total };
      case 'ARMED':
        return { phase: 'ARMED', ...progress };
      case 'GO':
        return {
          phase: 'GO',
          ...progress,
          kind,
          doneCount: ctx.players.filter(
            (player) => state.results[player.id]?.[state.current] !== undefined,
          ).length,
          playerCount: ctx.players.filter((player) => player.connected).length,
        };
      case 'RESULT':
        return {
          phase: 'RESULT',
          ...progress,
          kind,
          results: ctx.players
            .flatMap((player) => {
              const result = state.results[player.id]?.[state.current];
              return result ? [{ playerId: player.id, ...result }] : [];
            })
            .sort(
              (a, b) => (a.ms ?? Number.POSITIVE_INFINITY) - (b.ms ?? Number.POSITIVE_INFINITY),
            ),
        };
      case 'REVEAL':
        return {
          phase: 'REVEAL',
          ranking: summarize(state, ctx).map(({ played: _played, ...rest }) => rest),
        };
    }
  },

  getPlayerView(state, playerId, ctx) {
    const total = state.attempts.length;
    const progress = { attempt: state.current, total };
    const kind = state.attempts[state.current]?.kind ?? 'target';
    const own = state.results[playerId] ?? {};
    const current = own[state.current] ?? null;
    switch (state.phase) {
      case 'INTRO':
        return { phase: 'INTRO', title: ctx.content.title, variant: ctx.content.variant };
      case 'ARMED':
        return { phase: 'ARMED', ...progress, early: current?.outcome === 'early' };
      case 'GO':
        return { phase: 'GO', ...progress, kind, done: current?.outcome ?? null };
      case 'RESULT':
        return {
          phase: 'RESULT',
          ...progress,
          kind,
          outcome: current?.outcome ?? 'missed',
          ms: current?.ms ?? null,
        };
      case 'REVEAL': {
        const ranked = summarize(state, ctx).filter((summary) => summary.medianMs !== null);
        const place = ranked.findIndex((summary) => summary.playerId === playerId);
        return {
          phase: 'REVEAL',
          medianMs: ranked[place]?.medianMs ?? null,
          rank: place >= 0 ? place + 1 : null,
          results: state.attempts.flatMap((attempt, index) => {
            const result = own[index];
            return result ? [{ ...result, kind: attempt.kind }] : [];
          }),
        };
      }
    }
  },
};
