import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { LocalMediaStorage, MediaStorage } from '../media/media-storage.js';
import { AdminSessionStore } from './admin-session.store.js';
import { AdminGuard } from './admin.guard.js';
import { AuthController } from './auth.controller.js';
import { CategoriesController } from './categories.controller.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { OverviewController } from './overview.controller.js';
import { PacksController, PublicPacksController } from './packs.controller.js';
import { PacksService } from './packs.service.js';
import { UsersController } from './users.controller.js';
import { SessionsController, StatsController } from '../history/history.controller.js';
import { RetentionService } from '../history/retention.service.js';
import { SessionsService } from '../history/sessions.service.js';
import { StatsService } from '../history/stats.service.js';
import { ImportController } from '../import/import.controller.js';
import { ImportService } from '../import/import.service.js';

/**
 * Admin panel API (SPEC §15 Phase 4, 9): content, media, packs, users, import, game history
 * and statistics, and the public pack list for hosts.
 */
@Module({
  imports: [
    // Uploads stay in memory until checked; each kind's own limit is applied by its service.
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        limits: {
          fileSize: Math.max(config.media.maxUploadBytes, config.media.maxVideoBytes),
          files: 1,
          fields: 5,
          parts: 6,
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    OverviewController,
    CategoriesController,
    ContentController,
    MediaController,
    PacksController,
    PublicPacksController,
    UsersController,
    ImportController,
    SessionsController,
    StatsController,
  ],
  providers: [
    ImportService,
    SessionsService,
    StatsService,
    RetentionService,
    AdminSessionStore,
    AdminGuard,
    ContentService,
    MediaService,
    PacksService,
    { provide: MediaStorage, useClass: LocalMediaStorage },
  ],
})
export class AdminModule {}
