import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MEDIA_URL_PREFIX } from '@loudroom/game-sdk';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { RedisIoAdapter, socketAdapterKey } from './realtime/redis-io.adapter.js';
import { RedisService } from './redis/redis.service.js';

/** Builds the fully configured app without listening; shared by main.ts and the tests. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config),
    config.nodeEnv === 'test' ? { logger: ['error', 'warn'] } : {},
  );
  app.use(helmet());
  app.use(cookieParser());
  // Uploaded files never change (a new upload gets a new id), so they can be cached forever.
  app.useStaticAssets(config.media.dir, {
    prefix: `${MEDIA_URL_PREFIX}/`,
    immutable: true,
    maxAge: '365d',
    index: false,
    dotfiles: 'deny',
  });
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useWebSocketAdapter(
    new RedisIoAdapter(
      app,
      app.get(RedisService),
      config.corsOrigins,
      socketAdapterKey(config.redisUrl),
    ),
  );
  app.enableShutdownHooks();
  return app;
}
