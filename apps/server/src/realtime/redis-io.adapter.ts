import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import type { RedisService } from '../redis/redis.service.js';

/** Socket.IO server with CORS from config and the Redis adapter for future multi-instance use. */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
    private readonly corsOrigins: string[],
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
      createAdapter(this.redis.createPubSubConnection(), this.redis.createPubSubConnection()),
    );
    return server;
  }
}
