import {
  cleanText,
  foldText,
  isNearMatch,
  type GameModule,
  type InputRejectCode,
  type RoundContext,
  type ScoreResult,
  type Transition,
} from '@loudroom/game-sdk';
import { bluffImporter } from './import.js';
import {
  BLUFF_DEFAULT_SETTINGS,
  BLUFF_GAME_TYPE,
  BLUFF_MAX_TEXT,
  bluffContentSchema,
  bluffHostViewSchema,
  bluffInputSchema,
  bluffPlayerViewSchema,
  bluffSettingsSchema,
  type BluffContent,
  type BluffHostView,
  type BluffInput,
  type BluffPlayerView,
  type BluffRevealStep,
  type BluffSettings,
} from './schema.js';

export * from './schema.js';
export { bluffImporter } from './import.js';

export type BluffPhase = 'INTRO' | 'WRITE' | 'VOTE' | 'REVEAL';

interface Lie {
  text: string;
  responseTimeMs: number;
}

interface Vote {
  optionId: string;
  responseTimeMs: number;
}

interface BluffOption {
  id: string;
  /** As shown: Turkish upper case. */
  text: string;
  kind: 'truth' | 'lie' | 'decoy';
  /** Players whose (identical) lies this option is. */
  authors: string[];
}

export interface BluffState {
  phase: BluffPhase;
  lies: Record<string, Lie>;
  /** Built when voting opens. */
  options: BluffOption[];
  votes: Record<string, Vote>;
  /** The REVEAL clock has run out and the round is scored. */
  done: boolean;
}

type Ctx = RoundContext<BluffContent, BluffSettings>;

/** Comparison key: same key = same option ("Sekiz", "SEKİZ" and "sekiz!" merge). */
const keyOf = (text: string) => foldText(text).replace(/ /g, '');
const shown = (text: string) => cleanText(text).toLocaleUpperCase('tr');
const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

const REVEAL_TOTAL_MS = 24_000;
const REVEAL_HOLD_MS = 1_500;

/** Step length: up to 3 s, shorter with many steps so the reveal stays under ~25 s. */
export function revealStepMs(steps: number): number {
  return Math.max(1_500, Math.min(3_000, Math.round(REVEAL_TOTAL_MS / Math.max(1, steps))));
}

function timeTaken(ctx: Ctx, receivedAt: number, fallbackMs: number): number {
  const total = ctx.phase?.durationMs ?? fallbackMs;
  const endsAt = ctx.phase?.endsAt ?? receivedAt;
  return total - Math.min(total, Math.max(0, endsAt - receivedAt));
}

/**
 * The options to vote on: the truth, the lies (identical ones merged, authors in join order)
 * and, if there are fewer than `minOptions`, decoys. Ordered by text first and then shuffled
 * with the round seed, with ids by position — so neither order nor id depends on which
 * option is real.
 */
function buildOptions(state: BluffState, ctx: Ctx): BluffOption[] {
  const present = ctx.players.map((player) => player.id);
  const lies = new Map<string, { key: string; text: string; authors: string[] }>();
  for (const playerId of present) {
    const lie = state.lies[playerId];
    if (!lie) continue;
    const key = keyOf(lie.text);
    const entry = lies.get(key) ?? { key, text: lie.text, authors: [] };
    entry.authors.push(playerId);
    lies.set(key, entry);
  }
  const candidates = [
    {
      key: keyOf(ctx.content.answer),
      text: ctx.content.answer,
      kind: 'truth' as const,
      authors: [],
    },
    ...[...lies.values()].map((lie) => ({ ...lie, kind: 'lie' as const })),
  ];
  // A decoy someone also wrote is that player's lie now.
  const decoys = ctx.content.decoys
    .map((text) => ({ key: keyOf(text), text, kind: 'decoy' as const, authors: [] }))
    .filter((decoy) => !lies.has(decoy.key))
    .sort(byKey);
  const missing = Math.max(0, ctx.settings.minOptions - candidates.length);
  const chosen = [...candidates, ...ctx.random.shuffle(decoys).slice(0, missing)].sort(byKey);
  return ctx.random.shuffle(chosen).map((option, index) => ({
    id: `o${index + 1}`,
    text: shown(option.text),
    kind: option.kind,
    authors: option.authors,
  }));
}

function writing(state: BluffState, ctx: Ctx): Transition<BluffState> {
  return {
    state: { ...state, phase: 'WRITE' },
    effects: [{ type: 'phase', phase: 'WRITE', durationMs: ctx.settings.timeLimitMs }],
  };
}

