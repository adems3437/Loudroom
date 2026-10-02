import { ClientCommand, ServerEvent } from '@loudroom/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  connect,
  connectRefused,
  nextEvent,
  resetRedis,
  sendOk,
  startTestApp,
  type TestApp,
  type TestSocket,
} from './support.js';

/**
 * This test boots a second app; with every package's tests running in parallel that can take
 * longer than the usual 5 s event wait.
 */
const RESTART_WAIT_MS = 14_000;

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

    const late = await connectRefused(testApp.url, joined.playerToken);
    sockets.push(late.socket);
    expect(late.error).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it(
    'continues rooms after a server restart: host and players resume their sessions',
    {
      timeout: 30_000,
    },
    async () => {
      const first = await startTestApp();
      const host = await connect(first.url);
      const created = await sendOk(host, ClientCommand.RoomCreate, {
        settings: { maxPlayers: 12 },
      });
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
      const hostState = await nextEvent(
        resumedHost,
        ServerEvent.RoomState,
        () => true,
        RESTART_WAIT_MS,
      );
      expect(hostState).toMatchObject({ code: created.roomCode, hostConnected: true });
      // Nobody survived the restart yet: the player is waiting to reconnect, slot kept.
      expect(hostState.players).toEqual([
        expect.objectContaining({ id: joined.playerId, connected: false, ready: true }),
      ]);

      const back = nextEvent(
        resumedHost,
        ServerEvent.PlayerReconnected,
        () => true,
        RESTART_WAIT_MS,
      );
      const resumedPlayer = await client(second.url, joined.playerToken);
      expect((await back).playerId).toBe(joined.playerId);
      const playerState = await nextEvent(
        resumedPlayer,
        ServerEvent.RoomState,
        () => true,
        RESTART_WAIT_MS,
      );
      expect(playerState.players[0]).toMatchObject({
        id: joined.playerId,
        connected: true,
      });
    },
  );
});
