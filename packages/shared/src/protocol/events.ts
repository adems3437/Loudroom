import type { z } from 'zod';
import {
  gameEndEventSchema,
  gameStartRequestSchema,
  gameStateSchema,
  roundInputRequestSchema,
  roundPhaseEventSchema,
  roundResultEventSchema,
  roundStartEventSchema,
  roundStreamEventSchema,
  roundStreamRequestSchema,
  type RoundStreamRequest,
  scoreUpdateEventSchema,
} from '../game/game.js';
import {
  emptyRequestSchema,
  emptyResultSchema,
  playerJoinedEventSchema,
  playerLeftEventSchema,
  playerReadyRequestSchema,
  playerReconnectedEventSchema,
  playerUpdateRequestSchema,
  roomCreateRequestSchema,
  roomCreateResultSchema,
  roomJoinRequestSchema,
  roomJoinResultSchema,
  roomKickRequestSchema,
  roomLockRequestSchema,
  roomStateSchema,
  sessionErrorEventSchema,
} from '../room/room.js';
import type { Ack } from './ack.js';
import { timeSyncRequestSchema, timeSyncResponseSchema } from './time-sync.js';

/** Client → server commands. Every command is acknowledged with an {@link Ack}. */
export const ClientCommand = {
  TimeSync: 'time:sync',
  RoomCreate: 'room:create',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  RoomKick: 'room:kick',
  RoomLock: 'room:lock',
  PlayerReady: 'player:ready',
  PlayerUpdate: 'player:update',
  GameStart: 'game:start',
  GamePause: 'game:pause',
  GameResume: 'game:resume',
  GameSkip: 'game:skip',
  GameEnd: 'game:end',
  /** Host moves on from the result or scoreboard screen. */
  GameNext: 'game:next',
  /** Host starts over with the same players: back to the lobby, scores reset. */
  GameRestart: 'game:restart',
  RoundInput: 'round:input',
} as const;
export type ClientCommand = (typeof ClientCommand)[keyof typeof ClientCommand];

/**
 * Request and result schema per command. The server validates every request against it; the
 * client may validate results the same way.
 */
export const clientCommands = {
  [ClientCommand.TimeSync]: { request: timeSyncRequestSchema, result: timeSyncResponseSchema },
  [ClientCommand.RoomCreate]: { request: roomCreateRequestSchema, result: roomCreateResultSchema },
  [ClientCommand.RoomJoin]: { request: roomJoinRequestSchema, result: roomJoinResultSchema },
  [ClientCommand.RoomLeave]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.RoomKick]: { request: roomKickRequestSchema, result: emptyResultSchema },
  [ClientCommand.RoomLock]: { request: roomLockRequestSchema, result: emptyResultSchema },
  [ClientCommand.PlayerReady]: { request: playerReadyRequestSchema, result: emptyResultSchema },
  [ClientCommand.PlayerUpdate]: { request: playerUpdateRequestSchema, result: emptyResultSchema },
  [ClientCommand.GameStart]: { request: gameStartRequestSchema, result: emptyResultSchema },
  [ClientCommand.GamePause]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.GameResume]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.GameSkip]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.GameEnd]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.GameNext]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.GameRestart]: { request: emptyRequestSchema, result: emptyResultSchema },
  [ClientCommand.RoundInput]: { request: roundInputRequestSchema, result: emptyResultSchema },
} as const satisfies Record<ClientCommand, { request: z.ZodType; result: z.ZodType }>;

type Commands = typeof clientCommands;
/** What the client sends (before server-side normalization). */
export type CommandRequest<C extends ClientCommand> = z.input<Commands[C]['request']>;
/** What the server works with after validation and normalization. */
export type CommandInput<C extends ClientCommand> = z.output<Commands[C]['request']>;
export type CommandResult<C extends ClientCommand> = z.output<Commands[C]['result']>;

/**
 * Client → server events that are not commands: no ack, so high-frequency data does not wait
 * for round trips (SPEC §8 exception).
 */
export const ClientStream = {
  RoundStream: 'round:stream',
} as const;
export type ClientStream = (typeof ClientStream)[keyof typeof ClientStream];

export const clientStreams = {
  [ClientStream.RoundStream]: roundStreamRequestSchema,
} as const satisfies Record<ClientStream, z.ZodType>;

export type ClientToServerEvents = {
  [C in ClientCommand]: (
    payload: CommandRequest<C>,
    ack: (result: Ack<CommandResult<C>>) => void,
  ) => void;
} & {
  [ClientStream.RoundStream]: (payload: RoundStreamRequest) => void;
};

/** Server → client events. */
export const ServerEvent = {
  RoomState: 'room:state',
  PlayerJoined: 'player:joined',
  PlayerLeft: 'player:left',
  PlayerReconnected: 'player:reconnected',
  GameState: 'game:state',
  RoundStart: 'round:start',
  RoundPhase: 'round:phase',
  RoundResult: 'round:result',
  RoundStream: 'round:stream',
  ScoreUpdate: 'score:update',
  GameEnd: 'game:end',
  Error: 'error',
} as const;
export type ServerEvent = (typeof ServerEvent)[keyof typeof ServerEvent];

export const serverEventSchemas = {
  [ServerEvent.RoomState]: roomStateSchema,
  [ServerEvent.PlayerJoined]: playerJoinedEventSchema,
  [ServerEvent.PlayerLeft]: playerLeftEventSchema,
  [ServerEvent.PlayerReconnected]: playerReconnectedEventSchema,
  [ServerEvent.GameState]: gameStateSchema,
  [ServerEvent.RoundStart]: roundStartEventSchema,
  [ServerEvent.RoundPhase]: roundPhaseEventSchema,
  [ServerEvent.RoundResult]: roundResultEventSchema,
  [ServerEvent.RoundStream]: roundStreamEventSchema,
  [ServerEvent.ScoreUpdate]: scoreUpdateEventSchema,
  [ServerEvent.GameEnd]: gameEndEventSchema,
  [ServerEvent.Error]: sessionErrorEventSchema,
} as const satisfies Record<ServerEvent, z.ZodType>;

export type ServerEventPayload<E extends ServerEvent> = z.output<(typeof serverEventSchemas)[E]>;

export type ServerToClientEvents = {
  [E in ServerEvent]: (payload: ServerEventPayload<E>) => void;
};