function voting(state: BluffState, ctx: Ctx): Transition<BluffState> {
  return {
    state: { ...state, phase: 'VOTE', options: buildOptions(state, ctx) },
    effects: [{ type: 'phase', phase: 'VOTE', durationMs: ctx.settings.voteMs }],
  };
}

/** Votes of players still in the room. */
function countedVotes(state: BluffState, ctx: Ctx): [string, Vote][] {
  const present = new Set(ctx.players.map((player) => player.id));
  return Object.entries(state.votes).filter(([playerId]) => present.has(playerId));
}

/** Picked lies and decoys, least picked first, then the truth. */
function revealSteps(state: BluffState, ctx: Ctx): BluffRevealStep[] {
  const votes = countedVotes(state, ctx);
  const withVoters = state.options.map((option) => ({
    optionId: option.id,
    text: option.text,
    kind: option.kind,
    authors: option.authors,
    voters: votes.filter(([, vote]) => vote.optionId === option.id).map(([voter]) => voter),
  }));
  const picked = withVoters
    .filter((step) => step.kind !== 'truth' && step.voters.length > 0)
    .sort((a, b) => a.voters.length - b.voters.length);
  return [...picked, ...withVoters.filter((step) => step.kind === 'truth')];
}

function revealing(state: BluffState, ctx: Ctx): Transition<BluffState> {
  const next: BluffState = { ...state, phase: 'REVEAL' };
  const steps = revealSteps(next, ctx).length;
  return {
    state: next,
    effects: [
      {
        type: 'phase',
        phase: 'REVEAL',
        durationMs: revealStepMs(steps) * steps + REVEAL_HOLD_MS,
      },
    ],
  };
}

const connectedIds = (ctx: Ctx) =>
  ctx.players.filter((player) => player.connected).map((player) => player.id);

export const bluffModule: GameModule<
  BluffContent,
  BluffSettings,
  BluffState,
  BluffInput,
  BluffHostView,
  BluffPlayerView
