import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  contentStatsQuerySchema,
  sessionListQuerySchema,
  statsQuerySchema,
  topContentQuerySchema,
  type AdminStats,
  type ContentStat,
  type SessionDetail,
} from '@loudroom/shared';
import { AdminGuard, AdminOnly } from '../admin/admin.guard.js';
import { parseRequest } from '../http/api-exception.js';
import { SessionsService } from './sessions.service.js';
import { StatsService } from './stats.service.js';

@Controller('admin/sessions')
@UseGuards(AdminGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.sessions.list(parseRequest(sessionListQuerySchema, query));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SessionDetail> {
    return this.sessions.get(id);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sessions.remove(id);
  }
}

@Controller('admin/stats')
@UseGuards(AdminGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  overview(@Query() query: unknown): Promise<AdminStats> {
    return this.stats.overview(parseRequest(statsQuerySchema, query).days);
  }

  @Get('content')
  content(@Query() query: unknown): Promise<ContentStat[]> {
    return this.stats.content(parseRequest(contentStatsQuerySchema, query).ids);
  }

  @Get('content/top')
  top(@Query() query: unknown): Promise<ContentStat[]> {
    return this.stats.top(parseRequest(topContentQuerySchema, query));
  }
}
