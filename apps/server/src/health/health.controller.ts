import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Unthrottled } from '../http/rest-rate-limit.guard.js';
import { HealthService, type HealthReport } from './health.service.js';

@Controller('health')
@Unthrottled()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 200 when PostgreSQL and Redis both answer, 503 with the same report otherwise. */
  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') throw new ServiceUnavailableException(report);
    return report;
  }
}
