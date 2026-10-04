import type {
  GameModule,
  InputRejectCode,
  RoundContext,
  ScoreResult,
  Transition,
} from '@loudroom/game-sdk';
import { spyImporter } from './import.js';
import {
  SPY_DEFAULT_SETTINGS,
  SPY_GAME_TYPE,
  SPY_MIN_PLAYERS,
  spyContentSchema,
  spyHostViewSchema,
  spyInputSchema,
  spyPlayerViewSchema,
  spySettingsSchema,
  type SpyContent,
  type SpyHostView,
  type SpyInput,
  type SpyLocation,
  type SpyOutcome,
  type SpyPlayerView,
  type SpyRole,
  type SpySettings,
} from './schema.js';

export * from './schema.js';
export { spyImporter } from './import.js';

export type SpyPhase = 'INTRO' | 'DISCUSS' | 'VOTE' | 'REVEAL' | 'SKIPPED';

interface Vote {
  playerId: string;
  /** Time taken since voting opened. */
  responseTimeMs: number;
}

export interface SpyState {
  phase: SpyPhase;
  /** The picked place. Reaches only the non-spies' phones until the reveal. */
  locationId: string;
  /** Reaches only the spies' own phones until the reveal. */
  spies: string[];
  /** Players connected when the round began; the only ones with a role. */
  roster: string[];
  asker: string;
  askedBy: string | null;
  lastAsk: { from: string; to: string } | null;
  voteRequests: string[];
  votes: Record<string, Vote>;
  guess: { playerId: string; locationId: string; correct: boolean } | null;
  outcome: SpyOutcome | null;
}

type Ctx = RoundContext<SpyContent, SpySettings>;
type Step = Transition<SpyState>;

function spyCount(players: number, settings: SpySettings): number {
  return settings.twoSpiesFrom > 0 && players >= settings.twoSpiesFrom ? 2 : 1;
}

function connectedIn(state: SpyState, ctx: Ctx): string[] {
  const connected = new Set(ctx.players.filter((p) => p.connected).map((p) => p.id));
  return state.roster.filter((id) => connected.has(id));
}

/** Early vote: more than half of the connected players in the round asked for it. */
function votesNeeded(state: SpyState, ctx: Ctx): number {
  return Math.floor(connectedIn(state, ctx).length / 2) + 1;
}

function discuss(state: SpyState, ctx: Ctx): Step {
  return {
    state: { ...state, phase: 'DISCUSS' },
    effects: [{ type: 'phase', phase: 'DISCUSS', durationMs: ctx.settings.discussionMs }],
  };
}

function vote(state: SpyState, ctx: Ctx): Step {
  return {
    state: { ...state, phase: 'VOTE' },
    effects: [{ type: 'phase', phase: 'VOTE', durationMs: ctx.settings.voteMs }],
  };
}

function reveal(state: SpyState, outcome: SpyOutcome): Step {
  return {
    state: { ...state, phase: 'REVEAL', outcome },
    effects: [{ type: 'phase', phase: 'REVEAL', durationMs: null }, { type: 'endRound' }],
  };
}

/** Votes per roster player (most first, ties in roster order), from players still present. */
function tally(state: SpyState, ctx: Ctx) {
  const present = new Set(ctx.players.map((player) => player.id));
  const votes = Object.entries(state.votes)
    .filter(([voter]) => present.has(voter))
    .map(([, cast]) => cast.playerId);
  return state.roster
    .map((playerId) => ({ playerId, count: votes.filter((id) => id === playerId).length }))
    .sort((a, b) => b.count - a.count);
}

/** The vote's verdict: the single most voted player is caught if a spy; a tie catches nobody. */
function verdict(state: SpyState, ctx: Ctx): SpyOutcome {
  const [first, second] = tally(state, ctx);
  if (!first || first.count === 0 || second?.count === first.count) return 'escaped';
  return state.spies.includes(first.playerId) ? 'caught' : 'escaped';
}

function locationOf(ctx: Ctx, id: string): SpyLocation {
  const location = ctx.content.locations.find((place) => place.id === id);
  if (!location) throw new Error(`Unknown location ${id}`);
  return location;
}

