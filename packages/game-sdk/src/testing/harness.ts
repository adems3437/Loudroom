import type {
  AnyGameModule,
  Effect,
  GamePlayer,
  PhaseClock,
  PlayerStats,
  RoundContext,
  ScoreResult,
} from '../module.js';
import { createRandom } from '../rng.js';

export type ScriptStep =
  /** Let the current phase run out. */
  | { type: 'timer' }
  /** A player sends an input, `afterMs` after the previous step. */
  | { type: 'input'; playerId: string; input: unknown; afterMs?: number };

export interface RoundFixture {
  content: unknown;
  settings?: Record<string, unknown>;
  players: GamePlayer[];
  stats?: Record<string, PlayerStats>;
  scoreMultiplier?: number;
  /** Steps that play one full round until the module ends it. */
  script: ScriptStep[];
}

export interface Frame {
  phase: string | null;
  ended: boolean;
  hostView: unknown;
  playerViews: Record<string, unknown>;
}

export interface PlayedRound {
  frames: Frame[];
  results: ScoreResult[] | null;
  rejects: Extract<Effect, { type: 'reject' }>[];
}

const START_TIME = 1_700_000_000_000;
export const FIXTURE_SEED = 42;

function zeroStats(): PlayerStats {
  return { score: 0, streak: 0, correctCount: 0, totalAnswerMs: 0 };
}

/**
 * Plays a round the way the engine would — phase clocks, timers, inputs — and records what
 * every client would have been shown after each step.
 */
export function playRound(
  module: AnyGameModule,
  fixture: RoundFixture,
  options: { untilFirstInput?: boolean } = {},
): PlayedRound & { state: unknown; context: () => RoundContext<unknown, unknown> } {
  let now = START_TIME;
  let phase: PhaseClock | null = null;
  let ended = false;
  const rejects: PlayedRound['rejects'] = [];
  const frames: Frame[] = [];
  const settings: unknown = module.settingsSchema.parse({
    ...module.defaultSettings,
    ...fixture.settings,
  });
  const stats = Object.fromEntries(
    fixture.players.map((player) => [player.id, fixture.stats?.[player.id] ?? zeroStats()]),
  );

  const context = (): RoundContext<unknown, unknown> => ({
    roundId: 'round-1',
    roundIndex: 0,
    content: fixture.content,
    settings,
    scoreMultiplier: fixture.scoreMultiplier ?? 1,
    players: fixture.players,
    stats,
    phase,
    now,
    random: createRandom(FIXTURE_SEED),
  });

  const apply = (effects: Effect[] | undefined) => {
    for (const effect of effects ?? []) {
      if (effect.type === 'phase') {
        phase = {
          name: effect.phase,
          durationMs: effect.durationMs,
          endsAt: effect.durationMs === null ? null : now + effect.durationMs,
        };
      } else if (effect.type === 'endRound') {
        ended = true;
      } else {
        rejects.push(effect);
      }
    }
  };

  const capture = (state: unknown) => {
    const ctx = context();
    frames.push({
      phase: phase?.name ?? null,
      ended,
      hostView: module.getHostView(state, ctx),
      playerViews: Object.fromEntries(
        fixture.players.map((player) => [player.id, module.getPlayerView(state, player.id, ctx)]),
      ),
    });
  };

  // Getters keep TypeScript from narrowing these (they are reassigned inside `apply`).
  const currentPhase = (): PhaseClock | null => phase;
  const hasEnded = (): boolean => ended;

  const created = module.createRound(context());
  let state: unknown = created.state;
  apply(created.effects);
  capture(state);

  for (const step of fixture.script) {
    if (hasEnded()) break;
    if (step.type === 'timer') {
      const current = currentPhase();
      if (current?.endsAt == null) throw new Error('script: timer step without a running phase');
      now = current.endsAt;
      const next = module.onTimer(state, context());
      state = next.state;
      apply(next.effects);
    } else {
      if (options.untilFirstInput) break;
      now += step.afterMs ?? 0;
      const input: unknown = module.inputSchema.parse(step.input);
      const next = module.onInput(
        state,
        input,
        { playerId: step.playerId, receivedAt: now },
        context(),
      );
      state = next.state;
      apply(next.effects);
    }
    capture(state);
  }

  return {
    frames,
    rejects,
    results: hasEnded() ? module.score(state, context()) : null,
    state,
    context,
  };
}
