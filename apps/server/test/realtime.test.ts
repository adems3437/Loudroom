import {
  ClientCommand,
  ackSchema,
  timeSyncResponseSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@loudroom/shared';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { startTestApp, type TestApp } from './support.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('realtime gateway', () => {
  let testApp: TestApp;
  let socket: ClientSocket;

  beforeAll(async () => {
    testApp = await startTestApp();
    socket = io(testApp.url, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
  });

  afterAll(async () => {
    socket.close();
    await testApp.app.close();
  });

  it('answers time:sync with the echoed client time and the current server time', async () => {
    const clientTime = Date.now();
    const before = Date.now();
    const result = await socket.emitWithAck(ClientCommand.TimeSync, { clientTime });
    const after = Date.now();

    const parsed = ackSchema(timeSyncResponseSchema).parse(result);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.clientTime).toBe(clientTime);
    expect(parsed.data.serverTime).toBeGreaterThanOrEqual(before);
    expect(parsed.data.serverTime).toBeLessThanOrEqual(after);
  });

  it.each([
    ['a wrong type', { clientTime: 'now' }],
    ['unknown fields', { clientTime: 1, serverTime: 2 }],
    ['no payload', undefined],
  ])('rejects a time:sync payload with %s', async (_label, payload) => {
    // Deliberately bypasses the typed event map to send what a malicious client could.
    const untyped = socket as unknown as Socket;
    const result: unknown = await untyped.emitWithAck(ClientCommand.TimeSync, payload);
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('routes Socket.IO through the Redis adapter', async () => {
    const redis = new Redis(inject('redisUrl'));
    try {
      // The adapter subscribes to its request channel for the default namespace.
      const channels = await redis.pubsub('CHANNELS', 'socket.io-request#*');
      expect(channels).toContain('socket.io-request#/#');
    } finally {
      await redis.quit();
    }
  });
});
