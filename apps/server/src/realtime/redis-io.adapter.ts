import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import type { RedisService } from '../redis/redis.service.js';

/**
 * Pub/sub channels are shared by all Redis DB indexes, so the channel prefix includes the DB
 * index: servers on different DBs (e.g. the dev stack and the test suite) never hear each other.
 */
export function socketAdapterKey(redisUrl: string): string {
  const db = new URL(redisUrl).pathname.slice(1) || '0';
  return `socket.io:${db}`;
}

/** Socket.IO server with CORS from config and the Redis adapter for future multi-instance use. */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
    private readonly corsOrigins: string[],
    private readonly adapterKey: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // Nest passes only the options set on the gateway; socket.io fills in the rest.
    const server: Server = super.createIOServer(port, {
      ...options,
      serveClient: false,
      cors: { origin: this.corsOrigins, credentials: true },
    } as ServerOptions);
    server.adapter(
      createAdapter(this.redis.createPubSubConnection(), this.redis.createPubSubConnection(), {
        key: this.adapterKey,
      }),
    );
    return server;
  }
}
