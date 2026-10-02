import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';

const logger = new Logger('SessionRetention');
const DAY_MS = 24 * 60 * 60 * 1000;
/** First run shortly after start, then daily. */
const FIRST_RUN_MS = 60_000;

/**
 * Keeps game history only as long as configured (SPEC §9 KVKK): sessions older than
 * SESSION_RETENTION_DAYS are deleted with their players, answers and scores. Games left
 * ACTIVE for over a day (the room expired mid-game) are marked ABORTED. Running it on more
 * than one instance is harmless.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    const run = (delay: number) => {
      this.timer = setTimeout(() => {
        this.purge()
          .catch((error: unknown) => {
            logger.warn(`purge failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(() => {
            run(DAY_MS);
          });
      }, delay);
      this.timer.unref();
    };
    run(FIRST_RUN_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  async purge(now = new Date()): Promise<{ deleted: number; aborted: number }> {
    const aborted = await this.prisma.gameSession.updateMany({
      where: { status: 'ACTIVE', startedAt: { lt: new Date(now.getTime() - DAY_MS) } },
      data: { status: 'ABORTED' },
    });
    const days = this.config.sessionRetentionDays;
    const deleted =
      days > 0
        ? await this.prisma.gameSession.deleteMany({
            where: { startedAt: { lt: new Date(now.getTime() - days * DAY_MS) } },
          })
        : { count: 0 };
    if (deleted.count > 0 || aborted.count > 0) {
      logger.log(`history: ${deleted.count} deleted, ${aborted.count} marked aborted`);
    }
    return { deleted: deleted.count, aborted: aborted.count };
  }
}
