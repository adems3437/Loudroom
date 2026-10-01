import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type {
  Ack,
  ClientCommand,
  ClientToServerEvents,
  CommandRequest,
  CommandResult,
  ServerEvent,
  ServerEventPayload,
  ServerToClientEvents,
} from '@loudroom/shared';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { inject } from 'vitest';
import { createApp } from '../src/bootstrap.js';
import { loadAppConfig, type AppConfig } from '../src/config/app-config.js';

export interface TestApp {
  app: INestApplication;
  url: string;
  config: AppConfig;
}

export interface TestAppOptions {
  env?: Record<string, string>;
  config?: Partial<AppConfig>;
}

/** Starts the real app on a random local port against the test database and Redis. */
export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = {
    ...loadAppConfig({
      NODE_ENV: 'test',
      DATABASE_URL: inject('databaseUrl'),
      REDIS_URL: inject('redisUrl'),
      PUBLIC_URL: 'http://localhost:3000',
      IP_HASH_SECRET: 'test-secret-for-ip-hashing',
      MEDIA_DIR: join(tmpdir(), `loudroom-test-media-${randomUUID()}`),
      ...options.env,
    }),
    ...options.config,
  };
  const app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl(), config };
}

/** A URL on a local port nothing listens on, for simulating an unreachable dependency. */
export function unreachable(protocol: 'postgresql' | 'redis'): string {
  return protocol === 'postgresql'
    ? 'postgresql://loudroom:loudroom@127.0.0.1:1/loudroom'
    : 'redis://127.0.0.1:1/0';
}

/** Empties the test Redis DB (rooms, tokens, rate-limit buckets). */
export async function resetRedis(): Promise<void> {
  const redis = new Redis(inject('redisUrl'));
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Connects a client like the browser does, optionally resuming a session by token. */
export async function connect(url: string, token?: string): Promise<TestSocket> {
  const socket: TestSocket = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: token ? { token } : {},
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

/**
 * Connects with a token the server is expected to refuse and resolves with the session error.
 * The listener is attached before the handshake: the error can arrive right after `connect`.
 */
export async function connectRefused(
  url: string,
  token: string,
): Promise<{ socket: TestSocket; error: ServerEventPayload<'error'> }> {
  const socket: TestSocket = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { token },
  });
  const untyped = socket as unknown as Socket<Record<string, (payload: unknown) => void>>;
  const error = await new Promise<ServerEventPayload<'error'>>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timed out waiting for the session error'));
    }, 5000);
    untyped.once('error', (payload) => {
      clearTimeout(timer);
      resolve(payload as ServerEventPayload<'error'>);
    });
    socket.once('connect_error', reject);
  });
  return { socket, error };
}

export function send<C extends ClientCommand>(
  socket: TestSocket,
  command: C,
  payload: CommandRequest<C>,
): Promise<Ack<CommandResult<C>>> {
  // The typed event map cannot express a generic command; the call itself is fully typed.
  const untyped = socket as unknown as Socket;
  return untyped.emitWithAck(command, payload) as Promise<Ack<CommandResult<C>>>;
}

/** Sends a command that must succeed and returns its data. */
export async function sendOk<C extends ClientCommand>(
  socket: TestSocket,
  command: C,
  payload: CommandRequest<C>,
): Promise<CommandResult<C>> {
  const result = await send(socket, command, payload);
  if (!result.ok) throw new Error(`${command} failed: ${result.code} ${result.message}`);
  return result.data;
}

/** Resolves with the next `event` whose payload satisfies `match`. */
export function nextEvent<E extends ServerEvent>(
  socket: TestSocket,
  event: E,
  match: (payload: ServerEventPayload<E>) => boolean = () => true,
  timeoutMs = 5000,
): Promise<ServerEventPayload<E>> {
  const untyped = socket as unknown as Socket<Record<string, (payload: unknown) => void>>;
  const name: string = event;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      untyped.off(name, listener);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (raw: unknown) => {
      const payload = raw as ServerEventPayload<E>;
      if (!match(payload)) return;
      clearTimeout(timer);
      untyped.off(name, listener);
      resolve(payload);
    };
    untyped.on(name, listener);
  });
}

/** Resolves once the server closes this connection. */
export function disconnected(socket: TestSocket, timeoutMs = 5000): Promise<void> {
  if (socket.disconnected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timed out waiting for disconnect'));
    }, timeoutMs);
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
