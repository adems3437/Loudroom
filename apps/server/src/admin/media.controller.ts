import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  altTextSchema,
  mediaUpdateSchema,
  paginationQuerySchema,
  type MediaItem,
} from '@loudroom/shared';
import { z } from 'zod';
import { ApiException, parseRequest } from '../http/api-exception.js';
import { AdminGuard, CurrentAdmin, type AdminContext } from './admin.guard.js';
import { MediaService, type UploadedFile as StoredUpload } from './media.service.js';

const uploadFieldsSchema = z.object({ altText: altTextSchema.optional() });

@Controller('admin/media')
@UseGuards(AdminGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(@Query() query: unknown) {
    const { page, pageSize } = parseRequest(paginationQuerySchema, query);
    return this.media.list(page, pageSize);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MediaItem> {
    return this.media.get(id);
  }

  /** multipart/form-data: `file` plus an optional `altText`. Size limit from MEDIA_MAX_UPLOAD_BYTES. */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentAdmin() admin: AdminContext,
    @UploadedFile() file: StoredUpload | undefined,
    @Body() body: unknown,
  ): Promise<MediaItem> {
    if (!file) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'No file', [
        { path: ['file'], code: 'required', message: 'A file is required' },
      ]);
    }
    const { altText } = parseRequest(uploadFieldsSchema, body);
    return this.media.upload(file, altText || null, admin.user.id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<MediaItem> {
    const { altText } = parseRequest(mediaUpdateSchema, body);
    return this.media.update(id, altText || null);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.media.remove(id);
  }
}
