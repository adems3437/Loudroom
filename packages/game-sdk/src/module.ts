import type { z } from 'zod';
import type { Random } from './rng.js';

/** A room member as a game module sees them. */
export interface GamePlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
  /** Disconnected players stay in the game but cannot act until they return. */
  connected: boolean;
}

/** Per-player numbers the engine carries across rounds (streaks, tie-breaks). */
export interface PlayerStats {
  score: number;
  /** Consecutive correct answers before this round. */
  streak: number;
  correctCount: number;
  /** Sum of response times, used to break ties (faster ranks higher). */
  totalAnswerMs: number;
}

/** The phase the engine is timing, as set by the module's last `phase` effect. */
export interface PhaseClock {
  name: string;
  /** Null when the phase waits for an action instead of a timer. */
  durationMs: number | null;
  /** Server epoch ms when the phase ends; shifted by the engine when a game is paused. */
  endsAt: number | null;
}

/** Size of an uploaded image the content refers to (Media width/height, in pixels). */
export interface MediaInfo {
  width: number;
  height: number;
}

/** Checks player-written text against the server's blocked-word lists (SPEC §9). */
export interface Moderation {
  isBlocked(text: string): boolean;
}

export interface RoundContext<Content, Settings> {
  roundId: string;
  roundIndex: number;
  content: Content;
  settings: Settings;
  /** Multiplier from the game pack for this round. */
  scoreMultiplier: number;
  players: readonly GamePlayer[];
  stats: Readonly<Record<string, PlayerStats>>;
  /** Current phase clock; null before the first `phase` effect. */
  phase: PhaseClock | null;
  /** Server time of this call. */
  now: number;
  /** Seeded per round: identical inputs give identical rounds (tests, replays). */
  random: Random;
  /** Sizes of the images this round's content refers to, by media id. */
  media: Readonly<Record<string, MediaInfo>>;
  /** Blocked-word check for text players write. */
  moderation: Moderation;
}

export interface InputMeta {
  playerId: string;
  /** Server time the input arrived. */
  receivedAt: number;
}

export type InputRejectCode =
  | 'ROUND_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'INVALID_INPUT'
  /** A written answer is (nearly) the real answer, e.g. a Bluff lie: write another one. */
  | 'TOO_CLOSE'
  /** A written answer failed the blocked-word check. */
  | 'TEXT_REJECTED';

export type Effect =
  /** Enter a phase; with a duration the engine calls `onTimer` when it runs out. */
  | { type: 'phase'; phase: string; durationMs: number | null }
  /** The round is over: the engine calls `score` and shows the result. */
  | { type: 'endRound' }
  /** Refuse a player's input; the code is returned in their command ack. */
  | { type: 'reject'; playerId: string; code: InputRejectCode };

export interface Transition<State> {
  state: State;
  effects?: Effect[];
}

export interface ScoreResult {
  playerId: string;
  points: number;
  /** null when the player did not answer (or correctness does not apply). */
  correct: boolean | null;
  /** Response time in ms since answering opened; null without an answer. */
  responseTimeMs: number | null;
  /** The player's answer as recorded in history (PlayerAnswer.input); null without one. */
  answer: unknown;
  /** Named parts of `points`, stored with the score event. */
  breakdown: Record<string, number>;
}

/**
 * A game. Functions are pure and synchronous: IO, timers, persistence and broadcasting are
 * the engine's job (SPEC §5), which keeps modules easy to test and adding a game free of core
 * changes.
 */
export interface GameModule<Content, Settings, State, Input, HostView, PlayerView> {
  id: string;
  name: string;
  version: number;
  contentSchema: z.ZodType<Content>;
  settingsSchema: z.ZodType<Settings>;
  defaultSettings: Settings;
  inputSchema: z.ZodType<Input>;
  /** Exact shape of what the host screen receives; also used by the leak tests. */
  hostViewSchema: z.ZodType<HostView>;
  playerViewSchema: z.ZodType<PlayerView>;
  capabilities: { minPlayers: number; maxPlayers: number; usesStream?: boolean };

  createRound(ctx: RoundContext<Content, Settings>): Transition<State>;
  onInput(
    state: State,
    input: Input,
    meta: InputMeta,
    ctx: RoundContext<Content, Settings>,
  ): Transition<State>;
  onTimer(state: State, ctx: RoundContext<Content, Settings>): Transition<State>;
  score(state: State, ctx: RoundContext<Content, Settings>): ScoreResult[];
  /**
   * The host skips while the round is running. Return a transition to handle it (e.g. end a
   * timed reveal with its scores); without one — or returning null — the engine drops the
   * round unscored.
   */
  onSkip?(state: State, ctx: RoundContext<Content, Settings>): Transition<State> | null;

  getHostView(state: State, ctx: RoundContext<Content, Settings>): HostView;
  getPlayerView(state: State, playerId: string, ctx: RoundContext<Content, Settings>): PlayerView;
}

/** A module with its type parameters erased, as registries hold them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any, any, any>;
