import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { RestRateLimitGuard } from './http/rest-rate-limit.guard.js';
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
        AdminModule,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_GUARD, useClass: RestRateLimitGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
      exports: [APP_CONFIG],
    };
  }
}
