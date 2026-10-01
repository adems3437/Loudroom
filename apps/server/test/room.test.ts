import {
  ClientCommand,
  ServerEvent,
  type HostRoomState,
  type PlayerRoomState,
} from '@loudroom/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  connect,
  disconnected,
  nextEvent,
  resetRedis,
  send,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

describe('rooms and lobby', () => {
  let testApp: TestApp;
  const sockets: TestSocket[] = [];

  async function client(token?: string): Promise<TestSocket> {
    const socket = await connect(testApp.url, token);
    sockets.push(socket);
    return socket;
  }

  async function createRoom(maxPlayers = 12) {
    const host = await client();
    const state = nextEvent(host, ServerEvent.RoomState);
    const created = await sendOk(host, ClientCommand.RoomCreate, { settings: { maxPlayers } });
    return { host, created, state: (await state) as HostRoomState };
  }

  async function joinRoom(roomCode: string, nickname: string) {
    const socket = await client();
    const joined = await sendOk(socket, ClientCommand.RoomJoin, {
      roomCode,
      nickname,
      avatar: 'star',
    });
    return { socket, joined };
  }

  beforeAll(async () => {
    await resetRedis();
    testApp = await startTestApp();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetRedis();
  });

  it('creates a room with a 6-digit code, a host token and a join link', async () => {
    const { created, state } = await createRoom(8);

    expect(created.roomCode).toMatch(/^[1-9]\d{5}$/);
    expect(created.hostToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.joinUrl).toBe(`http://localhost:3000/play/${created.roomCode}`);
    expect(state).toMatchObject({
      role: 'host',
      code: created.roomCode,
      status: 'LOBBY',
      locked: false,
      settings: { maxPlayers: 8 },
      hostConnected: true,
      joinUrl: created.joinUrl,
      players: [],
    });
  });

  it('shows joining players to the host and to each other in real time', async () => {
    const { host, created } = await createRoom();

    const hostSeesAyse = nextEvent(host, ServerEvent.PlayerJoined);
    const ayse = await joinRoom(created.roomCode, 'Ayşe');
    expect((await hostSeesAyse).player).toMatchObject({
      id: ayse.joined.playerId,
      nickname: 'Ayşe',
      avatar: 'star',
      ready: false,
      connected: true,
      score: 0,
    });

    const hostState = nextEvent(host, ServerEvent.RoomState, (s) => s.players.length === 2);
    const ayseState = nextEvent(ayse.socket, ServerEvent.RoomState, (s) => s.players.length === 2);
    const mehmet = await joinRoom(created.roomCode, 'Mehmet');

    const seenByHost = await hostState;
    const seenByAyse = (await ayseState) as PlayerRoomState;
    expect(seenByHost.players.map((p) => p.nickname)).toEqual(['Ayşe', 'Mehmet']);
    expect(seenByAyse.role).toBe('player');
    expect(seenByAyse.players.map((p) => p.id)).toEqual([
      ayse.joined.playerId,
      mehmet.joined.playerId,
    ]);
    // Distinct colors, assigned by the server.
    expect(new Set(seenByHost.players.map((p) => p.color)).size).toBe(2);
  });

  it('enforces Turkish-aware nickname uniqueness and the profanity filter', async () => {
    const { created } = await createRoom();
    await joinRoom(created.roomCode, 'İrem');

    const other = await client();
    const taken = await send(other, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname: 'irem',
      avatar: 'moon',
    });
    expect(taken).toMatchObject({ ok: false, code: 'NICKNAME_TAKEN' });

    const rude = await send(other, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname: 'S1ktir',
      avatar: 'moon',
    });
    expect(rude).toMatchObject({ ok: false, code: 'NICKNAME_REJECTED' });

    const tooShort = await send(other, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname: ' x​ ',
      avatar: 'moon',
    });
    expect(tooShort).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('never lets more players in than the room allows, even when they join at once', async () => {
    const { created } = await createRoom(12);
    const clients = await Promise.all(Array.from({ length: 20 }, () => client()));

    const results = await Promise.all(
      clients.map((socket, index) =>
        send(socket, ClientCommand.RoomJoin, {
          roomCode: created.roomCode,
          nickname: `Oyuncu ${index + 1}`,
          avatar: 'circle',
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(12);
    expect(results.filter((result) => !result.ok && result.code === 'ROOM_FULL')).toHaveLength(8);
  });

  it('tracks ready state and nickname/avatar changes', async () => {
    const { host, created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');
    await joinRoom(created.roomCode, 'Zeynep');

    const readyState = nextEvent(host, ServerEvent.RoomState, (s) =>
      s.players.some((p) => p.id === ayse.joined.playerId && p.ready),
    );
    await sendOk(ayse.socket, ClientCommand.PlayerReady, { ready: true });
    await readyState;

    const renamed = nextEvent(host, ServerEvent.RoomState, (s) =>
      s.players.some((p) => p.nickname === 'Ayşe Nur'),
    );
    await sendOk(ayse.socket, ClientCommand.PlayerUpdate, { nickname: 'Ayşe Nur', avatar: 'moon' });
    expect((await renamed).players[0]).toMatchObject({ nickname: 'Ayşe Nur', avatar: 'moon' });

    const clash = await send(ayse.socket, ClientCommand.PlayerUpdate, { nickname: 'ZEYNEP' });
    expect(clash).toMatchObject({ ok: false, code: 'NICKNAME_TAKEN' });
  });

  it('keeps a disconnected player’s slot and restores it from the token', async () => {
    const { host, created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');

    const goneState = nextEvent(host, ServerEvent.RoomState, (s) =>
      s.players.some((p) => p.id === ayse.joined.playerId && !p.connected),
    );
    ayse.socket.close();
    await goneState;

    const back = nextEvent(host, ServerEvent.PlayerReconnected);
    const backState = nextEvent(host, ServerEvent.RoomState, (s) =>
      s.players.some((p) => p.id === ayse.joined.playerId && p.connected),
    );
    const resumed = await client(ayse.joined.playerToken);
    const ownState = await nextEvent(resumed, ServerEvent.RoomState);

    expect((await back).playerId).toBe(ayse.joined.playerId);
    expect((await backState).players).toHaveLength(1);
    expect(ownState.players.map((p) => p.id)).toEqual([ayse.joined.playerId]);
    // The resumed connection acts as the same player.
    await sendOk(resumed, ClientCommand.PlayerReady, { ready: true });
  });

  it('marks the host offline and back online, resuming via the host token', async () => {
    const { host, created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');

    const hostGone = nextEvent(ayse.socket, ServerEvent.RoomState, (s) => !s.hostConnected);
    host.close();
    await hostGone;

    const hostBack = nextEvent(ayse.socket, ServerEvent.RoomState, (s) => s.hostConnected);
    const resumedHost = await client(created.hostToken);
    const state = (await nextEvent(resumedHost, ServerEvent.RoomState)) as HostRoomState;
    await hostBack;
    expect(state).toMatchObject({ role: 'host', code: created.roomCode, joinUrl: created.joinUrl });
    await sendOk(resumedHost, ClientCommand.RoomLock, { locked: true });
  });

  it('ends an older connection when the same session connects again', async () => {
    const { created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');

    const replaced = nextEvent(ayse.socket, ServerEvent.Error);
    const closed = disconnected(ayse.socket);
    const second = await client(ayse.joined.playerToken);

    expect(await replaced).toMatchObject({ code: 'SESSION_REPLACED' });
    await closed;
    const state = await nextEvent(second, ServerEvent.RoomState);
    expect(state.players).toEqual([
      expect.objectContaining({ id: ayse.joined.playerId, connected: true }),
    ]);
  });

  it('lets the host kick a player, whose token then stops working', async () => {
    const { host, created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');
    const mehmet = await joinRoom(created.roomCode, 'Mehmet');

    const kickedNotice = nextEvent(mehmet.socket, ServerEvent.Error);
    const kickedClosed = disconnected(mehmet.socket);
    const left = nextEvent(ayse.socket, ServerEvent.PlayerLeft);
    await sendOk(host, ClientCommand.RoomKick, { playerId: mehmet.joined.playerId });

    expect(await kickedNotice).toMatchObject({ code: 'KICKED' });
    await kickedClosed;
    expect(await left).toEqual({
      playerId: mehmet.joined.playerId,
      nickname: 'Mehmet',
      reason: 'kicked',
    });

    const retry = await client(mehmet.joined.playerToken);
    expect(await nextEvent(retry, ServerEvent.Error)).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await send(retry, ClientCommand.PlayerReady, { ready: true })).toMatchObject({
      ok: false,
      code: 'NOT_IN_ROOM',
    });
  });

  it('refuses new players in a locked room but lets existing ones reconnect', async () => {
    const { host, created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');
    await sendOk(host, ClientCommand.RoomLock, { locked: true });

    const newcomer = await client();
    expect(
      await send(newcomer, ClientCommand.RoomJoin, {
        roomCode: created.roomCode,
        nickname: 'Ali',
        avatar: 'cloud',
      }),
    ).toMatchObject({ ok: false, code: 'ROOM_LOCKED' });

    ayse.socket.close();
    const resumed = await client(ayse.joined.playerToken);
    expect((await nextEvent(resumed, ServerEvent.RoomState)).locked).toBe(true);
  });

  it('lets a player leave, freeing the slot and nickname', async () => {
    const { host, created } = await createRoom();
    const ayse = await joinRoom(created.roomCode, 'Ayşe');

    const left = nextEvent(host, ServerEvent.PlayerLeft);
    await sendOk(ayse.socket, ClientCommand.RoomLeave, {});
    expect(await left).toMatchObject({ playerId: ayse.joined.playerId, reason: 'left' });

    await joinRoom(created.roomCode, 'Ayşe');
  });
});
