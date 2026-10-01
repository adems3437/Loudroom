import { ClientCommand, ServerEvent } from '@loudroom/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  connect,
  nextEvent,
  resetRedis,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

describe('room recovery', () => {
  const apps: TestApp[] = [];
  const sockets: TestSocket[] = [];

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
    for (const app of apps.splice(0)) await app.app.close();
  });

  it('frees the slot when a player does not return within the grace period', async () => {
    const testApp = await startTestApp({ env: { PLAYER_RECONNECT_GRACE_MS: '300' } });
    apps.push(testApp);
    const host = await client(testApp.url);
    const created = await sendOk(host, ClientCommand.RoomCreate, { settings: { maxPlayers: 12 } });
    const player = await client(testApp.url);
    const joined = await sendOk(player, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname: 'Kaan',
      avatar: 'pill',
    });

    const left = nextEvent(host, ServerEvent.PlayerLeft);
    const started = Date.now();
    player.close();

    expect(await left).toEqual({ playerId: joined.playerId, nickname: 'Kaan', reason: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);

    const late = await client(testApp.url, joined.playerToken);
    expect(await nextEvent(late, ServerEvent.Error)).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('continues rooms after a server restart: host and players resume their sessions', async () => {
    const first = await startTestApp();
    const host = await connect(first.url);
    const created = await sendOk(host, ClientCommand.RoomCreate, { settings: { maxPlayers: 12 } });
    const player = await connect(first.url);
    const joined = await sendOk(player, ClientCommand.RoomJoin, {
      roomCode: created.roomCode,
      nickname: 'Deniz',
      avatar: 'flower',
    });
    await sendOk(player, ClientCommand.PlayerReady, { ready: true });
    await first.app.close();
    host.close();
    player.close();

    const second = await startTestApp();
    apps.push(second);

    const resumedHost = await client(second.url, created.hostToken);
    const hostState = await nextEvent(resumedHost, ServerEvent.RoomState);
    expect(hostState).toMatchObject({ code: created.roomCode, hostConnected: true });
    // Nobody survived the restart yet: the player is waiting to reconnect, slot kept.
    expect(hostState.players).toEqual([
      expect.objectContaining({ id: joined.playerId, connected: false, ready: true }),
    ]);

    const back = nextEvent(resumedHost, ServerEvent.PlayerReconnected);
    const resumedPlayer = await client(second.url, joined.playerToken);
    expect((await back).playerId).toBe(joined.playerId);
    expect((await nextEvent(resumedPlayer, ServerEvent.RoomState)).players[0]).toMatchObject({
      id: joined.playerId,
      connected: true,
    });
  });
});
