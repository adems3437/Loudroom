import type { GameModule, RoundContext, ScoreResult, Transition } from '@loudroom/game-sdk';
import {
  WHO_WOULD_DEFAULT_SETTINGS,
  WHO_WOULD_GAME_TYPE,
  WHO_WOULD_MIN_PLAYERS,
  whoWouldContentSchema,
  whoWouldHostViewSchema,
  whoWouldInputSchema,
  whoWouldPlayerViewSchema,
  whoWouldSettingsSchema,
  type WhoWouldContent,
  type WhoWouldHostView,
  type WhoWouldInput,
  type WhoWouldPlayerView,
  type WhoWouldSettings,
} from './schema.js';

export * from './schema.js';

export type WhoWouldPhase = 'INTRO' | 'VOTING' | 'REVEAL' | 'SKIPPED';

interface Vote {
  playerId: string;
  /** Time taken since voting opened. */
  responseTimeMs: number;
}

export interface WhoWouldState {
  phase: WhoWouldPhase;
  /** Players connected at the start; someone who drops out later stays an option. */
  candidates: string[];
  /** Voter → vote. Only counts ever leave the server. */
  votes: Record<string, Vote>;
}

type Ctx = RoundContext<WhoWouldContent, WhoWouldSettings>;

function votingPhase(state: WhoWouldState, ctx: Ctx): Transition<WhoWouldState> {
  return {
    state: { ...state, phase: 'VOTING' },
    effects: [{ type: 'phase', phase: 'VOTING', durationMs: ctx.settings.timeLimitMs }],
  };
}

function reveal(state: WhoWouldState): Transition<WhoWouldState> {
  return {
    state: { ...state, phase: 'REVEAL' },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

/** Votes of players still in the room. */
function countedVotes(state: WhoWouldState, ctx: Ctx): Vote[] {
  const present = new Set(ctx.players.map((player) => player.id));
  return Object.entries(state.votes)
    .filter(([voter]) => present.has(voter))
    .map(([, vote]) => vote);
}

/** Votes per candidate (most first, ties in candidate order) and the most voted. */
function tally(state: WhoWouldState, ctx: Ctx) {
  const votes = countedVotes(state, ctx);
  const distribution = state.candidates
    .map((playerId) => ({
      playerId,
      count: votes.filter((vote) => vote.playerId === playerId).length,
    }))
    .sort((a, b) => b.count - a.count);
  const top = distribution[0]?.count ?? 0;
  const winners =
    top > 0 ? distribution.filter((entry) => entry.count === top).map((e) => e.playerId) : [];
  return { distribution, winners, votedCount: votes.length };
}

export const whoWouldModule: GameModule<
  WhoWouldContent,
  WhoWouldSettings,
  WhoWouldState,
  WhoWouldInput,
  WhoWouldHostView,
  WhoWouldPlayerView
> = {
  id: WHO_WOULD_GAME_TYPE,
  name: 'Kim Yapar?',
  version: 1,
  contentSchema: whoWouldContentSchema,
  settingsSchema: whoWouldSettingsSchema,
  defaultSettings: WHO_WOULD_DEFAULT_SETTINGS,
  inputSchema: whoWouldInputSchema,
  hostViewSchema: whoWouldHostViewSchema,
  playerViewSchema: whoWouldPlayerViewSchema,
  capabilities: { minPlayers: WHO_WOULD_MIN_PLAYERS, maxPlayers: 20 },

  createRound(ctx) {
    const candidates = ctx.players.filter((player) => player.connected).map((p) => p.id);
    const state: WhoWouldState = { phase: 'INTRO', candidates, votes: {} };
    if (candidates.length < WHO_WOULD_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED' },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    if (ctx.settings.introMs === 0) return votingPhase(state, ctx);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') return votingPhase(state, ctx);
    if (state.phase === 'VOTING') return reveal(state);
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: 'ROUND_CLOSED' | 'ALREADY_ANSWERED' | 'INVALID_INPUT') => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    if (state.phase !== 'VOTING') return reject('ROUND_CLOSED');
    if (!ctx.players.some((player) => player.id === meta.playerId)) return reject('INVALID_INPUT');
    if (!state.candidates.includes(input.playerId)) return reject('INVALID_INPUT');
    if (input.playerId === meta.playerId && !ctx.settings.allowSelfVote) {
      return reject('INVALID_INPUT');
    }
    if (state.votes[meta.playerId]) return reject('ALREADY_ANSWERED');

    const total = ctx.phase?.durationMs ?? ctx.settings.timeLimitMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remainingMs = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: WhoWouldState = {
      ...state,
      votes: {
        ...state.votes,
        [meta.playerId]: { playerId: input.playerId, responseTimeMs: total - remainingMs },
      },
    };
    const connected = ctx.players.filter((player) => player.connected);
    if (connected.every((player) => next.votes[player.id] !== undefined)) return reveal(next);
    return { state: next };
  },

  score(state, ctx) {
    const winners: string[] = state.phase === 'SKIPPED' ? [] : tally(state, ctx).winners;
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    return ctx.players.map((player): ScoreResult => {
      const vote = state.votes[player.id];
      const winner = winners.includes(player.id) ? scaled(ctx.settings.winnerPoints) : 0;
      if (!vote) {
        return {
          playerId: player.id,
          points: winner,
          correct: null,
          responseTimeMs: null,
          answer: null,
          breakdown: { vote: 0, winner },
        };
      }
      const correct = winners.includes(vote.playerId);
      const points = correct ? scaled(ctx.settings.baseScore) : 0;
      return {
        playerId: player.id,
        points: points + winner,
        correct,
        responseTimeMs: vote.responseTimeMs,
        answer: { playerId: vote.playerId },
        breakdown: { vote: points, winner },
      };
    });
  },

  getHostView(state, ctx) {
    const question = ctx.content.question;
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', question, minPlayers: WHO_WOULD_MIN_PLAYERS };
    }
    if (state.phase === 'INTRO') return { phase: 'INTRO', question };
    const { distribution, winners, votedCount } = tally(state, ctx);
    const common = {
      question,
      candidates: state.candidates,
      votedCount,
      playerCount: ctx.players.filter((player) => player.connected).length,
    };
    if (state.phase === 'VOTING') return { phase: 'VOTING', ...common };
    return {
      phase: 'REVEAL',
      ...common,
      title: ctx.content.title ?? null,
      distribution,
      winners,
    };
  },

  getPlayerView(state, playerId, ctx) {
    const question = ctx.content.question;
    const votedFor = state.votes[playerId]?.playerId ?? null;
    if (state.phase === 'SKIPPED') {
      return { phase: 'SKIPPED', question, minPlayers: WHO_WOULD_MIN_PLAYERS };
    }
    if (state.phase === 'INTRO') return { phase: 'INTRO', question };
    if (state.phase === 'VOTING') {
      return {
        phase: 'VOTING',
        question,
        candidates: state.candidates,
        allowSelfVote: ctx.settings.allowSelfVote,
        votedFor,
      };
    }
    const { distribution, winners } = tally(state, ctx);
    return {
      phase: 'REVEAL',
      question,
      title: ctx.content.title ?? null,
      distribution,
      winners,
      votedFor,
      correct: votedFor === null ? null : winners.includes(votedFor),
    };
  },
};
