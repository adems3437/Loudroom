import { Injectable } from '@nestjs/common';
import {
  ROUND_STREAM_MAX_CHUNKS,
  type RoundStreamEvent,
  type RoundStreamRequest,
} from '@loudroom/shared';
import { RoomBroadcaster } from '../room/room.broadcaster.js';
import { RoomStore } from '../room/room.store.js';
import type { Session } from '../realtime/socket-types.js';
import { currentRound, moduleFor, NO_MODERATION_IN_VIEWS, roundContext } from './game.context.js';
import { StreamStore } from './stream.store.js';

/** Statuses in which a round is on screen, so its stream history matters. */
const ROUND_ON_SCREEN = new Set(['PLAYING', 'ROUND_RESULT', 'PAUSED']);

export type StreamOutcome = 'stored' | 'dropped' | 'full';

/**
 * The `round:stream` channel (SPEC §5): chunks from a player are checked against the game's
 * stream spec, kept as the round's history and passed on live to the host only. It reads the
 * room without the room lock — a chunk never changes the game state — and chunks carry their
 * round id, so one that races a round change is simply dropped.
 */
@Injectable()
export class GameStreamService {
  /** Rounds whose sender was already told the stream is full (one notice per round). */
  private readonly toldFull = new Set<string>();

  constructor(
    private readonly rooms: RoomStore,
    private readonly streams: StreamStore,
    private readonly broadcaster: RoomBroadcaster,
  ) {}

  async push(
    code: string,
    playerId: string,
    socketId: string,
    request: RoundStreamRequest,
  ): Promise<StreamOutcome> {
    const snapshot = await this.rooms.load(code);
    const game = snapshot?.game;
    if (!snapshot || !game || snapshot.room.status !== 'PLAYING') return 'dropped';
    const round = currentRound(game);
    if (round?.roundId !== request.roundId) return 'dropped';
    const spec = moduleFor(round).stream;
    if (!spec) return 'dropped';
    const chunk = spec.schema.safeParse(request.chunk);
    if (!chunk.success) return 'dropped';
    const ctx = roundContext(game, round, snapshot.players, Date.now(), NO_MODERATION_IN_VIEWS);
    if (!spec.accepts(game.moduleState, playerId, ctx)) return 'dropped';

    const stored = await this.streams.append(
      code,
      round.roundId,
      chunk.data,
      spec.cost(chunk.data),
      spec.limits,
    );
    if (!stored) {
      const key = `${code}:${round.roundId}`;
      if (!this.toldFull.has(key)) {
        if (this.toldFull.size > 1_000) this.toldFull.clear();
        this.toldFull.add(key);
        this.broadcaster.streamTo(socketId, {
          roundId: round.roundId,
          reset: false,
          chunks: [],
          full: true,
        });
      }
      return 'full';
    }
    this.broadcaster.streamToHost(code, {
      roundId: round.roundId,
      reset: false,
      chunks: [chunk.data],
      full: false,
    });
    return 'stored';
  }

  /**
   * After a (re)connect: the round's whole history, to the host and to a player who may
   * stream now (the drawer gets their canvas back after a reload).
   */
  async sendHistory(socketId: string, session: Session): Promise<void> {
    const snapshot = await this.rooms.load(session.roomCode);
    const game = snapshot?.game;
    if (!snapshot || !game || !ROUND_ON_SCREEN.has(snapshot.room.status)) return;
    const round = currentRound(game);
    const spec = round ? moduleFor(round).stream : undefined;
    if (!round || !spec || game.moduleState == null) return;
    if (session.role === 'player') {
      const ctx = roundContext(game, round, snapshot.players, Date.now(), NO_MODERATION_IN_VIEWS);
      if (!spec.accepts(game.moduleState, session.playerId, ctx)) return;
    }
    const chunks = await this.streams.history(session.roomCode, round.roundId);
    const event: RoundStreamEvent = {
      roundId: round.roundId,
      reset: true,
      chunks: chunks.slice(-ROUND_STREAM_MAX_CHUNKS),
      full: false,
    };
    this.broadcaster.streamTo(socketId, event);
  }
}