function sortedLocations(ctx: Ctx): SpyLocation[] {
  return [...ctx.content.locations].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function roleOf(state: SpyState, playerId: string, ctx: Ctx): SpyRole {
  if (!state.roster.includes(playerId)) return null;
  if (state.spies.includes(playerId)) return { spy: true };
  return { spy: false, location: locationOf(ctx, state.locationId) };
}

/** The town won: the spy was caught or named the wrong place. */
function townWon(outcome: SpyOutcome | null): boolean {
  return outcome === 'caught' || outcome === 'wrongGuess';
}

/** The TV, which everyone sees: never the place nor the spies before the reveal. */
function hostView(state: SpyState, ctx: Ctx): SpyHostView {
  const title = ctx.content.title;
  if (state.phase === 'SKIPPED') return { phase: 'SKIPPED', title, minPlayers: SPY_MIN_PLAYERS };
  const table = {
    title,
    locations: sortedLocations(ctx),
    spyCount: state.spies.length,
    roster: state.roster,
  };
  if (state.phase === 'INTRO') return { phase: 'INTRO', ...table };
  if (state.phase === 'DISCUSS') {
    return {
      phase: 'DISCUSS',
      ...table,
      asker: state.asker,
      askedBy: state.askedBy,
      lastAsk: state.lastAsk,
      voteRequests: state.voteRequests.filter((id) => connectedIn(state, ctx).includes(id)).length,
      votesNeeded: votesNeeded(state, ctx),
    };
  }
  if (state.phase === 'VOTE') {
    return {
      phase: 'VOTE',
      ...table,
      votedCount: Object.keys(state.votes).filter((id) => state.roster.includes(id)).length,
      playerCount: connectedIn(state, ctx).length,
    };
  }
  return {
    phase: 'REVEAL',
    ...table,
    location: locationOf(ctx, state.locationId),
    spies: state.spies,
    outcome: state.outcome ?? 'escaped',
    distribution: tally(state, ctx),
    guess: state.guess,
  };
}

export const spyModule: GameModule<
  SpyContent,
  SpySettings,
  SpyState,
  SpyInput,
  SpyHostView,
  SpyPlayerView
> = {
  id: SPY_GAME_TYPE,
  name: 'Casus Kim?',
  version: 1,
  contentSchema: spyContentSchema,
  settingsSchema: spySettingsSchema,
  defaultSettings: SPY_DEFAULT_SETTINGS,
  inputSchema: spyInputSchema,
  hostViewSchema: spyHostViewSchema,
  playerViewSchema: spyPlayerViewSchema,
  capabilities: { minPlayers: SPY_MIN_PLAYERS, maxPlayers: 20 },
  importer: spyImporter,

  createRound(ctx) {
    const roster = ctx.players.filter((player) => player.connected).map((p) => p.id);
    const spies = ctx.random.shuffle(roster).slice(0, spyCount(roster.length, ctx.settings));
    const location = ctx.content.locations[ctx.random.int(0, ctx.content.locations.length - 1)];
    const asker = roster[ctx.random.int(0, Math.max(0, roster.length - 1))] ?? '';
    const state: SpyState = {
      phase: 'INTRO',
      locationId: location?.id ?? '',
      spies,
      roster,
      asker,
      askedBy: null,
      lastAsk: null,
      voteRequests: [],
      votes: {},
      guess: null,
      outcome: null,
    };
    if (roster.length < SPY_MIN_PLAYERS) {
      return {
        state: { ...state, phase: 'SKIPPED', spies: [] },
        effects: [{ type: 'phase', phase: 'SKIPPED', durationMs: null }, { type: 'endRound' }],
      };
    }
    if (ctx.settings.introMs === 0) return discuss(state, ctx);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') return discuss(state, ctx);
    if (state.phase === 'DISCUSS') return vote(state, ctx);
    if (state.phase === 'VOTE') return reveal(state, verdict(state, ctx));
    return { state };
  },

  onInput(state, input, meta, ctx) {
    const playerId = meta.playerId;
    const reject = (code: InputRejectCode): Step => ({
      state,
      effects: [{ type: 'reject', playerId, code }],
    });
    if (state.phase !== 'DISCUSS' && state.phase !== 'VOTE') return reject('ROUND_CLOSED');
    if (!state.roster.includes(playerId)) return reject('INVALID_INPUT');

    if (input.type === 'guess') {
      if (!state.spies.includes(playerId)) return reject('INVALID_INPUT');
      if (!ctx.content.locations.some((place) => place.id === input.locationId)) {
        return reject('INVALID_INPUT');
      }
      const correct = input.locationId === state.locationId;
      return reveal(
        { ...state, guess: { playerId, locationId: input.locationId, correct } },
        correct ? 'guessed' : 'wrongGuess',
      );
    }

    if (input.type === 'ask') {
      if (state.phase !== 'DISCUSS') return reject('ROUND_CLOSED');
      const connected = connectedIn(state, ctx);
      // Whoever's turn it is asks; if they dropped out, anyone may carry on.
      const mayAsk = playerId === state.asker || !connected.includes(state.asker);
      const target = input.playerId;
      if (!mayAsk || target === playerId || !connected.includes(target)) {
        return reject('INVALID_INPUT');
      }
      if (target === state.askedBy && playerId === state.asker) return reject('INVALID_INPUT');
      return {
        state: {
          ...state,
          asker: target,
          askedBy: playerId,
          lastAsk: { from: playerId, to: target },
        },
      };
    }

    if (input.type === 'requestVote') {
      if (state.phase !== 'DISCUSS') return reject('ROUND_CLOSED');
      const others = state.voteRequests.filter((id) => id !== playerId);
      const next = { ...state, voteRequests: input.value ? [...others, playerId] : others };
      const requests = next.voteRequests.filter((id) => connectedIn(state, ctx).includes(id));
      if (requests.length >= votesNeeded(state, ctx)) return vote(next, ctx);
      return { state: next };
    }

    // A vote for whom the spy is.
    if (state.phase !== 'VOTE') return reject('ROUND_CLOSED');
    if (input.playerId === playerId || !state.roster.includes(input.playerId)) {
      return reject('INVALID_INPUT');
    }
    if (state.votes[playerId]) return reject('ALREADY_ANSWERED');
    const total = ctx.phase?.durationMs ?? ctx.settings.voteMs;
    const endsAt = ctx.phase?.endsAt ?? meta.receivedAt;
    const remainingMs = Math.min(total, Math.max(0, endsAt - meta.receivedAt));
    const next: SpyState = {
      ...state,
      votes: {
        ...state.votes,
        [playerId]: { playerId: input.playerId, responseTimeMs: total - remainingMs },
      },
    };
    const everyone = connectedIn(state, ctx).every((id) => next.votes[id] !== undefined);
    return everyone ? reveal(next, verdict(next, ctx)) : { state: next };
  },

  score(state, ctx) {
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    const town = townWon(state.outcome);
    return ctx.players.map((player): ScoreResult => {
      const vote = state.votes[player.id];
      const answer = vote ? { playerId: vote.playerId } : null;
      const responseTimeMs = vote?.responseTimeMs ?? null;
      if (!state.roster.includes(player.id) || state.outcome === null) {
        return {
          playerId: player.id,
          points: 0,
          correct: null,
          responseTimeMs,
          answer,
          breakdown: {},
        };
      }
      const spy = state.spies.includes(player.id);
      if (spy) {
        const guessed = state.outcome === 'guessed' && state.guess?.playerId === player.id;
        const win = town
          ? 0
          : scaled(guessed ? ctx.settings.spyGuessPoints : ctx.settings.spyEscapePoints);
        return {
          playerId: player.id,
          points: win,
          correct: !town,
          responseTimeMs,
          answer:
            state.guess?.playerId === player.id ? { locationId: state.guess.locationId } : answer,
          breakdown: { spy: win },
        };
      }
      const base = town ? scaled(ctx.settings.townPoints) : 0;
      const bonus =
        state.outcome === 'caught' && vote && state.spies.includes(vote.playerId)
          ? scaled(ctx.settings.voterBonus)
          : 0;
      return {
        playerId: player.id,
        points: base + bonus,
        correct: town,
        responseTimeMs,
        answer,
        breakdown: { town: base, vote: bonus },
      };
    });
  },

  getHostView: hostView,

  getPlayerView(state, playerId, ctx) {
    const host = hostView(state, ctx);
    if (host.phase === 'SKIPPED') return host;
    const role = roleOf(state, playerId, ctx);
    const votedFor = state.votes[playerId]?.playerId ?? null;
    if (host.phase === 'INTRO') return { ...host, role };
    if (host.phase === 'DISCUSS') {
      return { ...host, role, requestedVote: state.voteRequests.includes(playerId) };
    }
    if (host.phase === 'VOTE') return { ...host, role, votedFor };
    const inRound = state.roster.includes(playerId);
    const spy = state.spies.includes(playerId);
    return {
      ...host,
      role,
      votedFor,
      won: inRound ? spy !== townWon(state.outcome) : null,
    };
  },
};
