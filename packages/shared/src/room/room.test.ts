import { describe, expect, it } from 'vitest';
import {
  playerUpdateRequestSchema,
  roomCodeSchema,
  roomCreateRequestSchema,
  roomJoinRequestSchema,
  roomStateSchema,
} from './room.js';

describe('roomCodeSchema', () => {
  it.each(['100000', '583921', '999999'])('accepts %s', (code) => {
    expect(roomCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(['012345', '12345', '1234567', '12a456', ' 123456'])('rejects %j', (code) => {
    expect(roomCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('room commands', () => {
  it('bounds maxPlayers to 2–20', () => {
    expect(roomCreateRequestSchema.safeParse({ settings: { maxPlayers: 12 } }).success).toBe(true);
    expect(roomCreateRequestSchema.safeParse({ settings: { maxPlayers: 1 } }).success).toBe(false);
    expect(roomCreateRequestSchema.safeParse({ settings: { maxPlayers: 21 } }).success).toBe(false);
  });

  it('normalizes the nickname on join and rejects unknown avatars', () => {
    expect(
      roomJoinRequestSchema.parse({ roomCode: '583921', nickname: ' Ece​', avatar: 'star' }),
    ).toEqual({ roomCode: '583921', nickname: 'Ece', avatar: 'star' });
    expect(
      roomJoinRequestSchema.safeParse({ roomCode: '583921', nickname: 'Ece', avatar: 'mickey' })
        .success,
    ).toBe(false);
  });

  it('requires something to update', () => {
    expect(playerUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(playerUpdateRequestSchema.safeParse({ avatar: 'moon' }).success).toBe(true);
  });
});

describe('roomStateSchema', () => {
  const base = {
    version: 3,
    code: '583921',
    status: 'LOBBY',
    locked: false,
    settings: { maxPlayers: 12 },
    hostConnected: true,
    players: [],
  };

  it('only the host view carries the join link', () => {
    expect(
      roomStateSchema.safeParse({ ...base, role: 'host', joinUrl: 'http://x/play/583921' })
        .success,
    ).toBe(true);
    expect(
      roomStateSchema.safeParse({ ...base, role: 'player', joinUrl: 'http://x/play/583921' })
        .success,
    ).toBe(false);
  });

  it('rejects unexpected player fields such as session secrets', () => {
    const player = {
      id: '0199a0b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b',
      nickname: 'Ece',
      avatar: 'star',
      color: '#ff5d5d',
      score: 0,
      ready: false,
      connected: true,
      joinedAt: 1,
    };
    expect(roomStateSchema.safeParse({ ...base, role: 'player', players: [player] }).success).toBe(
      true,
    );
    expect(
      roomStateSchema.safeParse({
        ...base,
        role: 'player',
        players: [{ ...player, sessionTokenHash: 'x' }],
      }).success,
    ).toBe(false);
  });
});
