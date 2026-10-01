import { Module, type DynamicModule } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RoomModule } from './room/room.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        PrismaModule,
        RedisModule,
        RateLimitModule,
        ModerationModule,
        HealthModule,
        RealtimeModule,
        RoomModule,
      ],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
