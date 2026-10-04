import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  HOST_INPUT_SENDER,
  type AnyGameModule,
  type Effect,
  type InputRejectCode,
} from '@loudroom/game-sdk';
import { ServerEvent, type GameStatus } from '@loudroom/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ProfanityFilter } from '../moderation/profanity-filter.js';
import { CommandError } from '../realtime/command-error.js';
import { PresenceService } from '../room/presence.service.js';
import { RoomBroadcaster, type GameNotice } from '../room/room.broadcaster.js';
import { RoomService } from '../room/room.service.js';
import type { RoomSnapshot, StoredPlayer, StoredRoom } from '../room/room.store.js';
import { currentRound, moduleFor, publicClock, roundContext, statsOf } from './game.context.js';
import type { GameRecord, PlannedRound } from './game.record.js';
import { standingsOf } from './game.views.js';
import { GameTimers } from './game-timers.js';
import { PackLoader, type GamePlan } from './pack-loader.js';
import { SessionRecorder } from './session-recorder.js';
import { StreamStore } from './stream.store.js';

const logger = new Logger('GameEngine');

/** States in which a game is actively running (and can be paused). */
const RUNNING: readonly GameStatus[] = ['STARTING', 'PLAYING', 'ROUND_RESULT', 'SCOREBOARD'];

/** A room being changed by one engine step, plus what to do once the change is saved. */
interface Draft {
  room: StoredRoom;
  players: StoredPlayer[];
  game: GameRecord | null;
  now: number;
  notices: GameNotice[];
  /** Side effects after commit (history writes, presence timers). */
  after: (() => void)[];
}

function newToken(): string {
  return randomBytes(6).toString('hex');
}

function requireGame(draft: Draft): GameRecord {
  if (!draft.game) throw new CommandError('INVALID_STATE', 'No game is running');
  return draft.game;
}

/**
 * The game engine (SPEC §3, §5): owns the room's game state machine, the clock and scoring.
 * Modules decide what happens inside a round; the engine runs everything around it.
 * Every step runs under the room lock, then timers, history and broadcasts follow the commit.
 */
