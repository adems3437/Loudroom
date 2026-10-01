import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Redis, type Command } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

const logger = new Logger('Redis');

/**
 * Connection for libraries that send commands without handling failures, such as the Socket.IO
 * Redis adapter. A failed command is logged instead of becoming an unhandled rejection, which
 * would crash the process during a Redis outage.
 */
class ObservedRedis extends Redis {
  override sendCommand(command: Command, stream?: Parameters<Redis['sendCommand']>[1]): unknown {
    const result = super.sendCommand(command, stream);
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        logger.warn(
          `${command.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
    return result;
  }
}

/**
 * Logs when a connection goes down and when it recovers — once per outage, not on every
 * reconnect attempt. Without an error listener ioredis prints every failed attempt itself.
 */
function logConnectionState(connection: Redis, name: string): Redis {
  let failing = false;
  connection.on('error', (error: Error) => {
    if (failing) return;
    failing = true;
    logger.error(`${name} connection failed: ${error.message}`);
  });
  connection.on('ready', () => {
    if (!failing) return;
    failing = false;
    logger.log(`${name} connection restored`);
  });
  return connection;
}

/** Owns every Redis connection of the process so they are all closed on shutdown. */
@Injectable()
export class RedisService implements OnApplicationShutdown {
  readonly client: Redis;
  private readonly pubSubConnections: Redis[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = logConnectionState(
      new Redis(config.redisUrl, { maxRetriesPerRequest: 3 }),
      'Redis',
    );
  }

  /** A connection for pub/sub; its commands wait for Redis to come back instead of failing. */
  createPubSubConnection(): Redis {
    const connection = logConnectionState(
      new ObservedRedis(this.config.redisUrl, { maxRetriesPerRequest: null }),
      'Redis pub/sub',
    );
    this.pubSubConnections.push(connection);
    return connection;
  }

  // Runs after the Socket.IO server has closed, so the adapter can still unsubscribe cleanly.
  async onApplicationShutdown(): Promise<void> {
    // quit() waits for pending replies; a connection that is not ready has none and would hang.
    await Promise.allSettled(
      [this.client, ...this.pubSubConnections].map(async (connection) => {
        if (connection.status === 'ready') await connection.quit();
        else connection.disconnect();
      }),
    );
  }
}
