import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { contentItemInputSchema, contentListQuerySchema, type ContentItem } from '@loudroom/shared';
import { parseRequest } from '../http/api-exception.js';
import { AdminGuard, CurrentAdmin, type AdminContext } from './admin.guard.js';
import { ContentService } from './content.service.js';

@Controller('admin/content')
@UseGuards(AdminGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.content.list(parseRequest(contentListQuerySchema, query));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ContentItem> {
    return this.content.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminContext, @Body() body: unknown): Promise<ContentItem> {
    return this.content.create(parseRequest(contentItemInputSchema, body), admin.user.id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<ContentItem> {
    return this.content.update(id, parseRequest(contentItemInputSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.content.remove(id);
  }
}
