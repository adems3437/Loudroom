import { ClientCommand } from '@loudroom/shared';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config/app-config.js';
import {
  connect,
  connectRefused,
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestAppOptions,
  type TestSocket,
} from './support.js';

describe('room security', () => {
  let testApp: TestApp | undefined;
  const sockets: TestSocket[] = [];

  async function start(options?: TestAppOptions): Promise<TestApp> {
    testApp = await startTestApp(options);
    return testApp;
  }

  async function client(url: string, token?: string): Promise<TestSocket> {
    const socket = await connect(url, token);
    sockets.push(socket);
    return socket;
  }

  beforeEach(async () => {
    await resetRedis();
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await testApp?.app.close();
    testApp = undefined;
  });

  it('never sends session secrets or internal fields to any client', async () => {
    const { url } = await start();
    const received: unknown[] = [];
    const record = (socket: TestSocket) => {
      (socket as unknown as Socket).onAny((_event: string, payload: unknown) => {
        received.push(payload);
      });
    };

    const host = await client(url);
    record(host);
    const created = await sendOk(host, ClientCommand.RoomCreate, { settings: { maxPlayers: 12 } });
    const players = await Promise.all([client(url), client(url)]);
    players.forEach(record);
    const joined = await Promise.all(
      players.map((socket, index) =>
        sendOk(socket, ClientCommand.RoomJoin, {
          roomCode: created.roomCode,
          nickname: `Oyuncu ${index}`,
          avatar: 'diamond',
        }),
      ),
    );
    const [first] = players;
    const second = joined[1];
    if (!second) throw new Error('second player did not join');
    await sendOk(first, ClientCommand.PlayerReady, { ready: true });
    await sendOk(host, ClientCommand.RoomKick, { playerId: second.playerId });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const everything = JSON.stringify(received);
    expect(received.length).toBeGreaterThan(5);
    expect(everything).not.toContain(created.hostToken);
    for (const { playerToken } of joined) expect(everything).not.toContain(playerToken);
    expect(everything).not.toMatch(/token|hash|nicknameKey|lastSeenAt/i);
  });

  it('only lets the host run host commands and players run player commands', async () => {
    const { url } = await start();
    const host = await client(url);
    const created = await sendOk(host, ClientCommand.RoomCreate, { settings: { maxPlayers: 12 } });
    const player = await client(url);
    const joined = await sendOk(player, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname: 'Ece',
      avatar: 'star',
    });
    const outsider = await client(url);

    expect(await send(player, ClientCommand.RoomKick, { playerId: joined.playerId })).toMatchObject(
      {
        ok: false,
        code: 'FORBIDDEN',
      },
    );
    expect(await send(player, ClientCommand.RoomLock, { locked: true })).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await send(host, ClientCommand.PlayerReady, { ready: true })).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await send(outsider, ClientCommand.RoomLock, { locked: true })).toMatchObject({
      code: 'NOT_IN_ROOM',
    });
    expect(
      await send(player, ClientCommand.RoomJoin, {
        roomCode: created.roomCode,
        nickname: 'Ece 2',
        avatar: 'star',
      }),
    ).toMatchObject({ code: 'ALREADY_IN_ROOM' });
  });

  it('answers unknown, malformed and expired tokens with SESSION_EXPIRED', async () => {
    const { url } = await start();
    for (const token of ['A'.repeat(43), 'not a token']) {
      const { socket, error } = await connectRefused(url, token);
      sockets.push(socket);
      expect(error).toMatchObject({ code: 'SESSION_EXPIRED' });
    }
  });

  it('blocks room code guessing after 10 failed joins per IP, without counting successes', async () => {
    const { url } = await start();
    const host = await client(url);
    const created = await sendOk(host, ClientCommand.RoomCreate, { settings: { maxPlayers: 20 } });

    // Successful joins from the same address (a party behind one NAT) never count.
    for (let i = 0; i < 15; i++) {
      await sendOk(await client(url), ClientCommand.RoomJoin, {
        roomCode: created.roomCode,
        nickname: `Misafir ${i}`,
        avatar: 'cloud',
      });
    }

    const guesser = await client(url);
    const unusedCode = created.roomCode === '100000' ? '100001' : '100000';
    for (let i = 0; i < DEFAULT_RATE_LIMITS.joinFailure.capacity; i++) {
      expect(
        await send(guesser, ClientCommand.RoomJoin, {
          roomCode: unusedCode,
          nickname: 'Tahminci',
          avatar: 'moon',
        }),
      ).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    }
    // Now even the correct code is refused, with no hint whether it exists.
    expect(
      await send(guesser, ClientCommand.RoomJoin, {
        roomCode: created.roomCode,
        nickname: 'Tahminci',
        avatar: 'moon',
      }),
    ).toEqual({ ok: false, code: 'RATE_LIMITED', message: 'Too many failed attempts' });
  });

  it('limits room creation per IP', async () => {
    const { url } = await start({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, roomCreate: { capacity: 2, refillPerSecond: 0.001 } },
      },
    });
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(
        await send(await client(url), ClientCommand.RoomCreate, { settings: { maxPlayers: 12 } }),
      );
    }
    expect(results.map((result) => (result.ok ? 'ok' : result.code))).toEqual([
      'ok',
      'ok',
      'RATE_LIMITED',
    ]);
  });

  it('limits commands per connection', async () => {
    const { url } = await start();
    const socket = await client(url);
    const results = await Promise.all(
      Array.from({ length: 40 }, () => send(socket, ClientCommand.TimeSync, { clientTime: 1 })),
    );
    const limited = results.filter((result) => !result.ok && result.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThan(0);
    expect(results.filter((result) => result.ok).length).toBeGreaterThanOrEqual(
      DEFAULT_RATE_LIMITS.command.capacity,
    );
  });

  it('refuses new connections from an IP that opens too many', async () => {
    const { url } = await start({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, connection: { capacity: 3, refillPerSecond: 0.001 } },
      },
    });
    for (let i = 0; i < 3; i++) await client(url);
    await expect(connect(url)).rejects.toThrow('RATE_LIMITED');
  });
});
