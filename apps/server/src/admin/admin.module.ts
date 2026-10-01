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

/** Admin panel API (SPEC §15 Phase 4) and the public pack list for hosts. */
@Module({
  imports: [
    // Uploads stay in memory: they are re-encoded before anything touches the disk.
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        limits: { fileSize: config.media.maxUploadBytes, files: 1, fields: 5, parts: 6 },
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
  ],
  providers: [
    AdminSessionStore,
    AdminGuard,
    ContentService,
    MediaService,
    PacksService,
    { provide: MediaStorage, useClass: LocalMediaStorage },
  ],
})
export class AdminModule {}
