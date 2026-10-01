import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';
import { RedisService } from './redis/redis.service.js';

/** Builds the fully configured app without listening; shared by main.ts and the tests. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(
    AppModule.register(config),
    config.nodeEnv === 'test' ? { logger: ['error', 'warn'] } : {},
  );
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get(RedisService), config.corsOrigins));
  app.enableShutdownHooks();
  return app;
}
