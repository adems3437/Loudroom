import { z } from 'zod';
import { nicknameSchema } from './nickname.js';

/** Six digits without a leading zero (100000–999999), so codes are never misread. */
export const ROOM_CODE_PATTERN = /^[1-9]\d{5}$/;
export const roomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
export type RoomCode = z.infer<typeof roomCodeSchema>;

/**
 * Room lifecycle (SPEC §4): LOBBY → STARTING → PLAYING → ROUND_RESULT → SCOREBOARD → … →
 * FINISHED, plus PAUSED from any in-game state.
 */
export const roomStatusSchema = z.enum([
  'LOBBY',
  'STARTING',
  'PLAYING',
  'ROUND_RESULT',
  'SCOREBOARD',
  'FINISHED',
  'PAUSED',
]);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

/** Whether players may join a game already in progress, and how (SPEC §4). */
export const lateJoinSchema = z.enum(['closed', 'zeroPoints']);
export type LateJoin = z.infer<typeof lateJoinSchema>;

export const MIN_PLAYERS_LIMIT = 2;
export const MAX_PLAYERS_LIMIT = 20;
export const DEFAULT_MAX_PLAYERS = 12;

export const roomSettingsSchema = z.strictObject({
  maxPlayers: z.number().int().min(MIN_PLAYERS_LIMIT).max(MAX_PLAYERS_LIMIT),
  lateJoin: lateJoinSchema.default('closed'),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

/** Our own SVG avatar set (no copyrighted characters). Rendered by the web app. */
export const AVATAR_IDS = [
  'circle',
  'square',
  'triangle',
  'hexagon',
  'star',
  'drop',
  'cloud',
  'diamond',
  'pill',
  'flower',
  'ghost',
  'moon',
] as const;
export const avatarIdSchema = z.enum(AVATAR_IDS);
export type AvatarId = z.infer<typeof avatarIdSchema>;

/** Player colors, assigned by the server so they stay distinct within a room. */
export const PLAYER_COLORS = [
  '#ff5d5d',
  '#ff9f1c',
  '#ffd23f',
  '#7bd389',
  '#2ec4b6',
  '#3a86ff',
  '#8f5bff',
  '#ff4fa3',
  '#b8e04a',
  '#5bd5f0',
  '#c49a6c',
  '#e2e2f0',
] as const;
export const playerColorSchema = z.enum(PLAYER_COLORS);

export const playerIdSchema = z.uuid();

/** What every room member may see about a player. Never includes session secrets. */
export const publicPlayerSchema = z.strictObject({
  id: playerIdSchema,
  nickname: z.string(),
  avatar: avatarIdSchema,
  color: playerColorSchema,
  score: z.number().int(),
  ready: z.boolean(),
  connected: z.boolean(),
  joinedAt: z.number(),
});
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;

const roomStateBase = {
  /** Increases with every change; clients ignore states older than the one they have. */
  version: z.number().int().nonnegative(),
  code: roomCodeSchema,
  status: roomStatusSchema,
  locked: z.boolean(),
  settings: roomSettingsSchema,
  hostConnected: z.boolean(),
  players: z.array(publicPlayerSchema),
};

/** Room snapshot per viewer role. Only the host view carries the join link. */
export const roomStateSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.literal('host'), joinUrl: z.url(), ...roomStateBase }),
  z.strictObject({ role: z.literal('player'), ...roomStateBase }),
]);
export type RoomState = z.infer<typeof roomStateSchema>;
export type HostRoomState = Extract<RoomState, { role: 'host' }>;
export type PlayerRoomState = Extract<RoomState, { role: 'player' }>;

export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// ── Commands ────────────────────────────────────────────────────────────────

export const roomCreateRequestSchema = z.strictObject({ settings: roomSettingsSchema });
export const roomCreateResultSchema = z.strictObject({
  roomCode: roomCodeSchema,
  hostToken: sessionTokenSchema,
  joinUrl: z.url(),
});

export const roomJoinRequestSchema = z.strictObject({
  roomCode: roomCodeSchema,
  nickname: nicknameSchema,
  avatar: avatarIdSchema,
});
export const roomJoinResultSchema = z.strictObject({
  roomCode: roomCodeSchema,
  playerId: playerIdSchema,
  playerToken: sessionTokenSchema,
});

export const emptyRequestSchema = z.strictObject({});
export const emptyResultSchema = z.strictObject({});

export const roomKickRequestSchema = z.strictObject({ playerId: playerIdSchema });
export const roomLockRequestSchema = z.strictObject({ locked: z.boolean() });
export const playerReadyRequestSchema = z.strictObject({ ready: z.boolean() });
export const playerUpdateRequestSchema = z
  .strictObject({ nickname: nicknameSchema.optional(), avatar: avatarIdSchema.optional() })
  .refine((value) => value.nickname !== undefined || value.avatar !== undefined, {
    message: 'Nothing to update',
  });

// ── Server events ───────────────────────────────────────────────────────────

export const playerJoinedEventSchema = z.strictObject({ player: publicPlayerSchema });
export const playerLeftEventSchema = z.strictObject({
  playerId: playerIdSchema,
  nickname: z.string(),
  reason: z.enum(['left', 'kicked', 'timeout']),
});
export const playerReconnectedEventSchema = z.strictObject({ playerId: playerIdSchema });

/** Why the server ended this connection's session. */
export const sessionErrorCodeSchema = z.enum(['KICKED', 'SESSION_REPLACED', 'SESSION_EXPIRED']);
export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;
export const sessionErrorEventSchema = z.strictObject({
  code: sessionErrorCodeSchema,
  message: z.string(),
});

/**
 * Handshake `auth` payload: the session to resume on (re)connect, if any. Deliberately loose:
 * an unknown or malformed token is answered with SESSION_EXPIRED so the client drops it.
 */
export const handshakeAuthSchema = z.object({ token: z.string().max(128).optional() });