> = {
  id: BLUFF_GAME_TYPE,
  name: 'Bluff',
  version: 1,
  contentSchema: bluffContentSchema,
  settingsSchema: bluffSettingsSchema,
  defaultSettings: BLUFF_DEFAULT_SETTINGS,
  inputSchema: bluffInputSchema,
  hostViewSchema: bluffHostViewSchema,
  playerViewSchema: bluffPlayerViewSchema,
  capabilities: { minPlayers: 2, maxPlayers: 20 },
  importer: bluffImporter,

  createRound(ctx) {
    const state: BluffState = { phase: 'INTRO', lies: {}, options: [], votes: {}, done: false };
    if (ctx.settings.introMs === 0) return writing(state, ctx);
    return {
      state,
      effects: [{ type: 'phase', phase: 'INTRO', durationMs: ctx.settings.introMs }],
    };
  },

  onTimer(state, ctx) {
    if (state.phase === 'INTRO') return writing(state, ctx);
    if (state.phase === 'WRITE') return voting(state, ctx);
    if (state.phase === 'VOTE') return revealing(state, ctx);
    if (!state.done) {
      return { state: { ...state, done: true }, effects: [{ type: 'endRound' }] };
    }
    return { state };
  },

  onSkip(state) {
    // Skipping the staged reveal ends it with the scores; earlier the round is dropped.
    if (state.phase !== 'REVEAL' || state.done) return null;
    return { state: { ...state, done: true }, effects: [{ type: 'endRound' }] };
  },

  onInput(state, input, meta, ctx) {
    const reject = (code: InputRejectCode) => ({
      state,
      effects: [{ type: 'reject' as const, playerId: meta.playerId, code }],
    });
    if (!ctx.players.some((player) => player.id === meta.playerId)) return reject('INVALID_INPUT');

    if (input.type === 'lie') {
      if (state.phase !== 'WRITE') return reject('ROUND_CLOSED');
      if (state.lies[meta.playerId]) return reject('ALREADY_ANSWERED');
      const text = cleanText(input.text);
      if (keyOf(text).length === 0 || Array.from(text).length > BLUFF_MAX_TEXT) {
        return reject('INVALID_INPUT');
      }
      if (ctx.moderation.isBlocked(text)) return reject('TEXT_REJECTED');
      const truths = [ctx.content.answer, ...(ctx.content.acceptedAnswers ?? [])];
      if (truths.some((truth) => isNearMatch(text, truth))) return reject('TOO_CLOSE');
      const next: BluffState = {
        ...state,
        lies: {
          ...state.lies,
          [meta.playerId]: {
            text,
            responseTimeMs: timeTaken(ctx, meta.receivedAt, ctx.settings.timeLimitMs),
          },
        },
      };
      // Everyone who can write has written: vote without waiting for the clock.
      if (connectedIds(ctx).every((id) => next.lies[id] !== undefined)) return voting(next, ctx);
      return { state: next };
    }

    if (state.phase !== 'VOTE') return reject('ROUND_CLOSED');
    const option = state.options.find((candidate) => candidate.id === input.optionId);
    // Nobody votes for their own lie (SPEC §7.6).
    if (!option || option.authors.includes(meta.playerId)) return reject('INVALID_INPUT');
    if (state.votes[meta.playerId]) return reject('ALREADY_ANSWERED');
    const next: BluffState = {
      ...state,
      votes: {
        ...state.votes,
        [meta.playerId]: {
          optionId: option.id,
          responseTimeMs: timeTaken(ctx, meta.receivedAt, ctx.settings.voteMs),
        },
      },
    };
    if (connectedIds(ctx).every((id) => next.votes[id] !== undefined)) return revealing(next, ctx);
    return { state: next };
  },

  score(state, ctx) {
    const votes = countedVotes(state, ctx);
    const scaled = (points: number) => Math.round(points * ctx.scoreMultiplier);
    return ctx.players.map((player): ScoreResult => {
      const vote = state.votes[player.id];
      const picked = state.options.find((option) => option.id === vote?.optionId);
      const fooled = votes.filter(([voter, other]) => {
        const option = state.options.find((candidate) => candidate.id === other.optionId);
        return voter !== player.id && option?.authors.includes(player.id) === true;
      }).length;
      const truth = picked?.kind === 'truth' ? scaled(ctx.settings.truthPoints) : 0;
      const fool = fooled * scaled(ctx.settings.foolPoints);
      const lie = state.lies[player.id]?.text ?? null;
      return {
        playerId: player.id,
        points: truth + fool,
        correct: picked ? picked.kind === 'truth' : null,
        responseTimeMs: vote?.responseTimeMs ?? null,
        answer: vote || lie ? { lie, optionId: vote?.optionId ?? null } : null,
        breakdown: { truth, fooled, fool },
      };
    });
  },

  getHostView(state, ctx) {
    const question = ctx.content.question;
    const playerCount = connectedIds(ctx).length;
    const present = new Set(ctx.players.map((player) => player.id));
    const options = state.options.map((option) => ({ id: option.id, text: option.text }));
    switch (state.phase) {
      case 'INTRO':
        return { phase: 'INTRO', question };
      case 'WRITE':
        return {
          phase: 'WRITE',
          question,
          writtenCount: Object.keys(state.lies).filter((id) => present.has(id)).length,
          playerCount,
        };
      case 'VOTE':
        return {
          phase: 'VOTE',
          question,
          options,
          votedCount: countedVotes(state, ctx).length,
          playerCount,
        };
      case 'REVEAL': {
        const steps = revealSteps(state, ctx);
        return {
          phase: 'REVEAL',
          question,
          options,
          steps,
          stepMs: revealStepMs(steps.length),
          done: state.done,
        };
      }
    }
  },

  getPlayerView(state, playerId, ctx) {
    const question = ctx.content.question;
    const lie = state.lies[playerId]?.text ?? null;
    const vote = state.votes[playerId]?.optionId ?? null;
    switch (state.phase) {
      case 'INTRO':
        return { phase: 'INTRO', question };
      case 'WRITE':
        return { phase: 'WRITE', question, lie };
      case 'VOTE':
        return {
          phase: 'VOTE',
          question,
          options: state.options.map((option) => ({
            id: option.id,
            text: option.text,
            own: option.authors.includes(playerId),
          })),
          vote,
        };
      case 'REVEAL': {
        const picked = state.options.find((option) => option.id === vote);
        const mine = new Set(
          state.options.filter((option) => option.authors.includes(playerId)).map((o) => o.id),
        );
        return {
          phase: 'REVEAL',
          question,
          done: state.done,
          truth: state.options.find((option) => option.kind === 'truth')?.text ?? '',
          lie,
          vote,
          correct: picked ? picked.kind === 'truth' : null,
          fooled: countedVotes(state, ctx)
            .filter(([voter, other]) => voter !== playerId && mine.has(other.optionId))
            .map(([voter]) => voter),
          fooledBy: picked?.kind === 'lie' ? picked.authors : [],
          pickedDecoy: picked?.kind === 'decoy',
        };
      }
    }
  },
};