@Injectable()
export class GameEngine implements OnApplicationBootstrap {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rooms: RoomService,
    private readonly packs: PackLoader,
    private readonly recorder: SessionRecorder,
    private readonly timers: GameTimers,
    private readonly broadcaster: RoomBroadcaster,
    private readonly presence: PresenceService,
    private readonly profanity: ProfanityFilter,
    private readonly streams: StreamStore,
  ) {}

  /** A round's stream history ends with it: cleared when the next round starts or the game ends. */
  private clearStream(draft: Draft): void {
    const code = draft.room.code;
    draft.after.push(() => {
      this.streams.clear(code).catch((error: unknown) => {
        logger.warn(
          `stream not cleared: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }

  /** Player text goes through the same blocked-word lists as nicknames (SPEC §7.6, §9). */
  private readonly moderation = { isBlocked: (text: string) => this.profanity.isProfane(text) };

  private context(game: GameRecord, round: PlannedRound, draft: Draft) {
    return roundContext(game, round, draft.players, draft.now, this.moderation);
  }

  // ── Host commands ─────────────────────────────────────────────────────────

  async start(code: string, packId?: string): Promise<void> {
    const plan = await this.packs.plan(packId);
    await this.step(code, (draft) => {
      this.startGame(draft, plan);
    });
  }

  next(code: string): Promise<void> {
    return this.step(code, (draft) => {
      this.advance(draft);
    });
  }

  skip(code: string): Promise<void> {
    return this.step(code, (draft) => {
      const game = requireGame(draft);
      switch (draft.room.status) {
        case 'STARTING':
          this.beginRound(draft, game, 0);
          return;
        case 'PLAYING': {
          // A module may handle the skip itself (e.g. end a timed reveal with its scores).
          const round = currentRound(game);
          const module = round ? moduleFor(round) : null;
          const handled =
            round && module?.onSkip
              ? module.onSkip(game.moduleState, this.context(game, round, draft))
              : null;
          if (round && module && handled) {
            game.moduleState = handled.state;
            game.timer = null;
            this.applyEffects(draft, game, module, round, handled.effects);
            return;
          }
          // Otherwise the round is dropped without scoring.
          if (this.isLastRound(game)) this.finishGame(draft, game);
          else this.beginRound(draft, game, game.roundIndex + 1);
          return;
        }
        case 'ROUND_RESULT':
        case 'SCOREBOARD':
          this.advance(draft);
          return;
        default:
          throw new CommandError('INVALID_STATE', 'Nothing to skip');
      }
    });
  }

  end(code: string): Promise<void> {
    return this.step(code, (draft) => {
      const game = requireGame(draft);
      if (draft.room.status === 'LOBBY' || draft.room.status === 'FINISHED') {
        throw new CommandError('INVALID_STATE', 'No game is running');
      }
      this.finishGame(draft, game);
    });
  }

  pause(code: string): Promise<void> {
    return this.step(code, (draft) => {
      if (!RUNNING.includes(draft.room.status as GameStatus)) {
        throw new CommandError('INVALID_STATE', 'Nothing to pause');
      }
      this.pauseGame(draft, requireGame(draft));
    });
  }

  resume(code: string): Promise<void> {
    return this.step(code, (draft) => {
      const game = requireGame(draft);
      if (draft.room.status !== 'PAUSED' || !game.paused) {
        throw new CommandError('INVALID_STATE', 'The game is not paused');
      }
      this.resumeGame(draft, game);
    });
  }

  /** After the podium: same players back in the lobby, scores reset. */
  restart(code: string): Promise<void> {
    return this.step(code, (draft) => {
      if (draft.room.status !== 'FINISHED') {
        throw new CommandError('INVALID_STATE', 'The game has not finished');
      }
      draft.room.status = 'LOBBY';
      draft.game = null;
      draft.players = draft.players.map((player) => ({ ...player, score: 0, ready: false }));
      // Back in the lobby the reconnect grace period applies again (SPEC §4).
      const offline = draft.players.filter((player) => !player.connected);
      draft.after.push(() => {
        for (const player of offline) this.presence.scheduleExpiry(code, player.id);
      });
    });
  }

  // ── Player input, host presence, timers ───────────────────────────────────

  input(code: string, playerId: string, roundId: string, raw: unknown): Promise<void> {
    return this.step(code, (draft) => {
      const game = requireGame(draft);
      const round = currentRound(game);
      if (draft.room.status !== 'PLAYING' || !round) {
        throw new CommandError('ROUND_CLOSED', 'Not accepting answers now');
      }
      if (round.roundId !== roundId) throw new CommandError('STALE_ROUND', 'That round is over');
      const module = moduleFor(round);
      const input = module.inputSchema.safeParse(raw);
      if (!input.success) throw new CommandError('INVALID_INPUT', 'Invalid answer');

      const ctx = this.context(game, round, draft);
      const transition = module.onInput(
        game.moduleState,
        input.data,
        { playerId, receivedAt: draft.now },
        ctx,
      );
      const rejected = transition.effects?.find(
        (effect): effect is Extract<Effect, { type: 'reject' }> =>
          effect.type === 'reject' && effect.playerId === playerId,
      );
      // A rejected input changes nothing; throwing discards the step.
      if (rejected)
        throw new CommandError(rejected.code satisfies InputRejectCode, 'Input refused');
      game.moduleState = transition.state;
      this.applyEffects(draft, game, module, round, transition.effects);
    });
  }

  /** The host screen's input to the current round, for games that take one. */
  hostInput(code: string, roundId: string, raw: unknown): Promise<void> {
    return this.step(code, (draft) => {
      const game = requireGame(draft);
      const round = currentRound(game);
      if (draft.room.status !== 'PLAYING' || !round) {
        throw new CommandError('ROUND_CLOSED', 'The round is not running');
      }
      if (round.roundId !== roundId) throw new CommandError('STALE_ROUND', 'That round is over');
      const module = moduleFor(round);
      if (!module.hostInputSchema || !module.onHostInput) {
        throw new CommandError('INVALID_INPUT', 'This game takes no host input');
      }
      const input = module.hostInputSchema.safeParse(raw);
      if (!input.success) throw new CommandError('INVALID_INPUT', 'Invalid host input');

      const transition = module.onHostInput(
        game.moduleState,
        input.data,
        this.context(game, round, draft),
      );
      const rejected = transition.effects?.find(
        (effect): effect is Extract<Effect, { type: 'reject' }> =>
          effect.type === 'reject' && effect.playerId === HOST_INPUT_SENDER,
      );
      if (rejected) {
        throw new CommandError(rejected.code satisfies InputRejectCode, 'Host input refused');
      }
      game.moduleState = transition.state;
      this.applyEffects(draft, game, module, round, transition.effects);
    });
  }

  /** The host's last connection dropped: pause a running game (SPEC §4). */
  async pauseIfRunning(code: string): Promise<void> {
    await this.step(code, (draft) => {
      if (!RUNNING.includes(draft.room.status as GameStatus) || !draft.game) return false;
      this.pauseGame(draft, draft.game);
      return true;
    });
  }

  /**
   * After a restart nobody is connected — the host neither — so running games are paused with
   * their remaining time; the host resumes them on return.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const code of await this.rooms.listRoomCodes()) await this.pauseIfRunning(code);
    } catch (error) {
      logger.warn(
        `Game recovery skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private onTimer(code: string, token: string): void {
    this.step(code, (draft) => {
      const game = draft.game;
      if (game?.timer?.token !== token) return false; // stale or cancelled
      game.timer = null;
      if (draft.room.status === 'STARTING') {
        this.beginRound(draft, game, 0);
        return true;
      }
      const round = currentRound(game);
      if (draft.room.status !== 'PLAYING' || !round) return false;
      const module = moduleFor(round);
      const transition = module.onTimer(game.moduleState, this.context(game, round, draft));
      game.moduleState = transition.state;
      this.applyEffects(draft, game, module, round, transition.effects);
      return true;
    }).catch((error: unknown) => {
      if (!(error instanceof CommandError)) logger.error(error);
    });
  }

  // ── State machine ─────────────────────────────────────────────────────────

  private startGame(draft: Draft, plan: GamePlan): void {
    if (draft.room.status !== 'LOBBY') {
      throw new CommandError('INVALID_STATE', 'A game is already running');
    }
    const connected = draft.players.filter((player) => player.connected).length;
    if (connected < plan.minPlayers) {
      throw new CommandError('NOT_ENOUGH_PLAYERS', `At least ${plan.minPlayers} players needed`);
    }
    const { startingMs } = this.config.game;
    const endsAt = draft.now + startingMs;
    const game: GameRecord = {
      sessionId: randomUUID(),
      packId: plan.packId,
      packName: plan.packName,
      rounds: plan.rounds,
      roundIndex: -1,
      moduleState: null,
      phase: null,
      countdown: { name: 'STARTING', durationMs: startingMs, endsAt },
      timer: { token: newToken(), firesAt: endsAt },
      paused: null,
      stats: {},
      lastResults: [],
      roundStartedAt: null,
      startedAt: draft.now,
    };
    draft.game = game;
    draft.room.status = 'STARTING';
    draft.players = draft.players.map((player) => ({ ...player, score: 0, ready: false }));

    const players = draft.players;
    draft.after.push(() => {
      this.recorder.startSession({
        sessionId: game.sessionId,
        roomCode: draft.room.code,
        packId: plan.packId,
        packSnapshot: plan.packSnapshot,
        startedAt: game.startedAt,
        players,
      });
    });
  }

  private beginRound(draft: Draft, game: GameRecord, index: number): void {
    const round = game.rounds[index];
    if (!round) throw new Error(`No round ${index}`);
    game.roundIndex = index;
    game.countdown = null;
    game.phase = null;
    game.timer = null;
    game.lastResults = [];
    game.roundStartedAt = draft.now;
    draft.room.status = 'PLAYING';
    this.clearStream(draft);

    const module = moduleFor(round);
    const transition = module.createRound(this.context(game, round, draft));
    game.moduleState = transition.state;
    draft.notices.push({
      event: ServerEvent.RoundStart,
      payload: {
        roundId: round.roundId,
        roundIndex: index,
        roundCount: game.rounds.length,
        gameType: round.gameType,
      },
    });
    this.applyEffects(draft, game, module, round, transition.effects);
  }

  private applyEffects(
    draft: Draft,
    game: GameRecord,
    module: AnyGameModule,
    round: PlannedRound,
    effects: Effect[] | undefined,
  ): void {
    for (const effect of effects ?? []) {
      if (effect.type === 'phase') {
        const endsAt = effect.durationMs === null ? null : draft.now + effect.durationMs;
        game.phase = {
          name: effect.phase,
          durationMs: effect.durationMs,
          endsAt,
          ...(effect.hidden ? { hidden: true } : {}),
        };
        game.timer =
          endsAt === null
            ? null
            : { token: newToken(), firesAt: endsAt + this.config.game.inputGraceMs };
        draft.notices.push({
          event: ServerEvent.RoundPhase,
          payload: { roundId: round.roundId, phase: publicClock(game.phase) },
        });
      } else if (effect.type === 'endRound') {
        this.finishRound(draft, game, module, round);
      }
    }
  }

  private finishRound(
    draft: Draft,
    game: GameRecord,
    module: AnyGameModule,
    round: PlannedRound,
  ): void {
    const ctx = this.context(game, round, draft);
    const results = module.score(game.moduleState, ctx);
    const byPlayer = new Map(results.map((result) => [result.playerId, result]));

    for (const player of draft.players) {
      const result = byPlayer.get(player.id);
      const stats = statsOf(game, player.id);
      const points = result?.points ?? 0;
      game.stats[player.id] = {
        score: stats.score + points,
        streak: result?.correct === true ? stats.streak + 1 : 0,
        correctCount: stats.correctCount + (result?.correct === true ? 1 : 0),
        // Unanswered rounds count as the full time so they never win a tie-break.
        totalAnswerMs:
          stats.totalAnswerMs + (result?.responseTimeMs ?? game.phase?.durationMs ?? 0),
      };
    }
    draft.players = draft.players.map((player) => ({
      ...player,
      score: statsOf(game, player.id).score,
    }));
    game.lastResults = results.map((result) => ({
      playerId: result.playerId,
      points: result.points,
      correct: result.correct,
    }));
    game.timer = null;
    draft.room.status = 'ROUND_RESULT';

    draft.notices.push(
      {
        event: ServerEvent.RoundResult,
        payload: { roundId: round.roundId, results: game.lastResults },
      },
      { event: ServerEvent.ScoreUpdate, payload: { standings: standingsOf(this.snapshot(draft)) } },
    );
    const record = {
      sessionId: game.sessionId,
      roundIndex: game.roundIndex,
      gameType: round.gameType,
      contentItemId: round.contentItemId,
      content: round.content,
      startedAt: game.roundStartedAt ?? draft.now,
      endedAt: draft.now,
      results,
    };
    draft.after.push(() => {
      this.recorder.recordRound(record);
    });
  }

  /** Host's "next": result → scoreboard (if shown) → next round, or the podium after the last. */
  private advance(draft: Draft): void {
    const game = requireGame(draft);
    const round = currentRound(game);
    if (draft.room.status === 'ROUND_RESULT' && round) {
      if (this.isLastRound(game)) {
        this.finishGame(draft, game);
      } else if (round.showScoreboardAfter || round.lastInSegment) {
        draft.room.status = 'SCOREBOARD';
      } else {
        this.beginRound(draft, game, game.roundIndex + 1);
      }
      return;
    }
    if (draft.room.status === 'SCOREBOARD') {
      this.beginRound(draft, game, game.roundIndex + 1);
      return;
    }
    throw new CommandError('INVALID_STATE', 'Nothing to move on from');
  }

  private finishGame(draft: Draft, game: GameRecord): void {
    draft.room.status = 'FINISHED';
    this.clearStream(draft);
    game.timer = null;
    game.countdown = null;
    game.paused = null;
    const standings = standingsOf(this.snapshot(draft));
    draft.notices.push({ event: ServerEvent.GameEnd, payload: { standings } });
    draft.after.push(() => {
      this.recorder.finishSession({ sessionId: game.sessionId, endedAt: draft.now, standings });
    });
  }

  private pauseGame(draft: Draft, game: GameRecord): void {
    const status = draft.room.status as GameStatus;
    const clock = status === 'STARTING' ? game.countdown : game.phase;
    const remainingMs =
      game.timer && clock?.endsAt != null ? Math.max(0, clock.endsAt - draft.now) : null;
    game.paused = { resumeStatus: status, remainingMs };
    game.timer = null;
    draft.room.status = 'PAUSED';
  }

  private resumeGame(draft: Draft, game: GameRecord): void {
    const { resumeStatus, remainingMs } = game.paused ?? {
      resumeStatus: 'PLAYING',
      remainingMs: null,
    };
    draft.room.status = resumeStatus;
    game.paused = null;
    if (remainingMs === null) return;

    // The clock continues where it stopped: the pause does not eat answering time.
    const endsAt = draft.now + remainingMs;
    if (resumeStatus === 'STARTING' && game.countdown) {
      game.countdown = { ...game.countdown, endsAt };
      game.timer = { token: newToken(), firesAt: endsAt };
      return;
    }
    const round = currentRound(game);
    if (game.phase && round) {
      game.phase = { ...game.phase, endsAt };
      game.timer = { token: newToken(), firesAt: endsAt + this.config.game.inputGraceMs };
      draft.notices.push({
        event: ServerEvent.RoundPhase,
        payload: { roundId: round.roundId, phase: publicClock(game.phase) },
      });
    }
  }

  private isLastRound(game: GameRecord): boolean {
    return game.roundIndex >= game.rounds.length - 1;
  }

  private snapshot(draft: Draft): RoomSnapshot {
    return { room: draft.room, players: draft.players, game: draft.game };
  }

  /**
   * Runs one engine step under the room lock. A step returning `false` changed nothing;
   * throwing a CommandError aborts it and becomes the command's error ack.
   */
  private async step(code: string, change: (draft: Draft) => boolean | undefined): Promise<void> {
    let draft: Draft | undefined;
    const outcome = await this.rooms.transactIfNeeded(code, (snapshot) => {
      draft = {
        room: { ...snapshot.room },
        players: snapshot.players.map((player) => ({ ...player })),
        game: snapshot.game ? structuredClone(snapshot.game) : null,
        now: Date.now(),
        notices: [],
        after: [],
      };
      if (change(draft) === false) return null;
      return {
        next: { room: draft.room, players: draft.players, game: draft.game },
        result: {},
      };
    });
    if (!outcome || !draft) return;

    this.timers.set(code, outcome.snapshot.game?.timer ?? null, (token) => {
      this.onTimer(code, token);
    });
    for (const effect of draft.after) effect();
    this.broadcaster.state(outcome.snapshot);
    this.broadcaster.notices(code, draft.notices);
  }
}
